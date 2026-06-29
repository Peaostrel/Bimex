-- Bimex Indexer Schema
-- Run in Supabase SQL editor or as a migration

create table if not exists proyectos (
  id              integer primary key,
  dueno           text,
  nombre          text,
  meta            numeric,
  total_aportado  numeric default 0,
  yield_entregado numeric default 0,
  estado          text,
  motivo_rechazo  text,
  created_at      timestamptz
);

create table if not exists aportaciones (
  proyecto_id  integer references proyectos(id),
  contribuidor text,
  monto        numeric,
  retirado     boolean default false,
  timestamp    timestamptz,
  primary key (proyecto_id, contribuidor)
);

create table if not exists eventos (
  id          bigserial primary key,
  tipo        text not null,
  contract_id text not null,
  fn_name     text,
  data        jsonb,
  ledger      bigint,
  tx_hash     text unique,
  timestamp   timestamptz
);

-- Index for fast lookups
create index if not exists eventos_tipo_idx         on eventos(tipo);
create index if not exists eventos_ledger_idx       on eventos(ledger desc);
create index if not exists aportaciones_proj_idx    on aportaciones(proyecto_id);
create index if not exists aportaciones_backer_idx  on aportaciones(contribuidor);

-- Atomic yield increment (avoids read-modify-write race)
create or replace function incrementar_yield_entregado(p_id integer, p_delta numeric)
returns void language sql as $$
  update proyectos
  set yield_entregado = yield_entregado + p_delta
  where id = p_id;
$$;

-- Enable Supabase realtime for live frontend updates
alter publication supabase_realtime add table eventos;
alter publication supabase_realtime add table proyectos;

-- Audit Log for Admin Actions
create table if not exists audit_log (
  id bigserial primary key,
  action text not null,
  actor_address text not null,
  target text,
  metadata jsonb,
  tx_hash text unique,
  block_time timestamptz not null,
  recorded_at timestamptz default now()
);

-- Row Level Security to enforce immutability
alter table audit_log enable row level security;
create policy "Allow public read" on audit_log for select using (true);
create policy "Allow insert only" on audit_log for insert with check (true);
-- No policies for update or delete means they are implicitly denied

create index if not exists idx_audit_log_block_time on audit_log (block_time desc);
create index if not exists idx_audit_log_actor_address on audit_log (actor_address);
create index if not exists idx_audit_log_action on audit_log (action);

-- Faucet Rate Limit
create table if not exists faucet_rate_limit (
  wallet text not null,
  granted_at timestamptz not null default now(),
  ip_hash text,
  primary key (wallet, granted_at)
);
create index if not exists idx_faucet_rate_limit_wallet on faucet_rate_limit (wallet, granted_at desc);

-- Nota: pg_cron NO viene habilitado por defecto.
-- Para limpiar registros antiguos, primero ve a Supabase Dashboard -> Database -> Extensions
-- y habilita "pg_cron". Luego configura este job (SQL Editor):
-- select cron.schedule('cleanup_faucet_rate_limit', '0 0 * * *', $$ delete from faucet_rate_limit where granted_at < now() - interval '24 hours' $$);

-- Success Stories Evidence
create table if not exists proyecto_evidencia (
  id bigserial primary key,
  proyecto_id integer references proyectos(id) on delete cascade,
  tipo text not null default 'foto',
  titulo text not null default '',
  descripcion text default '',
  url text not null,
  cid text default '',
  uploaded_at timestamptz default now()
);

create index if not exists idx_evidencia_proyecto on proyecto_evidencia (proyecto_id);
create index if not exists idx_evidencia_tipo on proyecto_evidencia (tipo);

-- ─── IP Rate Limiting ────────────────────────────────────────────────────
-- Shared fixed-window buckets for horizontally scaled API instances.
-- Used by bimex-indexer/rateLimiter.js via consume_rate_limit_bucket().

create table if not exists rate_limit_buckets (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null default 0,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);

create index if not exists rate_limit_buckets_expires_idx on rate_limit_buckets(expires_at);

create table if not exists rate_limit_blocked_events (
  id                    bigserial primary key,
  created_at            timestamptz not null default now(),
  ip                    text,
  scope                 text,
  route                 text,
  bucket_key            text,
  limit_value           integer,
  retry_after_seconds   integer,
  user_agent            text
);

create index if not exists rate_limit_blocked_events_created_idx on rate_limit_blocked_events(created_at desc);
create index if not exists rate_limit_blocked_events_ip_idx on rate_limit_blocked_events(ip);

create table if not exists rate_limit_sse_connections (
  connection_id text primary key,
  key           text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create index if not exists rate_limit_sse_connections_key_idx on rate_limit_sse_connections(key);
create index if not exists rate_limit_sse_connections_expires_idx on rate_limit_sse_connections(expires_at);

create or replace function consume_rate_limit_bucket(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_bucket rate_limit_buckets%rowtype;
begin
  insert into rate_limit_buckets(key, window_start, count, expires_at, updated_at)
  values (p_key, v_now, 1, v_now + make_interval(secs => p_window_seconds), v_now)
  on conflict (key) do update set
    window_start = case
      when rate_limit_buckets.expires_at <= v_now then v_now
      else rate_limit_buckets.window_start
    end,
    count = case
      when rate_limit_buckets.expires_at <= v_now then 1
      else rate_limit_buckets.count + 1
    end,
    expires_at = case
      when rate_limit_buckets.expires_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else rate_limit_buckets.expires_at
    end,
    updated_at = v_now
  returning * into v_bucket;

  return jsonb_build_object(
    'allowed', v_bucket.count <= p_limit,
    'limit', p_limit,
    'remaining', greatest(p_limit - v_bucket.count, 0),
    'resetAt', floor(extract(epoch from v_bucket.expires_at) * 1000),
    'retryAfter', greatest(ceil(extract(epoch from (v_bucket.expires_at - v_now))), 1)
  );
end;
$$;

create or replace function acquire_sse_connection(
  p_key text,
  p_limit integer,
  p_connection_id text,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_active integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));
  delete from rate_limit_sse_connections where expires_at <= v_now;

  select count(*) into v_active
  from rate_limit_sse_connections
  where key = p_key;

  if v_active >= p_limit then
    return jsonb_build_object(
      'allowed', false,
      'limit', p_limit,
      'active', v_active,
      'remaining', 0,
      'retryAfter', p_ttl_seconds
    );
  end if;

  insert into rate_limit_sse_connections(connection_id, key, created_at, updated_at, expires_at)
  values (p_connection_id, p_key, v_now, v_now, v_now + make_interval(secs => p_ttl_seconds));

  return jsonb_build_object(
    'allowed', true,
    'limit', p_limit,
    'active', v_active + 1,
    'remaining', greatest(p_limit - (v_active + 1), 0),
    'retryAfter', 0
  );
end;
$$;

create or replace function heartbeat_sse_connection(
  p_connection_id text,
  p_ttl_seconds integer
)
returns void
language sql
as $$
  update rate_limit_sse_connections
  set updated_at = now(),
      expires_at = now() + make_interval(secs => p_ttl_seconds)
  where connection_id = p_connection_id;
$$;

create or replace function release_sse_connection(p_connection_id text)
returns void
language sql
as $$
  delete from rate_limit_sse_connections
  where connection_id = p_connection_id;
$$;

create or replace function cleanup_rate_limit_data(p_blocked_log_retention interval default interval '30 days')
returns void
language sql
as $$
  delete from rate_limit_buckets where expires_at < now() - interval '1 day';
  delete from rate_limit_sse_connections where expires_at < now();
  delete from rate_limit_blocked_events where created_at < now() - p_blocked_log_retention;
$$;
