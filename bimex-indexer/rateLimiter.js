import { randomUUID } from 'node:crypto';

const DEFAULT_PUBLIC_LIMIT = 60;
const DEFAULT_PUBLIC_WINDOW_MS = 60 * 1000;
const DEFAULT_SSE_LIMIT = 5;
const DEFAULT_FAUCET_LIMIT = 3;
const DEFAULT_FAUCET_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_SUPABASE_BACKOFF_MS = 60 * 1000;
const DEFAULT_SSE_SUPABASE_TTL_SECONDS = 90;
const DEFAULT_SSE_SUPABASE_HEARTBEAT_MS = 30 * 1000;

let supabaseClientPromise = null;
let supabaseDisabledUntil = 0;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEnvList(...names) {
  return names
    .flatMap(name => String(process.env[name] ?? '').split(','))
    .map(item => item.trim())
    .filter(Boolean);
}

export function getRateLimitConfig() {
  return {
    publicLimit: parsePositiveInt(process.env.RATE_LIMIT_PUBLIC_MAX, DEFAULT_PUBLIC_LIMIT),
    publicWindowMs: parsePositiveInt(process.env.RATE_LIMIT_PUBLIC_WINDOW_MS, DEFAULT_PUBLIC_WINDOW_MS),
    sseLimit: parsePositiveInt(process.env.RATE_LIMIT_SSE_MAX_CONNECTIONS, DEFAULT_SSE_LIMIT),
    faucetLimit: parsePositiveInt(process.env.RATE_LIMIT_FAUCET_MAX, DEFAULT_FAUCET_LIMIT),
    faucetWindowMs: parsePositiveInt(process.env.RATE_LIMIT_FAUCET_WINDOW_MS, DEFAULT_FAUCET_WINDOW_MS),
    store: String(process.env.RATE_LIMIT_STORE ?? 'supabase').toLowerCase(),
    supabaseBackoffMs: parsePositiveInt(process.env.RATE_LIMIT_SUPABASE_BACKOFF_MS, DEFAULT_SUPABASE_BACKOFF_MS),
    sseSupabaseTtlSeconds: parsePositiveInt(process.env.RATE_LIMIT_SSE_SUPABASE_TTL_SECONDS, DEFAULT_SSE_SUPABASE_TTL_SECONDS),
    sseSupabaseHeartbeatMs: parsePositiveInt(process.env.RATE_LIMIT_SSE_SUPABASE_HEARTBEAT_MS, DEFAULT_SSE_SUPABASE_HEARTBEAT_MS),
  };
}

export function normalizeIp(ip) {
  if (!ip) return 'unknown';
  let value = String(ip).trim();
  if (!value) return 'unknown';
  if (value.includes(',')) value = value.split(',')[0].trim();
  if (value.startsWith('[') && value.includes(']')) {
    value = value.slice(1, value.indexOf(']'));
  }
  if (value.startsWith('::ffff:')) value = value.slice('::ffff:'.length);
  if (value === '::1') return '127.0.0.1';
  const lastColon = value.lastIndexOf(':');
  if (lastColon > -1 && value.indexOf(':') === lastColon && value.includes('.')) {
    value = value.slice(0, lastColon);
  }
  return value || 'unknown';
}

export function getClientIp(req) {
  return normalizeIp(
    req.headers?.['x-forwarded-for'] ||
    req.headers?.['x-real-ip'] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

function ipv4ToInt(ip) {
  const parts = ip.split('.').map(part => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
}

function matchesIpv4Cidr(ip, cidr) {
  const [range, prefixRaw] = cidr.split('/');
  const prefix = Number.parseInt(prefixRaw, 10);
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt == null || rangeInt == null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

export function isIpWhitelisted(ip, whitelist = parseEnvList(
  'RATE_LIMIT_WHITELIST_IPS',
  'RATE_LIMIT_TRUSTED_IPS',
  'INTERNAL_IP_WHITELIST',
  'FRONTEND_VERCEL_IP_WHITELIST'
)) {
  const normalized = normalizeIp(ip);
  return whitelist.some(entry => {
    if (entry === '*') return true;
    if (entry.includes('/')) return matchesIpv4Cidr(normalized, entry);
    return normalizeIp(entry) === normalized;
  });
}

export class MemoryFixedWindowStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.buckets = new Map();
  }

  consume(key, limit, windowMs) {
    const now = this.now();
    const normalizedKey = String(key);
    let bucket = this.buckets.get(normalizedKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
    }
    bucket.count += 1;
    this.buckets.set(normalizedKey, bucket);
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: bucket.count <= limit,
      key: normalizedKey,
      limit,
      remaining: Math.max(limit - bucket.count, 0),
      resetAt: bucket.resetAt,
      retryAfter,
      store: 'memory',
    };
  }

  reset() {
    this.buckets.clear();
  }
}

export class MemorySseConnectionStore {
  constructor() {
    this.activeConnections = new Map();
  }

  acquire(key, limit) {
    const normalizedKey = String(key);
    const current = this.activeConnections.get(normalizedKey) ?? 0;
    if (current >= limit) {
      return {
        allowed: false,
        key: normalizedKey,
        limit,
        remaining: 0,
        active: current,
        retryAfter: 60,
        store: 'memory',
        release: () => {},
      };
    }
    const active = current + 1;
    this.activeConnections.set(normalizedKey, active);
    let released = false;
    return {
      allowed: true,
      key: normalizedKey,
      limit,
      remaining: Math.max(limit - active, 0),
      active,
      retryAfter: 0,
      store: 'memory',
      release: () => {
        if (released) return;
        released = true;
        const count = this.activeConnections.get(normalizedKey) ?? 0;
        if (count <= 1) this.activeConnections.delete(normalizedKey);
        else this.activeConnections.set(normalizedKey, count - 1);
      },
    };
  }

  reset() {
    this.activeConnections.clear();
  }
}

export const memoryFixedWindowStore = new MemoryFixedWindowStore();
export const memorySseConnectionStore = new MemorySseConnectionStore();

function secondsUntil(resetAt) {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}

export function setRateLimitHeaders(res, result, { retryAfter = false, policyWindowMs } = {}) {
  const limit = Number(result.limit ?? 0);
  const remaining = Math.max(Number(result.remaining ?? 0), 0);
  const resetSeconds = Number.isFinite(result.resetSeconds)
    ? Math.max(0, Math.ceil(result.resetSeconds))
    : result.resetAt
      ? secondsUntil(result.resetAt)
      : 0;

  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));
  if (policyWindowMs) {
    res.setHeader('RateLimit-Policy', `${limit};w=${Math.ceil(policyWindowMs / 1000)}`);
  }
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  if (result.resetAt) res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  if (retryAfter) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(result.retryAfter ?? resetSeconds ?? 1))));
  }
}

async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('./database.js').then(module => module.default);
  }
  return supabaseClientPromise;
}

function canUseSupabaseStore(config) {
  if (config.store === 'memory' || config.store === 'in-memory') return false;
  if (config.store !== 'supabase' && config.store !== 'auto') return false;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return false;
  return Date.now() >= supabaseDisabledUntil;
}

async function consumeSupabaseFixedWindow(key, limit, windowMs) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('consume_rate_limit_bucket', {
    p_key: String(key),
    p_limit: limit,
    p_window_seconds: Math.ceil(windowMs / 1000),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error('Respuesta inválida de consume_rate_limit_bucket');
  return {
    allowed: Boolean(row.allowed),
    key: String(key),
    limit: Number(row.limit ?? limit),
    remaining: Math.max(Number(row.remaining ?? 0), 0),
    resetAt: Number(row.resetAt ?? row.reset_at ?? Date.now() + windowMs),
    retryAfter: Math.max(1, Number(row.retryAfter ?? row.retry_after ?? Math.ceil(windowMs / 1000))),
    store: 'supabase',
  };
}

async function acquireSupabaseSseConnection(key, limit, config) {
  const connectionId = randomUUID();
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('acquire_sse_connection', {
    p_key: String(key),
    p_limit: limit,
    p_connection_id: connectionId,
    p_ttl_seconds: config.sseSupabaseTtlSeconds,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error('Respuesta inválida de acquire_sse_connection');
  let heartbeat;
  const release = async () => {
    if (heartbeat) clearInterval(heartbeat);
    try {
      await supabase.rpc('release_sse_connection', { p_connection_id: connectionId });
    } catch (err) {
      console.warn('[rate-limit] failed to release Supabase SSE slot:', err.message);
    }
  };
  if (row.allowed) {
    heartbeat = setInterval(() => {
      void supabase.rpc('heartbeat_sse_connection', {
        p_connection_id: connectionId,
        p_ttl_seconds: config.sseSupabaseTtlSeconds,
      });
    }, config.sseSupabaseHeartbeatMs);
    heartbeat.unref?.();
  }
  return {
    allowed: Boolean(row.allowed),
    key: String(key),
    limit: Number(row.limit ?? limit),
    remaining: Math.max(Number(row.remaining ?? 0), 0),
    active: Number(row.active ?? 0),
    resetAt: Date.now() + (config.sseSupabaseTtlSeconds * 1000),
    retryAfter: Math.max(1, Number(row.retryAfter ?? row.retry_after ?? config.sseSupabaseTtlSeconds)),
    store: 'supabase',
    release,
  };
}

export async function consumeFixedWindow(key, limit, windowMs, config = getRateLimitConfig()) {
  if (!canUseSupabaseStore(config)) {
    return memoryFixedWindowStore.consume(key, limit, windowMs);
  }
  try {
    return await consumeSupabaseFixedWindow(key, limit, windowMs);
  } catch (err) {
    supabaseDisabledUntil = Date.now() + config.supabaseBackoffMs;
    console.warn('[rate-limit] Supabase store unavailable; falling back to in-memory:', err.message);
    return memoryFixedWindowStore.consume(key, limit, windowMs);
  }
}

export async function recordRateLimitBlock({ ip, scope, route, key, limit, retryAfter, userAgent }) {
  console.warn('[rate-limit] blocked request', { ip, scope, route, key, limit, retryAfter });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return;
  try {
    const supabase = await getSupabaseClient();
    await supabase.from('rate_limit_blocked_events').insert({
      ip, scope, route,
      bucket_key: key,
      limit_value: limit,
      retry_after_seconds: retryAfter,
      user_agent: userAgent ?? null,
    });
  } catch (err) {
    console.warn('[rate-limit] failed to persist blocked request log:', err.message);
  }
}

export function buildIpRateLimitKey(scope, ip) {
  return `${scope}:ip:${normalizeIp(ip)}`;
}

export function buildWalletRateLimitKey(scope, wallet) {
  return `${scope}:wallet:${String(wallet).trim().toLowerCase()}`;
}

export async function enforceFixedWindowRateLimit(req, res, { scope, route, key, limit, windowMs, honorIpWhitelist = true }) {
  const ip = getClientIp(req);
  if (honorIpWhitelist && isIpWhitelisted(ip)) {
    return { allowed: true, whitelisted: true, ip, limit, remaining: limit };
  }
  const result = await consumeFixedWindow(key, limit, windowMs);
  setRateLimitHeaders(res, result, { retryAfter: !result.allowed, policyWindowMs: windowMs });
  if (!result.allowed) {
    await recordRateLimitBlock({
      ip, scope, route, key, limit,
      retryAfter: result.retryAfter,
      userAgent: req.headers?.['user-agent'],
    });
  }
  return { ...result, ip, scope, route };
}

export async function acquireSseConnection(req, res, { limit = getRateLimitConfig().sseLimit, route = '/sse' } = {}) {
  const config = getRateLimitConfig();
  const ip = getClientIp(req);
  if (isIpWhitelisted(ip)) {
    return { allowed: true, whitelisted: true, ip, limit, remaining: limit, release: () => {} };
  }
  const key = buildIpRateLimitKey('sse', ip);
  let result;
  if (canUseSupabaseStore(config)) {
    try {
      result = await acquireSupabaseSseConnection(key, limit, config);
    } catch (err) {
      supabaseDisabledUntil = Date.now() + config.supabaseBackoffMs;
      console.warn('[rate-limit] Supabase SSE store unavailable; falling back to in-memory:', err.message);
    }
  }
  if (!result) result = memorySseConnectionStore.acquire(key, limit);
  setRateLimitHeaders(res, { ...result, resetAt: result.resetAt ?? Date.now() + 60_000 }, {
    retryAfter: !result.allowed,
    policyWindowMs: 60_000,
  });
  if (!result.allowed) {
    void recordRateLimitBlock({
      ip, scope: 'sse', route, key, limit,
      retryAfter: result.retryAfter,
      userAgent: req.headers?.['user-agent'],
    });
  }
  return { ...result, ip, route };
}

export function _resetRateLimiterForTests() {
  memoryFixedWindowStore.reset();
  memorySseConnectionStore.reset();
  supabaseClientPromise = null;
  supabaseDisabledUntil = 0;
}
