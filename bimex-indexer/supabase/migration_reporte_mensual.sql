-- Migration: Monthly report system
-- Run in Supabase SQL editor or via supabase db push
-- Depends on: user_notifications table from migration_notifications.sql

-- ── reportes_mensuales ──────────────────────────────────────────────────────
-- Tracks which contributors have received which monthly report (idempotency)
create table if not exists reportes_mensuales (
  id              bigserial primary key,
  wallet_address  text not null references user_notifications(wallet_address),
  periodo         text not null,           -- '2026-05'
  enviado_at      timestamptz not null default now(),
  unique(wallet_address, periodo)
);

create index if not exists idx_reportes_mensuales_periodo
  on reportes_mensuales (periodo);

create index if not exists idx_reportes_mensuales_wallet
  on reportes_mensuales (wallet_address);

-- ── yield_snapshots ─────────────────────────────────────────────────────────
-- Per-contributor per-project yield snapshots for month-over-month calculation
-- Allows computing "yield generated this month" = current_yield - snapshot_yield
create table if not exists yield_snapshots (
  id              bigserial primary key,
  contribuidor    text not null,
  proyecto_id     integer not null references proyectos(id),
  periodo         text not null,           -- '2026-05'
  yield_calculado numeric not null,        -- cumulative yield in stroops at snapshot time
  created_at      timestamptz not null default now(),
  unique(contribuidor, proyecto_id, periodo)
);

create index if not exists idx_yield_snapshots_contribuidor
  on yield_snapshots (contribuidor);

create index if not exists idx_yield_snapshots_periodo
  on yield_snapshots (periodo);

-- ── Add locale column to user_notifications ────────────────────────────────
alter table user_notifications add column if not exists locale text not null default 'es';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table reportes_mensuales enable row level security;
alter table yield_snapshots enable row level security;

create policy "service role full access reportes"
  on reportes_mensuales for all using (true) with check (true);

create policy "service role full access snapshots"
  on yield_snapshots for all using (true) with check (true);
