import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export let supabaseOk = true;

export async function conRetry(fn, maxIntentos = 3, baseDelayMs = 500) {
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      const result = await fn();
      supabaseOk = true;
      return result;
    } catch (err) {
      if (intento === maxIntentos) {
        supabaseOk = false;
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, intento - 1);
      console.warn(`Intento ${intento} fallido de base de datos, reintentando en ${delay}ms...`, err.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

export async function upsertProyecto(proyecto) {
  return conRetry(async () => {
    // reclamar_yield sends a delta, not an absolute value — increment in DB
    if (proyecto.yield_entregado_delta != null) {
      const { id, yield_entregado_delta } = proyecto;
      const { error } = await supabase.rpc('incrementar_yield_entregado', {
        p_id: id,
        p_delta: yield_entregado_delta,
      });
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from('proyectos')
      .upsert(proyecto, { onConflict: 'id' });
    if (error) throw error;
  });
}

export async function upsertAportacion(aportacion) {
  return conRetry(async () => {
    const { error } = await supabase
      .from('aportaciones')
      .upsert(aportacion, { onConflict: 'proyecto_id,contribuidor' });
    if (error) throw error;
  });
}

export async function insertEvento(evento) {
  return conRetry(async () => {
    // Ignore duplicate tx_hash (idempotent re-indexing)
    const { error } = await supabase
      .from('eventos')
      .upsert(evento, { onConflict: 'tx_hash', ignoreDuplicates: true });
    if (error) throw error;
  });
}

export async function getLastIndexedLedger() {
  return conRetry(async () => {
    const { data, error } = await supabase
      .from('eventos')
      .select('ledger')
      .order('ledger', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data?.length) return null;
    return data[0].ledger;
  });
}

export async function countEventsLastHour() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase.from('eventos')
    .select('id', { count: 'exact', head: true })
    .gt('timestamp', oneHourAgo);
  if (error) throw error;
  return count ?? 0;
}

export async function insertAuditLog(audit) {
  return conRetry(async () => {
    const { error } = await supabase
      .from('audit_log')
      .upsert(audit, { onConflict: 'tx_hash', ignoreDuplicates: true });
    if (error) throw error;
  });
}

export default supabase;
