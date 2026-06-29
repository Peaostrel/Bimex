import 'dotenv/config';
import http from 'node:http';
import { rpc } from '@stellar/stellar-sdk';
import { parseEvent } from './eventParser.js';
import { upsertProyecto, upsertAportacion, insertEvento, insertAuditLog, getLastIndexedLedger, supabaseOk } from './database.js';
import { notificarClientes, getSseMetrics } from './sse.js';
import './api.js'; // start HTTP + SSE server in the same process

const RPC_URL         = process.env.STELLAR_RPC_URL;
const CONTRACT_ID     = process.env.CONTRACT_ID;
const START_LEDGER    = parseInt(process.env.START_LEDGER ?? '0', 10);
const POLL_INTERVAL   = parseInt(process.env.POLL_INTERVAL_MS ?? '10000', 10);

const soroban = new rpc.Server(RPC_URL, { allowHttp: false });

const estadoIndexer = {
  // ... existing fields will follow
  ultimoLedger: 0,
  txProcesadas: 0,
  ultimaActualizacion: null,
  supabaseOk: true,
  rpcLatencyMs: null,
  // track when the server started for uptime
  processStartTime: Date.now(),
};

http.createServer(async (req, res) => {
  if (req.url === '/health') {
    // Gather async metrics
    const eventsLastHour = await countEventsLastHour();
    const uptimeSeconds = Math.floor((Date.now() - estadoIndexer.processStartTime) / 1000);
    // Simple lag estimation: difference between current time and last ledger (assuming 1 ledger per second)
    const lagSeconds = Math.max(0, Math.floor(Date.now() / 1000) - estadoIndexer.ultimoLedger);
    const sseMetrics = getSseMetrics();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      ok: true,
      lastBlockIndexed: estadoIndexer.ultimoLedger,
      lagSeconds: lagSeconds,
      rpcLatencyMs: estadoIndexer.rpcLatencyMs,
      supabaseOk: supabaseOk,
      eventsLastHour: eventsLastHour ?? 0,
      uptime: uptimeSeconds,
      sseConnections: sseMetrics,
    }));
    return;
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}).listen(parseInt(process.env.HEALTH_PORT ?? '3001', 10), () => {
  console.log(`Bimex Indexer Health Server listening on port ${process.env.HEALTH_PORT ?? '3001'}`);
});

async function getStartLedger() {
  if (START_LEDGER > 0) return START_LEDGER;
  const last = await getLastIndexedLedger();
  if (last) {
    estadoIndexer.ultimoLedger = last;
    return last + 1;
  }
  const latest = await soroban.getLatestLedger();
  estadoIndexer.ultimoLedger = latest.sequence;
  return latest.sequence;
}

async function processBatch(startLedger) {
  const inicioRpc = Date.now();
  const resp = await soroban.getEvents({
    startLedger,
    filters: [{
      contractIds: [CONTRACT_ID],
      topics: [['contribuir'], ['yield'], ['retiro'], ['aprobar'], ['rechazar'], ['pausar'], ['reanudar'], ['upgrade']],
    }],
    pagination: { limit: 200 },
  });
  const finRpc = Date.now();
  estadoIndexer.rpcLatencyMs = finRpc - inicioRpc;
  const records = resp.records ?? resp.events ?? [];
  estadoIndexer.ultimoLedger = resp.latestLedger || startLedger;
  estadoIndexer.ultimaActualizacion = new Date().toISOString();

  for (const event of records) {
    const parsed = parseEvent(event, CONTRACT_ID);
    if (!parsed) continue;

    const { evento, proyecto, aportacion, audit } = parsed;
    estadoIndexer.txProcesadas++;
    await insertEvento(evento).catch(console.error);
    if (proyecto)   { await upsertProyecto(proyecto).catch(console.error); notificarClientes('proyecto_actualizado', { id: proyecto.id, estado: proyecto.estado }); }
    if (aportacion) { await upsertAportacion(aportacion).catch(console.error); notificarClientes('nueva_contribucion', { proyectoId: aportacion.proyecto_id, monto: aportacion.monto }); }
    if (audit)      { await insertAuditLog(audit).catch(console.error); notificarClientes('admin_action', { action: audit.action, target: audit.target }); }
    if (evento.tipo === 'yield_reclamado') notificarClientes('yield_reclamado', { proyectoId: proyecto?.id ?? null, monto: proyecto?.yield_entregado_delta ?? null });

    console.log(`[${new Date().toISOString()}] ${evento.tipo} ledger=${evento.ledger} tx=${evento.tx_hash}`);
  }

  // cursor is the ledger sequence to use as startLedger on the next call.
  // When we've caught up to the tip, cursor equals latestLedger + 1.
  return resp.cursor ?? resp.latestLedger + 1;
}

async function run() {
  let cursor = await getStartLedger();
  console.log(`Bimex indexer starting at ledger ${cursor}`);

  while (true) {
    try {
      cursor = await processBatch(cursor);
    } catch (err) {
      console.error('Poll error:', err.message);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

run();
