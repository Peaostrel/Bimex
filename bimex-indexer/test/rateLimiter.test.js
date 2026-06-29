import { test, expect, beforeEach } from 'vitest';
import {
  MemoryFixedWindowStore,
  MemorySseConnectionStore,
  buildWalletRateLimitKey,
  isIpWhitelisted,
  normalizeIp,
  setRateLimitHeaders,
  _resetRateLimiterForTests,
} from '../rateLimiter.js';

function fakeResponse() {
  const headers = new Map();
  return {
    setHeader(name, value) { headers.set(name.toLowerCase(), String(value)); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
  };
}

beforeEach(() => {
  _resetRateLimiterForTests();
});

test('fixed-window limiter allows 60 requests/minute and blocks the 61st', () => {
  let now = Date.UTC(2026, 5, 25, 13, 0, 0);
  const store = new MemoryFixedWindowStore({ now: () => now });
  const limit = 60;
  const windowMs = 60_000;
  const key = 'public-api:/proyectos:ip:203.0.113.10';

  let result;
  for (let i = 0; i < limit; i += 1) {
    result = store.consume(key, limit, windowMs);
    expect(result.allowed, `request ${i + 1} should be allowed`).toBe(true);
  }

  expect(result.remaining).toBe(0);

  const blocked = store.consume(key, limit, windowMs);
  expect(blocked.allowed).toBe(false);
  expect(blocked.remaining).toBe(0);
  expect(blocked.retryAfter).toBe(60);

  now += windowMs + 1;
  const afterReset = store.consume(key, limit, windowMs);
  expect(afterReset.allowed).toBe(true);
  expect(afterReset.remaining).toBe(59);
});

test('faucet limiter keeps the 3 requests/hour policy per wallet', () => {
  const store = new MemoryFixedWindowStore({ now: () => Date.UTC(2026, 5, 25, 13, 0, 0) });
  const key = buildWalletRateLimitKey('faucet', 'GABCDEF1234567890');

  expect(store.consume(key, 3, 3_600_000).allowed).toBe(true);
  expect(store.consume(key, 3, 3_600_000).allowed).toBe(true);
  expect(store.consume(key, 3, 3_600_000).allowed).toBe(true);

  const blocked = store.consume(key, 3, 3_600_000);
  expect(blocked.allowed).toBe(false);
  expect(blocked.retryAfter).toBe(3600);
});

test('rate-limit headers include RFC and compatibility headers', () => {
  const res = fakeResponse();
  const result = {
    limit: 60,
    remaining: 0,
    resetAt: Date.now() + 45_000,
    retryAfter: 45,
  };

  setRateLimitHeaders(res, result, { retryAfter: true, policyWindowMs: 60_000 });

  expect(res.getHeader('ratelimit-limit')).toBe('60');
  expect(res.getHeader('ratelimit-remaining')).toBe('0');
  expect(res.getHeader('ratelimit-policy')).toBe('60;w=60');
  expect(res.getHeader('x-ratelimit-limit')).toBe('60');
  expect(res.getHeader('x-ratelimit-remaining')).toBe('0');
  expect(res.getHeader('retry-after')).toBe('45');
});

test('SSE limiter caps simultaneous connections and releases slots', () => {
  const store = new MemorySseConnectionStore();
  const limit = 5;
  const key = 'sse:ip:198.51.100.20';
  const releases = [];

  for (let i = 0; i < limit; i += 1) {
    const acquired = store.acquire(key, limit);
    expect(acquired.allowed, `SSE connection ${i + 1} should be allowed`).toBe(true);
    releases.push(acquired.release);
  }

  const blocked = store.acquire(key, limit);
  expect(blocked.allowed).toBe(false);
  expect(blocked.remaining).toBe(0);

  releases[0]();
  const afterRelease = store.acquire(key, limit);
  expect(afterRelease.allowed).toBe(true);
  expect(afterRelease.remaining).toBe(0);

  afterRelease.release();
  for (const release of releases.slice(1)) release();
});

test('IP normalization and whitelist support exact IPs and CIDR ranges', () => {
  expect(normalizeIp('::ffff:203.0.113.5')).toBe('203.0.113.5');
  expect(normalizeIp('203.0.113.5:54321')).toBe('203.0.113.5');
  expect(normalizeIp('198.51.100.7, 10.0.0.1')).toBe('198.51.100.7');

  const whitelist = ['203.0.113.5', '198.51.100.0/24'];
  expect(isIpWhitelisted('203.0.113.5', whitelist)).toBe(true);
  expect(isIpWhitelisted('198.51.100.42', whitelist)).toBe(true);
  expect(isIpWhitelisted('192.0.2.42', whitelist)).toBe(false);
});
