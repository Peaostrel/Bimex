// Shared SSE client registry — imported by both api.js and index.js
const clientes = new Set();
const connectionsByIp = new Map(); // ip -> Set of responses

const MAX_PER_IP = parseInt(process.env.SSE_MAX_PER_IP ?? '5', 10);
const MAX_TOTAL = parseInt(process.env.SSE_MAX_TOTAL ?? '500', 10);
const HEARTBEAT_MS = parseInt(process.env.SSE_HEARTBEAT_MS ?? '30000', 10);

// Heartbeat to detect dead/slow connections
setInterval(() => {
  for (const cliente of clientes) {
    try {
      // Send a comment as heartbeat; write returns false if backpressure
      const ok = cliente.write(':heartbeat\n\n');
      if (!ok) throw new Error('Backpressure');
    } catch (e) {
      // Remove problematic client
      eliminarCliente(cliente);
    }
  }
}, HEARTBEAT_MS);

export function agregarCliente(res, ip) {
  const clientIp = ip || res.socket?.remoteAddress || 'unknown';
  const total = clientes.size;
  const perIpSet = connectionsByIp.get(clientIp) || new Set();
  if (total >= MAX_TOTAL || perIpSet.size >= MAX_PER_IP) {
    // Reject connection
    try {
      res.writeHead(429);
      res.end();
    } catch (_) {}
    return false;
  }
  clientes.add(res);
  perIpSet.add(res);
  connectionsByIp.set(clientIp, perIpSet);
  return true;
}

export function eliminarCliente(res) {
  clientes.delete(res);
  // Remove from any ip set
  for (const [ip, set] of connectionsByIp.entries()) {
    if (set.delete(res) && set.size === 0) {
      connectionsByIp.delete(ip);
    }
  }
}

export function notificarClientes(tipo, datos) {
  const msg = `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const cliente of clientes) {
    try {
      const ok = cliente.write(msg);
      if (!ok) throw new Error('Backpressure');
    } catch {
      clientes.delete(cliente);
      eliminarCliente(cliente);
    }
  }
}

// Export metrics for health endpoint
export function getSseMetrics() {
  const perIp = {};
  for (const [ip, set] of connectionsByIp.entries()) {
    perIp[ip] = set.size;
  }
  return { total: clientes.size, perIp };
}
