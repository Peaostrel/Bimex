# Bimex API

Base URL: configure with `VITE_INDEXER_URL` for the frontend and `API_PORT` for the Node indexer API.

## Public endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/proyectos` | Lists indexed projects. Optional query: `estado`. |
| `GET` | `/proyectos/:id` | Returns one indexed project. |
| `GET` | `/proyectos/:id/aportaciones` | Lists contributions for a project. |
| `GET` | `/eventos` | Lists indexed contract events. Optional query: `tipo`; `limit` is capped at `200`. |
| `GET` | `/stats` | Returns aggregate platform statistics. |
| `GET` | `/sse` | Server-Sent Events stream for project/event updates. |
| `POST` | `/faucet` | Testnet-only MXNe faucet. Body: `{ "destino": "<stellar-address>" }`. |

## Rate limits

The API protects public read endpoints and long-lived SSE connections with `bimex-indexer/rateLimiter.js`.

| Scope | Default limit | Key | Notes |
| --- | ---: | --- | --- |
| `/proyectos`, `/eventos`, `/stats` | `60` requests / minute | Client IP | Applies to all `/proyectos*` read routes, `/eventos`, and `/stats`. |
| `/sse` | `5` simultaneous connections | Client IP | Limit checked before opening the stream; connections are released when the HTTP request closes. |
| `/faucet` | `3` requests / hour | Wallet address | Kept wallet-based even when an IP is whitelisted. |

### Response headers

Rate-limited responses include both RFC 9333-style headers and legacy compatibility headers:

- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`
- `RateLimit-Policy`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` on `429 Too Many Requests`

Example blocked response:

```http
HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 60
RateLimit-Remaining: 0
RateLimit-Reset: 41
Retry-After: 41
Content-Type: application/json

{"error":"Demasiadas solicitudes. Intenta de nuevo más tarde.","retry_after":41}
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `RATE_LIMIT_PUBLIC_MAX` | `60` | Max requests per public endpoint window. |
| `RATE_LIMIT_PUBLIC_WINDOW_MS` | `60000` | Public endpoint fixed-window size in milliseconds. |
| `RATE_LIMIT_SSE_MAX_CONNECTIONS` | `5` | Max concurrent `/sse` connections per IP. |
| `RATE_LIMIT_SSE_SUPABASE_TTL_SECONDS` | `90` | TTL to auto-expire orphaned shared SSE slots if a process dies. |
| `RATE_LIMIT_SSE_SUPABASE_HEARTBEAT_MS` | `30000` | Interval used to refresh shared SSE slots while a connection is alive. |
| `RATE_LIMIT_FAUCET_MAX` | `3` | Max faucet calls per wallet. |
| `RATE_LIMIT_FAUCET_WINDOW_MS` | `3600000` | Faucet fixed-window size in milliseconds. |
| `RATE_LIMIT_STORE` | `supabase` | `supabase` uses the shared Supabase RPC when available; `memory` forces in-process buckets. |
| `RATE_LIMIT_WHITELIST_IPS` | empty | Comma-separated exact IPs or IPv4 CIDRs that bypass IP-based public/SSE limits. |
| `RATE_LIMIT_TRUSTED_IPS` / `INTERNAL_IP_WHITELIST` / `FRONTEND_VERCEL_IP_WHITELIST` | empty | Additional whitelist aliases. |

The API reads the client IP from `X-Forwarded-For`, then `X-Real-IP`, then the socket remote address. Deploy behind a trusted reverse proxy so these headers cannot be spoofed.

## Shared Supabase store

Run `bimex-indexer/schema.sql` in Supabase to create:

- `rate_limit_buckets`: shared fixed-window counters.
- `rate_limit_blocked_events`: review log for blocked requests.
- `rate_limit_sse_connections`: shared active SSE connection slots with TTL cleanup.
- `consume_rate_limit_bucket(...)`: atomic RPC for fixed-window limits.
- `acquire_sse_connection(...)`, `heartbeat_sse_connection(...)`, `release_sse_connection(...)`: RPCs for shared SSE connection limits.
- `cleanup_rate_limit_data(...)`: optional cleanup helper.

If Supabase is unavailable, the API falls back to in-memory buckets automatically.

## Running tests

```bash
cd bimex-indexer
npm test
```
