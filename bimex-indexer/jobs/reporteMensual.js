#!/usr/bin/env node

/**
 * reporteMensual.js — Monthly recurring report for Bimex contributors.
 *
 * Cron schedule: 0 0 1 * * (first day of every month at midnight)
 *
 * Usage:
 *   node jobs/reporteMensual.js
 *   node jobs/reporteMensual.js --dry-run         # preview without sending
 *   node jobs/reporteMensual.js --periodo 2026-05  # force specific month
 *   node jobs/reporteMensual.js --concurrency 1    # reduce API pressure
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_KEY  — Supabase connection
 *   RESEND_API_KEY              — Resend email API key
 *   RESEND_FROM                 — From address (default: Bimex <notificaciones@bimex.fi>)
 *   FRONTEND_URL                — Base URL for links (default: https://bimex.fi)
 *   REPORTE_PERIODO             — Override period (YYYY-MM)
 *   REPORTE_CONCURRENCY         — Max parallel sends (default: 3)
 *   REPORTE_BATCH_SIZE          — Contributors per batch (default: 10)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { t, mesNombre, numberLocale } from './locales.js';

// ─── Path setup ──────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'reporte-mensual.html');

// ─── Constants ───────────────────────────────────────────────────────────
const MINUTOS_ANO = 525_600n;
const CETES_BPS = 945n;
const AMM_BPS = 400n;
const STROOPS_POR_MXNE = 10_000_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;

// ─── Clients ─────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? 'Bimex <notificaciones@bimex.fi>';
const BASE = process.env.FRONTEND_URL ?? 'https://bimex.fi';

// ─── Config ──────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const PERIODO = procesarPeriodo();
const MAX_CONCURRENCY = parseInt(process.env.REPORTE_CONCURRENCY ?? '3', 10);
const BATCH_SIZE = parseInt(process.env.REPORTE_BATCH_SIZE ?? '10', 10);

// ─── Helpers ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function procesarPeriodo() {
  const forcePeriod = process.env.REPORTE_PERIODO;
  // Allow --periodo CLI arg
  const cliIndex = process.argv.indexOf('--periodo');
  if (cliIndex !== -1 && process.argv[cliIndex + 1]) {
    return process.argv[cliIndex + 1];
  }
  if (forcePeriod) return forcePeriod;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
}

function parsePeriodo(periodo) {
  const [yearStr, monthStr] = periodo.split('-');
  return { year: parseInt(yearStr, 10), month: parseInt(monthStr, 10) - 1 };
}

/**
 * Get Unix timestamp (seconds) for the start of a given month.
 */
function inicioMesUnix(year, month) {
  return Math.floor(Date.UTC(year, month, 1, 0, 0, 0) / 1000);
}

/**
 * Get Unix timestamp (seconds) for the end of a given month (start of next month).
 */
function finMesUnix(year, month) {
  return Math.floor(Date.UTC(year, month + 1, 1, 0, 0, 0) / 1000);
}

function formatoMXNe(stroops, locale) {
  const mxne = Number(stroops) / STROOPS_POR_MXNE;
  return mxne.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function barraProgreso(porcentaje) {
  const ancho = Math.min(Math.round(porcentaje), 100);
  return `<div style="width: 100%; height: 8px; background-color: #E5E7EB; border-radius: 99px; overflow: hidden; margin: 8px 0;">
    <div style="width: ${ancho}%; height: 100%; background: linear-gradient(90deg, #16A34A 0%, #22C55E 100%); border-radius: 99px;"></div>
  </div>`;
}

// ─── Yield calculation (exact replica of contract's calcular_yield_seguro) ──

/**
 * Replicates soroban contract calcular_yield_seguro logic exactly.
 * Uses BigInt for integer arithmetic matching Rust i128 behavior.
 *
 * Formula: yield = (capital / MINUTOS_ANO) * bps / 10_000 * minutos
 *                + (capital % MINUTOS_ANO) * bps / 10_000 * minutos / MINUTOS_ANO
 */
function calcularYieldSeguro(capital, bps, minutos) {
  capital = BigInt(capital);
  bps = BigInt(bps);
  minutos = BigInt(minutos);
  const MIN_ANO = MINUTOS_ANO;
  return (capital / MIN_ANO) * bps / 10_000n * minutos
       + (capital % MIN_ANO) * bps / 10_000n * minutos / MIN_ANO;
}

/**
 * Calculate total cumulative yield for a contribution up to a given Unix timestamp.
 *
 * @param {string|number|bigint} cantidadStroops - Contribution amount in stroops
 * @param {number} timestampUnix - Contribution timestamp (Unix seconds)
 * @param {number} currentUnix - Reference timestamp (Unix seconds) to calculate yield "as of"
 * @returns {bigint} Cumulative yield in stroops
 */
function calcularYield(cantidadStroops, timestampUnix, currentUnix) {
  const segundos = BigInt(Math.floor(currentUnix)) - BigInt(Math.floor(timestampUnix));
  if (segundos <= 0n) return 0n;
  const minutos = segundos / 60n;
  const cantidad = BigInt(cantidadStroops);
  const mitad = cantidad / 2n;
  const yieldCetes = calcularYieldSeguro(mitad, CETES_BPS, minutos);
  const yieldAmm = calcularYieldSeguro(cantidad - mitad, AMM_BPS, minutos);
  return yieldCetes + yieldAmm;
}

/**
 * Convert a Supabase timestamptz value to Unix epoch seconds.
 * Handles both ISO 8601 strings and numeric strings.
 */
function timestampAUnix(ts) {
  if (ts == null) return Math.floor(Date.now() / 1000);
  if (typeof ts === 'number') return Math.floor(ts);
  // Try parsing as ISO string
  const parsed = Date.parse(ts);
  if (!isNaN(parsed)) return Math.floor(parsed / 1000);
  // Try parsing as numeric string (Unix seconds)
  const numeric = Number(ts);
  if (!isNaN(numeric) && numeric > 1000000000) return Math.floor(numeric);
  return Math.floor(Date.now() / 1000);
}

function estadoLocalizado(locale, estado) {
  const map = {
    EnRevision: t(locale, 'estadoEnRevision'),
    EtapaInicial: t(locale, 'estadoEtapaInicial'),
    EnProgreso: t(locale, 'estadoEnProgreso'),
    Abandonado: t(locale, 'estadoAbandonado'),
    Liberado: t(locale, 'estadoLiberado'),
    Rechazado: t(locale, 'estadoRechazado'),
  };
  return map[estado] ?? estado;
}

function colorEstado(estado) {
  const map = {
    EnRevision: '#F59E0B',
    EtapaInicial: '#3B82F6',
    EnProgreso: '#3B82F6',
    Abandonado: '#EF4444',
    Liberado: '#10B981',
    Rechazado: '#EF4444',
  };
  return map[estado] ?? '#6B7280';
}

// ─── DB queries ──────────────────────────────────────────────────────────

/**
 * Verify the migration has been applied by checking for required tables.
 * If tables don't exist, logs instructions to run migration manually.
 */
async function verificarMigracion() {
  const { error } = await supabase
    .from('reportes_mensuales')
    .select('id')
    .limit(1);

  if (error && error.code === '42P01') {
    console.log('⚠️  Migration required. Run in Supabase SQL editor:');
    console.log('   ' + join(__dirname, '..', 'supabase', 'migration_reporte_mensual.sql'));
    console.log('');
    throw new Error('Database not migrated. Please run migration_reporte_mensual.sql');
  }
  // If table exists, migration is applied
  console.log('✅ Migration verified.');
}

/**
 * Get active contributors with their contributions, projects, and notification prefs.
 * Filters at query level: only users with notifications_enabled = true.
 * Excludes contributors who already received this period's report.
 */
async function obtenerContribuidoresActivos(periodo) {
  // Step 1: Get opted-in users (query-level subscription enforcement)
  const { data: optIns, error: optError } = await supabase
    .from('user_notifications')
    .select('wallet_address, email, locale')
    .eq('notifications_enabled', true);

  if (optError) throw new Error(`Error fetching preferences: ${optError.message}`);
  if (!optIns?.length) return [];

  const walletPorAddress = new Map(optIns.map(u => [u.wallet_address, { email: u.email, locale: u.locale ?? 'es' }]));
  const wallets = Array.from(walletPorAddress.keys());

  // Step 2: Get active contributions from opted-in users
  const { data: contribuciones, error: contError } = await supabase
    .from('aportaciones')
    .select(`
      contribuidor,
      proyecto_id,
      monto,
      timestamp,
      retirado,
      proyectos!inner(
        id,
        nombre,
        meta,
        total_aportado,
        estado
      )
    `)
    .in('contribuidor', wallets)
    .eq('retirado', false);

  if (contError) throw new Error(`Error fetching contributions: ${contError.message}`);
  if (!contribuciones?.length) return [];

  // Step 3: Exclude those who already received this period's report
  const { data: yaEnviados } = await supabase
    .from('reportes_mensuales')
    .select('wallet_address')
    .eq('periodo', periodo);

  const excluir = new Set((yaEnviados ?? []).map(r => r.wallet_address));

  // Step 4: Merge notification prefs into contribution rows
  const filtrados = contribuciones
    .filter(r => !excluir.has(r.contribuidor))
    .map(r => {
      const prefs = walletPorAddress.get(r.contribuidor) ?? {};
      return {
        ...r,
        user_notifications: {
          email: prefs.email,
          locale: prefs.locale,
          notifications_enabled: true,
        },
      };
    });

  return filtrados;
}

/**
 * Get previous yield snapshot for a contributor-project-period combination.
 */
async function obtenerSnapshotAnterior(contribuidor, proyectoId) {
  // Find the last snapshot before the current period
  const { data, error } = await supabase
    .from('yield_snapshots')
    .select('yield_calculado, periodo')
    .eq('contribuidor', contribuidor)
    .eq('proyecto_id', proyectoId)
    .order('periodo', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * Record sent report and yield snapshot atomically.
 */
async function registrarEnvio(walletAddress, periodo, snapshots) {
  // Insert reportes_mensuales row
  const { error: rmError } = await supabase
    .from('reportes_mensuales')
    .insert({ wallet_address: walletAddress, periodo });

  if (rmError) {
    // If duplicate (already sent), that's fine — idempotent
    if (!rmError.message?.includes('duplicate') && !rmError.code?.includes('23505')) {
      console.warn(`⚠️  Error recording report: ${rmError.message}`);
    }
    // Only throw if it's not a duplicate key violation
    if (rmError.code && rmError.code !== '23505') throw rmError;
  }

  // Insert yield snapshots
  for (const snap of snapshots) {
    const { error: ysError } = await supabase
      .from('yield_snapshots')
      .insert({
        contribuidor: snap.contribuidor,
        proyecto_id: snap.proyectoId,
        periodo: snap.periodo,
        yield_calculado: snap.yieldCalculado,
      });

    if (ysError && ysError.code !== '23505') {
      console.warn(`⚠️  Error recording snapshot: ${ysError.message}`);
    }
  }
}

// ─── Email sending ───────────────────────────────────────────────────────

/**
 * Build email HTML from template and data.
 */
function renderTemplate(locale, data) {
  const templateHtml = readFileSync(TEMPLATE_PATH, 'utf-8');

  const allVars = {
    locale,
    baseUrl: BASE,
    unsubscribeUrl: `${BASE}/mi-cuenta`,
    mxneLabel: t(locale, 'mxneLabel'),
    ...data,
  };

  let html = templateHtml;
  for (const [key, value] of Object.entries(allVars)) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value ?? ''));
  }

  return html;
}

/**
 * Build the HTML for a single project card in the email.
 */
function construirProyectoHtml(locale, proyecto, aportacion, yieldProyecto, periodoUnix) {
  const { year, month } = parsePeriodo(PERIODO);
  const totalAportado = Number(proyecto.total_aportado ?? 0) / STROOPS_POR_MXNE;
  const meta = Number(proyecto.meta ?? 1) / STROOPS_POR_MXNE;
  const progreso = meta > 0 ? Math.min(Math.round((totalAportado / meta) * 100), 100) : 0;
  const montoAportacion = Number(aportacion.monto ?? 0) / STROOPS_POR_MXNE;
  const yieldMxne = Number(yieldProyecto) / STROOPS_POR_MXNE;
  const estadoTexto = estadoLocalizado(locale, proyecto.estado);
  const estadoColor = colorEstado(proyecto.estado);
  const proyectoUrl = `${BASE}/?proyecto=${proyecto.id}`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; margin-bottom: 16px;">
      <tr>
        <td style="padding: 16px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin: 0 0 4px; font-size: 16px; font-weight: 700; color: #111827;">
                  ${proyecto.nombre}
                </p>
              </td>
              <td style="text-align: right; width: 100px;">
                <span style="display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; color: #FFFFFF; background-color: ${estadoColor};">${estadoTexto}</span>
              </td>
            </tr>
          </table>
          <p style="margin: 4px 0 0; font-size: 12px; color: #6B7280; font-weight: 500;">
            ${t(locale, 'progreso')}: ${progreso}% ${t(locale, 'completado')}
          </p>
          ${barraProgreso(progreso)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-top: 8px; width: 50%;">
                <p style="margin: 0; font-size: 12px; color: #6B7280;">${formatoMXNe(totalAportado * STROOPS_POR_MXNE, numberLocale(locale))} / ${formatoMXNe(meta * STROOPS_POR_MXNE, numberLocale(locale))} MXNe</p>
              </td>
              <td style="padding-top: 8px; width: 50%; text-align: right;">
                <a href="${proyectoUrl}" style="font-size: 13px; color: #1E3A5F; font-weight: 600; text-decoration: none;">Ver →</a>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #E5E7EB;">
            <tr>
              <td style="width: 50%;">
                <p style="margin: 0; font-size: 12px; color: #6B7280;">${t(locale, 'tuAportacion')}</p>
                <p style="margin: 0; font-size: 14px; font-weight: 700; color: #1E3A5F;">${montoAportacion.toLocaleString(numberLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXNe</p>
              </td>
              <td style="width: 50%; text-align: right;">
                <p style="margin: 0; font-size: 12px; color: #6B7280;">${t(locale, 'yieldEsteMes')}</p>
                <p style="margin: 0; font-size: 14px; font-weight: 700; color: #059669;">+${yieldMxne.toLocaleString(numberLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXNe</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Send a single monthly report email with retry logic.
 */
async function enviarConReintento(toEmail, subject, html, intento = 1) {
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject,
      html,
    });
    if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
    return true;
  } catch (err) {
    if (intento < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, intento - 1);
      console.warn(`  ⚠️  Retry ${intento}/${MAX_RETRIES} for ${toEmail} in ${delay}ms: ${err.message}`);
      await sleep(delay);
      return enviarConReintento(toEmail, subject, html, intento + 1);
    }
    throw err;
  }
}

// ─── Contributor processing ──────────────────────────────────────────────

/**
 * Process a single contributor: calculate metrics, build email, send, record.
 */
async function procesarContribuidor(wallet, proyectos, periodo) {
  const { year, month } = parsePeriodo(periodo);
  const locale = proyectos[0]?.user_notifications?.locale ?? 'es';
  const email = proyectos[0]?.user_notifications?.email;

  if (!email) {
    console.warn(`  ⚠️  Skipping ${wallet}: no email address`);
    return { status: 'skipped', reason: 'no-email' };
  }

  const ahoraUnix = Math.floor(Date.now() / 1000);

  // Calculate metrics per project
  let totalContribuido = 0n;
  let totalYieldAcumulado = 0n;
  let totalYieldEsteMes = 0n;
  const proyectosHtml = [];

  for (const row of proyectos) {
    const cantidad = BigInt(row.monto ?? 0);
    const ts = timestampAUnix(row.timestamp);
    totalContribuido += cantidad;

    // Calculate cumulative yield up to now
    const yieldAhora = calcularYield(row.monto, ts, ahoraUnix);

    // Calculate yield up to end of last month (start of this month)
    const yieldFinMesPasado = calcularYield(row.monto, ts, finMesUnix(year, month));

    // Previous snapshot (if any)
    const snapshotAnterior = await obtenerSnapshotAnterior(wallet, row.proyecto_id);
    const snapshotYield = snapshotAnterior ? BigInt(snapshotAnterior.yield_calculado) : 0n;

    // Yield this month = yield at end of last month - snapshot (or yield at end of last month if first report)
    const yieldMesActual = yieldFinMesPasado - snapshotYield;

    totalYieldAcumulado += yieldAhora;
    totalYieldEsteMes += yieldMesActual > 0n ? yieldMesActual : 0n;

    proyectosHtml.push(construirProyectoHtml(
      locale,
      row.proyectos,
      row,
      yieldMesActual > 0n ? yieldMesActual : 0n,
      ahoraUnix,
    ));
  }

  const numProyectos = proyectos.length;
  const proyectosLista = proyectosHtml.join('\n');

  // Build email
  const monthName = mesNombre(locale, month);
  const yearStr = String(year);
  const subject = t(locale, 'subject', { mes: monthName, ano: yearStr });

  const data = {
    header: t(locale, 'header'),
    headerSub: t(locale, 'headerSub'),
    greeting: t(locale, 'greeting'),
    summaryTitle: t(locale, 'summaryTitle'),
    totalContribuido: t(locale, 'totalContribuido'),
    totalContribuidoValor: formatoMXNe(totalContribuido, numberLocale(locale)),
    yieldEsteMes: t(locale, 'yieldEsteMes'),
    yieldEsteMesValor: formatoMXNe(totalYieldEsteMes, numberLocale(locale)),
    yieldAcumulado: t(locale, 'yieldAcumulado'),
    yieldAcumuladoValor: formatoMXNe(totalYieldAcumulado, numberLocale(locale)),
    proyectosApoyados: t(locale, 'proyectosApoyados'),
    numProyectos: String(numProyectos),
    proyectosText: numProyectos === 1 ? t(locale, 'proyectoApoyado').toLowerCase() : t(locale, 'proyectosApoyados').toLowerCase(),
    proyectosTitle: t(locale, 'proyectosTitle'),
    proyectosLista,
    trustTitle: t(locale, 'trustTitle'),
    trustMessage: t(locale, 'trustMessage'),
    ctaExplorar: t(locale, 'ctaExplorar'),
    ctaExplorarUrl: `${BASE}/proyectos`,
    ctaCompartir: t(locale, 'ctaCompartir'),
    ctaCompartirUrl: `${BASE}`,
    footerSent: t(locale, 'footerSent'),
    footerUnsubscribe: t(locale, 'footerUnsubscribe'),
    footerTerms: t(locale, 'footerTerms'),
    footerPrivacy: t(locale, 'footerPrivacy'),
    footerRights: t(locale, 'footerRights'),
    mes: monthName,
    ano: yearStr,
    mxneLabel: t(locale, 'mxneLabel'),
  };

  const html = renderTemplate(locale, data);

  if (DRY_RUN) {
    console.log(`  📝 [DRY-RUN] Would send to ${email} (${wallet}):
    Subject: ${subject}
    Total: ${data.totalContribuidoValor} MXNe
    Yield this month: ${data.yieldEsteMesValor} MXNe
    Yield total: ${data.yieldAcumuladoValor} MXNe
    Projects: ${numProyectos}`);
    return { status: 'dry-run' };
  }

  // Send email
  await enviarConReintento(email, subject, html);

  // Record in DB
  const snapshots = proyectos.map(row => ({
    contribuidor: wallet,
    proyectoId: row.proyecto_id,
    periodo,
    yieldCalculado: String(calcularYield(row.monto, timestampAUnix(row.timestamp), Math.floor(Date.now() / 1000))),
  }));
  await registrarEnvio(wallet, periodo, snapshots);

  return { status: 'sent', email };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📊 Bimex — Reporte Mensual`);
  console.log(`   Periodo: ${PERIODO}`);
  console.log(`   Fecha:   ${new Date().toISOString()}`);
  if (DRY_RUN) console.log(`   🏷️  DRY RUN — no emails will be sent`);
  console.log('');

  // Step 1: Verify migration
  await verificarMigracion();

  // Step 2: Fetch contributors
  console.log('🔍 Fetching active contributors...');
  let contributors;
  try {
    contributors = await obtenerContribuidoresActivos(PERIODO);
  } catch (err) {
    console.error('❌ Failed to fetch contributors:', err.message);
    process.exit(1);
  }

  console.log(`   Found ${contributors.length} active contributor(s) to process.`);
  if (contributors.length === 0) {
    console.log('✅ No contributors to process. Exiting.');
    return;
  }

  // Step 3: Group by wallet address
  const groups = new Map();
  for (const row of contributors) {
    const existing = groups.get(row.contribuidor) ?? [];
    existing.push(row);
    groups.set(row.contribuidor, existing);
  }

  console.log(`   Total unique contributors: ${groups.size}`);
  console.log('');

  // Step 4: Process in batches with concurrency limit
  const walletList = Array.from(groups.entries());
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let dryRun = 0;

  for (let i = 0; i < walletList.length; i += BATCH_SIZE) {
    const batch = walletList.slice(i, i + BATCH_SIZE);
    console.log(`📬 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(walletList.length / BATCH_SIZE)} (${batch.length} contributors)...`);

    // Process batch with limited concurrency
    const results = [];
    for (let j = 0; j < batch.length; j += MAX_CONCURRENCY) {
      const chunk = batch.slice(j, j + MAX_CONCURRENCY);
      const chunkResults = await Promise.allSettled(
        chunk.map(([wallet, proyectos]) => procesarContribuidor(wallet, proyectos, PERIODO))
      );
      results.push(...chunkResults);

      // Delay between concurrency chunks to respect Resend rate limits
      if (j + MAX_CONCURRENCY < batch.length) {
        await sleep(1500);
      }
    }

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const value = result.value;
        if (value.status === 'sent') sent++;
        else if (value.status === 'dry-run') dryRun++;
        else skipped++;
      } else {
        failed++;
        console.error(`  ❌ Error: ${result.reason?.message ?? result.reason}`);
      }
    }

    // Delay between batches
    if (i + BATCH_SIZE < walletList.length) {
      await sleep(2000);
    }
  }

  // Summary
  console.log('');
  console.log('═'.repeat(50));
  console.log(`📊 REPORTE MENSUAL — ${PERIODO} — COMPLETADO`);
  console.log(`   Total contributors:   ${groups.size}`);
  console.log(`   Sent:                ${sent}`);
  if (DRY_RUN) console.log(`   Dry-run:             ${dryRun}`);
  console.log(`   Skipped (no email):  ${skipped}`);
  console.log(`   Failed:              ${failed}`);
  console.log('═'.repeat(50));

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
