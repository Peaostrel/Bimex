import 'dotenv/config';
import http from 'node:http';
import { Contract, rpc, TransactionBuilder, Networks, Address, Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import supabase from './database.js';
import { agregarCliente, eliminarCliente } from './sse.js';
import {
  acquireSseConnection,
  buildIpRateLimitKey,
  buildWalletRateLimitKey,
  enforceFixedWindowRateLimit,
  getClientIp,
  getRateLimitConfig,
} from './rateLimiter.js';

const ALLOWED_ORIGINS = new Set([
  'https://bimex.vercel.app',
  'https://bimex.mx',
  process.env.NODE_ENV === 'development' && 'http://localhost:5173'
].filter(Boolean));

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

const PORT = parseInt(process.env.API_PORT ?? '3002', 10);

// ─── Rate limiter: 3 requests per wallet per hour ────────────────────────
const RL_MAX = 3;
const RL_WINDOW_MS = 60 * 60 * 1000;

async function checkRateLimit(wallet) {
  const oneHourAgo = new Date(Date.now() - RL_WINDOW_MS).toISOString();

  const { error: insertError } = await supabase.from('faucet_rate_limit').insert({ wallet });
  if (insertError) {
    console.error('Rate limit insert error:', insertError);
    return { allowed: false, retryAfter: 3600 };
  }

  const { data, error } = await supabase
    .from('faucet_rate_limit')
    .select('granted_at')
    .eq('wallet', wallet)
    .gte('granted_at', oneHourAgo)
    .order('granted_at', { ascending: true });

  if (error) {
    console.error('Rate limit DB error:', error);
    return { allowed: false, retryAfter: 3600 };
  }

  if (data.length > RL_MAX) {
    const latest = data[data.length - 1].granted_at;
    await supabase.from('faucet_rate_limit').delete()
      .eq('wallet', wallet)
      .eq('granted_at', latest);

    const oldest = new Date(data[0].granted_at).getTime();
    const retryAfterSeconds = Math.ceil((oldest + RL_WINDOW_MS - Date.now()) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfterSeconds) };
  }

  return { allowed: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function json(req, res, status, data) {
  const body = JSON.stringify(data);
  setCorsHeaders(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function rateLimitExceeded(req, res, result, message) {
  return json(req, res, 429, {
    error: message,
    retry_after: result.retryAfter,
  });
}

function publicRateLimitedEndpoint(parts) {
  if (parts[0] === 'proyectos') return '/proyectos';
  if (parts[0] === 'eventos' && !parts[1]) return '/eventos';
  if (parts[0] === 'stats' && !parts[1]) return '/stats';
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Cuerpo inválido: se esperaba JSON')); }
    });
    req.on('error', reject);
  });
}

// ─── Faucet — TESTNET ONLY ───────────────────────────────────────────────

const FAUCET_RPC        = new rpc.Server(process.env.STELLAR_RPC_URL, { allowHttp: false });
const FAUCET_TOKEN_ID   = process.env.TOKEN_MXNE;
const FAUCET_SECRET     = process.env.FAUCET_SECRET;
const FAUCET_KEYPAIR    = FAUCET_SECRET ? Keypair.fromSecret(FAUCET_SECRET) : null;

async function mintearMXNe(destino, cantidad = BigInt(1_000_000_000)) {
  if (!FAUCET_SECRET || !FAUCET_KEYPAIR) throw new Error('Faucet no configurado (FAUCET_SECRET)');
  if (!FAUCET_TOKEN_ID) throw new Error('Token MXNe no configurado (TOKEN_MXNE)');

  const tokenContrato = new Contract(FAUCET_TOKEN_ID);
  const cuentaInfo    = await FAUCET_RPC.getAccount(FAUCET_KEYPAIR.publicKey());

  const tx = new TransactionBuilder(cuentaInfo, {
    fee: '1000000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(tokenContrato.call('mint', new Address(destino).toScVal(), nativeToScVal(cantidad, { type: 'i128' })))
    .setTimeout(300)
    .build();

  const txPreparada = await FAUCET_RPC.prepareTransaction(tx);
  txPreparada.sign(FAUCET_KEYPAIR);

  const envio = await FAUCET_RPC.sendTransaction(txPreparada);
  if (envio.status === 'ERROR') throw new Error('Faucet tx rechazada por la red');

  let intentos = 0;
  while (intentos < 20) {
    await new Promise(r => setTimeout(r, 2000));
    const estado = await FAUCET_RPC.getTransaction(envio.hash);
    if (estado.status === rpc.Api.GetTransactionStatus.SUCCESS) return estado;
    if (estado.status === rpc.Api.GetTransactionStatus.FAILED)
      throw new Error('Faucet tx falló en la red');
    intentos++;
  }
  throw new Error('Timeout del faucet');
}

// ─── Routes ──────────────────────────────────────────────────────────────

async function route(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const parts = url.pathname.replace(/^\//, '').split('/');
  const rateLimitConfig = getRateLimitConfig();

  // POST /faucet
  if (req.method === 'POST' && parts[0] === 'faucet' && !parts[1]) {
    let body;
    try { body = await readBody(req); }
    catch (e) { return json(req, res, 400, { error: e.message }); }

    const { destino } = body;
    if (!destino) return json(req, res, 400, { error: 'Falta "destino" en el cuerpo' });

    const faucetLimit = await enforceFixedWindowRateLimit(req, res, {
      scope: 'faucet',
      route: '/faucet',
      key: buildWalletRateLimitKey('faucet', destino),
      limit: rateLimitConfig.faucetLimit,
      windowMs: rateLimitConfig.faucetWindowMs,
      honorIpWhitelist: false,
    });
    if (!faucetLimit.allowed)
      return rateLimitExceeded(req, res, faucetLimit, 'Límite de 3 solicitudes por hora por wallet');

    const rl = await checkRateLimit(destino);
    if (!rl.allowed) {
      res.setHeader('Retry-After', rl.retryAfter.toString());
      return json(req, res, 429, { error: 'Límite de 3 solicitudes por hora por wallet' });
    }

    try {
      await mintearMXNe(destino);
      return json(req, res, 200, { exito: true, cantidad: 100 });
    } catch (e) {
      return json(req, res, 500, { error: e.message });
    }
  }

  if (req.method !== 'GET') return json(req, res, 405, { error: 'Method not allowed' });

  const limitedEndpoint = publicRateLimitedEndpoint(parts);
  if (limitedEndpoint) {
    const ip = getClientIp(req);
    const publicLimit = await enforceFixedWindowRateLimit(req, res, {
      scope: 'public-api',
      route: limitedEndpoint,
      key: buildIpRateLimitKey(limitedEndpoint, ip),
      limit: rateLimitConfig.publicLimit,
      windowMs: rateLimitConfig.publicWindowMs,
    });
    if (!publicLimit.allowed)
      return rateLimitExceeded(req, res, publicLimit, 'Demasiadas solicitudes. Intenta de nuevo más tarde.');
  }

  // GET /proyectos[?estado=X]
  if (parts[0] === 'proyectos' && !parts[1]) {
    let q = supabase.from('proyectos').select('*').order('id');
    if (url.searchParams.has('estado')) q = q.eq('estado', url.searchParams.get('estado'));
    const { data, error } = await q;
    return error ? json(req, res, 500, { error: error.message }) : json(req, res, 200, data);
  }

  // GET /proyectos/:id
  if (parts[0] === 'proyectos' && parts[1] && !parts[2]) {
    const { data, error } = await supabase
      .from('proyectos').select('*').eq('id', parts[1]).single();
    if (error) return json(req, res, error.code === 'PGRST116' ? 404 : 500, { error: error.message });
    return json(req, res, 200, data);
  }

  // GET /proyectos/:id/aportaciones
  if (parts[0] === 'proyectos' && parts[1] && parts[2] === 'aportaciones') {
    const { data, error } = await supabase
      .from('aportaciones').select('*').eq('proyecto_id', parts[1]).order('timestamp');
    return error ? json(req, res, 500, { error: error.message }) : json(req, res, 200, data);
  }

  // GET /backers/:address/aportaciones
  if (parts[0] === 'backers' && parts[1] && parts[2] === 'aportaciones') {
    const { data, error } = await supabase
      .from('aportaciones').select('*, proyectos(nombre,estado)')
      .eq('contribuidor', parts[1]).order('timestamp');
    return error ? json(req, res, 500, { error: error.message }) : json(req, res, 200, data);
  }

  // GET /eventos[?tipo=X&limit=N&offset=M]
  if (parts[0] === 'eventos' && !parts[1]) {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    let q = supabase.from('eventos').select('*', { count: 'exact' }).order('ledger', { ascending: false }).range(offset, offset + limit - 1);
    if (url.searchParams.has('tipo')) q = q.eq('tipo', url.searchParams.get('tipo'));
    const { data, count, error } = await q;
    return error ? json(req, res, 500, { error: error.message }) : json(req, res, 200, { data, count });
  }

  // GET /stats
  if (parts[0] === 'stats' && !parts[1]) {
    const [proyectos, aportaciones] = await Promise.all([
      supabase.from('proyectos').select('estado,total_aportado,yield_entregado,meta'),
      supabase.from('aportaciones').select('monto,retirado,contribuidor'),
    ]);
    if (proyectos.error) return json(req, res, 500, { error: proyectos.error.message });

    const ps = proyectos.data;
    const aports = aportaciones.data ?? [];
    const contribuidoresUnicos = new Set(aports.filter(a => a.contribuidor).map(a => a.contribuidor));
    const stats = {
      total_proyectos:   ps.length,
      activos:           ps.filter(p => ['EtapaInicial','EnProgreso','Liberado'].includes(p.estado)).length,
      total_aportado:    ps.reduce((s, p) => s + Number(p.total_aportado ?? 0), 0),
      total_yield:       ps.reduce((s, p) => s + Number(p.yield_entregado ?? 0), 0),
      capital_activo:    aports
                           .filter(a => !a.retirado)
                           .reduce((s, a) => s + Number(a.monto ?? 0), 0),
      numero_contribuidores: contribuidoresUnicos.size,
    };
    return json(req, res, 200, stats);
  }

  // GET /audit[?action=X&limit=N&offset=M&format=csv]
  if (parts[0] === 'audit' && !parts[1]) {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 1000);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    let q = supabase.from('audit_log').select('*', { count: 'exact' }).order('block_time', { ascending: false }).range(offset, offset + limit - 1);
    
    if (url.searchParams.has('action') && url.searchParams.get('action') !== 'Todos') {
      q = q.eq('action', url.searchParams.get('action'));
    }
    if (url.searchParams.has('actor') && url.searchParams.get('actor').trim()) {
      q = q.eq('actor_address', url.searchParams.get('actor').trim());
    }
    if (url.searchParams.has('start_date') && url.searchParams.get('start_date')) {
      q = q.gte('block_time', url.searchParams.get('start_date'));
    }
    if (url.searchParams.has('end_date') && url.searchParams.get('end_date')) {
      q = q.lte('block_time', url.searchParams.get('end_date'));
    }
    
    const { data, count, error } = await q;
    if (error) return json(req, res, 500, { error: error.message });

    if (url.searchParams.get('format') === 'csv') {
      setCorsHeaders(req, res);
      res.writeHead(200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="audit_log.csv"',
      });
      res.write('Action,Actor,Target,TxHash,BlockTime,Metadata\n');
      data.forEach(row => {
        const metadataStr = JSON.stringify(row.metadata || {}).replace(/"/g, '""');
        res.write(`${row.action},${row.actor_address},${row.target},${row.tx_hash},${row.block_time},"${metadataStr}"\n`);
      });
      return res.end();
    }
    return json(req, res, 200, { data, count });
  }

  // GET /impacto — Historical summary for completed projects
  if (parts[0] === 'impacto' && !parts[1]) {
    try {
      const [proyectosRes, aportacionesRes, eventosRes] = await Promise.all([
        supabase.from('proyectos').select('*').eq('estado', 'Liberado'),
        supabase.from('aportaciones').select('*'),
        supabase.from('eventos').select('tipo,data,tx_hash,ledger,timestamp')
          .in('tipo', ['nueva_aportacion','retiro_principal','yield_reclamado'])
          .order('ledger', { ascending: true }),
      ]);
      if (proyectosRes.error) return json(req, res, 500, { error: proyectosRes.error.message });

      const proyectos = proyectosRes.data ?? [];
      const aportaciones = aportacionesRes.data ?? [];
      const eventos = eventosRes.data ?? [];

      const aportMap = {};
      for (const a of aportaciones) {
        if (!aportMap[a.proyecto_id]) aportMap[a.proyecto_id] = [];
        aportMap[a.proyecto_id].push(a);
      }

      const eventosMap = {};
      for (const e of eventos) {
        const edata = e.data;
        if (!Array.isArray(edata) || edata.length === 0) continue;
        const pid = Number(edata[0]);
        if (isNaN(pid)) continue;
        if (!eventosMap[pid]) eventosMap[pid] = [];
        eventosMap[pid].push(e);
      }

      const completados = [];
      for (const p of proyectos) {
        const pAportaciones = aportMap[p.id] ?? [];
        const pEventos = eventosMap[p.id] ?? [];

        if (pAportaciones.filter(a => !a.retirado).length > 0) continue;

        const totalContribuido = pAportaciones.reduce((s, a) => s + Number(a.monto ?? 0), 0);
        const capitalDevuelto = pAportaciones.filter(a => a.retirado).reduce((s, a) => s + Number(a.monto ?? 0), 0);
        const contribuciones = pEventos.filter(e => e.tipo === 'nueva_aportacion');
        const retiros = pEventos.filter(e => e.tipo === 'retiro_principal');
        const yieldEventos = pEventos.filter(e => e.tipo === 'yield_reclamado');

        completados.push({
          ...p,
          total_contribuido: totalContribuido,
          num_contribuidores: pAportaciones.length,
          capital_devuelto: capitalDevuelto,
          porcentaje_devuelto: totalContribuido > 0 ? Math.round((capitalDevuelto / totalContribuido) * 100) : 0,
          yield_generado: Number(p.yield_entregado ?? 0),
          timeline: {
            creacion: p.created_at ?? null,
            primera_contribucion: contribuciones[0]?.timestamp ?? null,
            ultima_contribucion: contribuciones[contribuciones.length - 1]?.timestamp ?? null,
            primer_retiro: retiros[0]?.timestamp ?? null,
          },
          tx_hashes: {
            contribuciones: contribuciones.map(e => e.tx_hash).filter(Boolean),
            retiros: retiros.map(e => e.tx_hash).filter(Boolean),
            yield: yieldEventos.map(e => e.tx_hash).filter(Boolean),
          },
        });
      }

      return json(req, res, 200, completados);
    } catch (err) {
      return json(req, res, 500, { error: err.message });
    }
  }

  // GET /sse — Server-Sent Events stream
  if (parts[0] === 'sse' && !parts[1]) {
    const sseLimit = await acquireSseConnection(req, res, { limit: rateLimitConfig.sseLimit, route: '/sse' });
    if (!sseLimit.allowed)
      return rateLimitExceeded(req, res, sseLimit, 'Demasiadas conexiones SSE simultáneas desde esta IP.');

    setCorsHeaders(req, res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(':ok\n\n');
    agregarCliente(res, getClientIp(req));
    req.on('close', () => {
      sseLimit.release();
      eliminarCliente(res);
    });
    return;
  }

  json(req, res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  try {
    await route(req, res);
  } catch (err) {
    json(req, res, 500, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`Bimex API listening on port ${PORT}`));
