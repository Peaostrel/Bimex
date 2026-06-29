# Disaster Recovery Runbook — Database Restore

> **Document version:** 1.0.0  
> **Last updated:** 2026-06-24  
> **Branch:** `Backups-automatizados`

---

## Table of Contents

1. [Purpose](#purpose)
2. [Scope](#scope)
3. [RTO and RPO Objectives](#rto-and-rpo-objectives)
4. [Recovery Decision Tree](#recovery-decision-tree)
5. [Architecture Overview](#architecture-overview)
6. [Prerequisites](#prerequisites)
7. [Backup Restoration Procedure](#backup-restoration-procedure)
8. [Validation Procedure](#validation-procedure)
9. [Rollback Procedure](#rollback-procedure)
10. [Stellar Reindex — Fallback Recovery Path](#stellar-reindex--fallback-recovery-path)
11. [Escalation Contacts](#escalation-contacts)
12. [Post-Incident Verification Checklist](#post-incident-verification-checklist)
13. [Appendix: Secrets Inventory](#appendix-secrets-inventory)
14. [Appendix: R2 Bucket Structure](#appendix-r2-bucket-structure)

---

## Purpose

This runbook defines the step-by-step procedure to restore the Bimex Supabase database from an encrypted backup stored in Cloudflare R2 (or any S3-compatible object storage). It covers:

- Automated backup artifacts (encrypted `pg_dump` custom-format files)
- Ephemeral restore verification (weekly automated smoke tests)
- Full production restore procedure
- Fallback to Stellar blockchain reindex if backup restoration fails

---

## Scope

**In scope:**

- Supabase PostgreSQL database (all 9 operational tables: `proyectos`, `aportaciones`, `eventos`, `audit_log`, `proyecto_evidencia`, `user_notifications`, `project_events`, `reportes_mensuales`, `yield_snapshots`)
- Encrypted backup artifacts in Cloudflare R2
- Automated GitHub Actions backup and restore-verify workflows

**Out of scope:**

- Soroban smart contract state (stored on Stellar ledger — recovered via reindex)
- Frontend assets (deployed via Vercel, not part of database state)
- IPFS documents (stored on IPFS/Pinata, referenced by CID in the database)
- User email preferences in Resend (recoverable from Supabase `user_notifications`)

---

## RTO and RPO Objectives

| Metric | Target | Notes |
|--------|--------|-------|
| **RTO** (Recovery Time Objective) | ≤ 30 minutes | Time to restore from encrypted backup and validate |
| **RPO** (Recovery Point Objective) | ≤ 24 hours | Daily backups at 02:00 UTC |
| **RPO (reindex fallback)** | Real-time | Stellar blockchain is the source of truth |
| **Verification frequency** | Weekly | Every Monday at 04:00 UTC |

---

## Recovery Decision Tree

```
1. Detected data loss or corruption in Supabase
   │
   ├── Is the Stellar blockchain still intact?
   │   └── YES ──→ Can you tolerate full reindex time (minutes/hours)?
   │       ├── YES ──→ Go to: Stellar Reindex (Section 10)
   │       └── NO  ──→ Go to: Backup Restoration (Section 7)
   │
   ├── Is the latest backup available in R2?
   │   ├── YES ──→ Go to: Backup Restoration (Section 7)
   │   └── NO  ──→ Go to: Stellar Reindex (Section 10)
   │
   └── Is there partial corruption (specific tables)?
       ├── YES ──→ Consider targeted table restore via restore.js
       │             + reindex from blockchain for affected rows
       └── NO  ──→ Full restore + reindex validation
```

### Decision criteria

| Condition | Choose |
|-----------|--------|
| Data loss < 24 hours old | **Backup restore** (fastest, closest RPO) |
| Backup corrupt or unavailable | **Stellar reindex** (100% accurate, slower) |
| Specific table corruption | **Partial restore** + reindex for affected data |
| Total Supabase loss | **Recreate Supabase instance** → run schema → restore backup → reindex for catch-up |

---

## Architecture Overview

```
┌─────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  GitHub Actions  │       │   scripts/        │       │  Cloudflare R2    │
│  (daily cron)    │──────▶│  backup-db.sh     │──────▶│  (S3-compatible)  │
│  backup.yml      │       │  pg_dump + GPG    │       │  Encrypted dumps  │
└─────────────────┘       │  + retention       │       └──────────────────┘
                          └──────────────────┘
┌─────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  GitHub Actions  │       │   scripts/        │       │  Ephemeral PG     │
│  (weekly cron)   │──────▶│  restore-verify.sh│──────▶│  Docker container │
│  restore-verify  │       │  decrypt + restore│       │  + smoke tests    │
└─────────────────┘       │  + validate        │       └──────────────────┘
                          └──────────────────┘
```

### Key components

| Component | Description |
|-----------|-------------|
| `scripts/backup-db.sh` | Executes `pg_dump`, encrypts with GPG, uploads to R2, enforces retention |
| `scripts/restore-verify.sh` | Downloads latest backup, decrypts, restores to ephemeral PG, runs smoke tests |
| `.github/workflows/backup.yml` | Scheduled daily (02:00 UTC) — calls `backup-db.sh` |
| `.github/workflows/restore-verify.yml` | Scheduled weekly (Monday 04:00 UTC) — calls `restore-verify.sh` |
| `scripts/generate-gpg-key.sh` | One-time script to generate the GPG key pair for backup encryption |

### Retention policy

| Cadence | Retention | Cutoff |
|---------|-----------|--------|
| **Daily** | Last 30 | All backups newer than 30 days are kept |
| **Weekly** | Last 12 | For backups older than 30 days, keep one per ISO week |
| **Monthly** | Last 12 | For backups older than 12 weeks, keep one per calendar month |

---

## Prerequisites

### GitHub Secrets (required)

These secrets must be configured in the repository **Settings → Secrets and variables → Actions**:

| Secret | Description | Source |
|--------|-------------|--------|
| `SUPABASE_DB_URL` | PostgreSQL connection string | Supabase Project Settings → Database → Connection string (URI) |
| `GPG_PRIVATE_KEY` | ASCII-armored GPG private key | Run `scripts/generate-gpg-key.sh` |
| `GPG_PUBLIC_KEY` | ASCII-armored GPG public key | Run `scripts/generate-gpg-key.sh` |
| `GPG_PASSPHRASE` | Passphrase for the GPG private key | Set during key generation |
| `GPG_RECIPIENT` | GPG key email/ID (`backups@bimex.app`) | From key generation |
| `R2_ACCESS_KEY_ID` | S3-compatible access key ID | Cloudflare R2 → Manage R2 API Tokens |
| `R2_SECRET_ACCESS_KEY` | S3-compatible secret access key | Cloudflare R2 → Manage R2 API Tokens |
| `R2_ENDPOINT` | S3 endpoint URL | `https://<account>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | Bucket name | Create via Cloudflare R2 dashboard |

### Local tooling

For manual restore operations, you need:

- `pg_dump` / `pg_restore` (PostgreSQL client)
- `gpg` (GnuPG) 2.x
- `awscli` v2 (configured with R2 endpoint)
- `docker` (for ephemeral restore verification)
- Network access to R2 endpoint and target PostgreSQL

---

## Backup Restoration Procedure

### Automated restore (CI)

The weekly `restore-verify.yml` workflow handles automated restore validation. It does **not** modify the production database — it restores to an ephemeral PostgreSQL container for validation.

### Manual production restore

Use this procedure when a full production restore is required.

#### Step 1: Download the latest backup

```bash
# Configure AWS CLI for R2
export AWS_ACCESS_KEY_ID="<R2_ACCESS_KEY_ID>"
export AWS_SECRET_ACCESS_KEY="<R2_SECRET_ACCESS_KEY>"
export AWS_DEFAULT_REGION="auto"

# Find the latest backup
aws s3api list-objects \
  --bucket "${R2_BUCKET}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --query "Contents[?contains(Key, 'bimex-db-') && !contains(Key, 'audit/')].[Key,LastModified]" \
  --output text | sort -k2 -r | head -1

# Download it
aws s3 cp "s3://${R2_BUCKET}/<BACKUP_FILE>" ./backup.sql.gz.gpg \
  --endpoint-url "${R2_ENDPOINT}"
```

#### Step 2: Decrypt

```bash
gpg --batch --yes --output backup.sql.gz \
  --decrypt backup.sql.gz.gpg

# Verify integrity
gzip -t backup.sql.gz
echo "SHA256: $(sha256sum backup.sql.gz)"
```

#### Step 3: Restore to production

```bash
# Option A: Direct restore (custom format)
pg_restore \
  --host=<SUPABASE_HOST> \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --format=custom \
  --clean \
  --if-exists \
  --verbose \
  backup.sql.gz

# Option B: Restore to a new database (safer — allows validation first)
pg_restore \
  --host=<SUPABASE_HOST> \
  --port=5432 \
  --username=postgres \
  --dbname=bimex_restored \
  --format=custom \
  --verbose \
  backup.sql.gz
```

> **Warning:** `--clean` drops existing objects before restoring. Use with extreme caution in production.

#### Step 4: Validate (see Section 8)

#### Step 5: Promote restored database (if using new DB name)

```sql
-- Close all connections to the original database
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'bimex'
  AND pid <> pg_backend_pid();

-- Drop original and rename
DROP DATABASE IF EXISTS bimex_old;
ALTER DATABASE bimex RENAME TO bimex_old;
ALTER DATABASE bimex_restored RENAME TO bimex;

-- Re-run schema migrations if any tables are missing
-- (e.g., user_notifications, reportes_mensuales, yield_snapshots)
psql < bimex-indexer/supabase/migration_notifications.sql
psql < bimex-indexer/supabase/migration_reporte_mensual.sql
```

#### Step 6: Update application DNS or connection strings

If Supabase project was recreated, update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend and indexer configuration.

---

## Validation Procedure

### Smoke tests (automated in restore-verify.yml)

The restore verification workflow runs these queries against the restored database:

```sql
SELECT count(*) FROM proyectos;
SELECT count(*) FROM aportaciones;
SELECT count(*) FROM eventos;
SELECT count(*) FROM audit_log;
SELECT count(*) FROM proyecto_evidencia;
SELECT count(*) FROM user_notifications;
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('proyectos','aportaciones','eventos','audit_log','proyecto_evidencia','user_notifications');
```

### Manual validation

After a production restore, additionally verify:

```sql
-- Check for orphaned aportaciones (no matching proyecto)
SELECT DISTINCT a.proyecto_id
FROM aportaciones a
LEFT JOIN proyectos p ON a.proyecto_id = p.id
WHERE p.id IS NULL;

-- Check for orphaned proyecto_evidencia
SELECT DISTINCT e.proyecto_id
FROM proyecto_evidencia e
LEFT JOIN proyectos p ON e.proyecto_id = p.id
WHERE p.id IS NULL;

-- Verify record counts against the last audit log
-- Compare with the audit log uploaded alongside each backup
SELECT 'proyectos', count(*) FROM proyectos
UNION ALL
SELECT 'aportaciones', count(*) FROM aportaciones
UNION ALL
SELECT 'eventos', count(*) FROM eventos;

-- Spot-check a known project
SELECT id, nombre, estado, meta, total_aportado, yield_entregado
FROM proyectos
WHERE nombre IS NOT NULL
LIMIT 5;
```

### Data quality checks

```sql
-- Monetary fields should be non-negative
SELECT count(*) FROM proyectos WHERE meta < 0;
SELECT count(*) FROM aportaciones WHERE monto <= 0;
SELECT count(*) FROM proyectos WHERE total_aportado < 0;

-- State machine sanity
SELECT estado, count(*) FROM proyectos GROUP BY estado;
```

---

## Rollback Procedure

If the restored database has issues:

1. **If you used `--clean`**: The original data is overwritten. Recover from the previous backup:
   ```bash
   aws s3 cp "s3://${R2_BUCKET}/<PREVIOUS_BACKUP>" . --endpoint-url "${R2_ENDPOINT}"
   # Decrypt and restore
   ```

2. **If you used a new database name**: Simply re-point the application to the original database and diagnose the restored copy offline.

3. **If the backup itself is corrupt**: Fall back to [Stellar Reindex](#stellar-reindex--fallback-recovery-path).

4. **If Supabase is unreachable**: Create a new Supabase project, run all schema files, restore the backup, then update environment variables.

---

## Stellar Reindex — Fallback Recovery Path

### When to use

- **Total Supabase loss** with no recent valid backup
- **Backup corruption** detected by restore-verify failure
- **Backup missing** due to retention expiry or accidental deletion
- **Data inconsistency** requiring reconstruction from the source of truth

### How it works

The Stellar blockchain is the **source of truth** for all platform data. The indexer (`bimex-indexer/index.js`) continuously polls Soroban RPC for on-chain events and persists them to Supabase. The `reindex.js` script replays this process from any starting ledger.

### Procedure

```bash
cd bimex-indexer

# 1. (If Supabase is new) Run schema
psql "$SUPABASE_DB_URL" < schema.sql
psql "$SUPABASE_DB_URL" < supabase/migration_notifications.sql
psql "$SUPABASE_DB_URL" < supabase/migration_reporte_mensual.sql

# 2. Dry run first
node scripts/reindex.js --dry-run --from-ledger 1

# 3. Clear existing data (DESTRUCTIVE — only if confirmed)
node scripts/reindex.js --clear --from-ledger 1

# 4. Validate
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM proyectos;"
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM eventos;"
```

### Limitations

| Data Source | Recoverable via reindex? | Notes |
|-------------|------------------------|-------|
| `proyectos` | ✅ Yes | Reconstructed from `crear_proyecto` events |
| `aportaciones` | ✅ Yes | Reconstructed from `contribuir` events |
| `eventos` | ✅ Yes | Directly from Soroban event logs |
| `audit_log` | ✅ Yes | Admin actions emit on-chain events |
| `proyecto_evidencia` | ❌ No | Stored in Supabase only (evidence uploads) |
| `user_notifications` | ❌ No | User-submitted email preferences |
| `reportes_mensuales` | ❌ No | Derived data (can be regenerated) |
| `yield_snapshots` | ❌ No | Derived data (can be regenerated) |

> **Important:** After reindex, `proyecto_evidencia`, `user_notifications`, and `reportes_mensuales`/`yield_snapshots` must be restored from backup or recreated by users.

### Time estimates

| Ledger range | Estimated time | Notes |
|-------------|---------------| ------|
| 1 – 100,000 | ~2–5 minutes | Small testnet deployments |
| 1 – 1,000,000 | ~20–60 minutes | Moderate mainnet usage |
| 1 – 10,000,000 | ~2–8 hours | High-traffic mainnet |

Estimates assume default batch size (200) and 10-second poll interval. Adjust `POLL_INTERVAL_MS` for faster replay when reindexing.

### When to restore from backup vs. reindex

| Factor | Backup Restore | Stellar Reindex |
|--------|---------------|------------------|
| **Speed** | Minutes | Minutes to hours |
| **Completeness** | Full (all tables) | Partial (blockchain data only) |
| **Accuracy** | Depends on backup freshness | 100% (source of truth) |
| **Requires valid backup** | Yes | No |
| **Requires Stellar RPC access** | No | Yes |
| **Restores user preferences** | Yes | No |
| **Restores evidence files** | Yes | No |
| **Operational complexity** | Low | Medium |

---

## Escalation Contacts

| Role | Name | Contact | Notes |
|------|------|---------|-------|
| **SRE / Database Admin** | [TBD] | [TBD] | Primary restore operator |
| **Backend Lead** | [TBD] | [TBD] | Reindex coordination |
| **Smart Contract Lead** | [TBD] | [TBD] | Contract state verification |
| **Engineering Manager** | [TBD] | [TBD] | Incident communication |
| **Cloudflare R2 access** | [TBD] | [TBD] | Backup storage access |
| **Supabase access** | [TBD] | [TBD] | Database project admin |

> **Note:** Populate this table with actual personnel during onboarding. Store contact information in a secure internal wiki or 1Password vault.

---

## Post-Incident Verification Checklist

After any restore or reindex operation, complete this checklist:

- [ ] **All smoke tests pass** — Count queries return expected non-zero values
- [ ] **No orphaned records** — `LEFT JOIN` checks return zero rows
- [ ] **State machine sanity** — Project statuses match expected distribution
- [ ] **Monetary fields valid** — No negative `meta`, `monto`, or `total_aportado`
- [ ] **Frontend loads** — `/`, `/proyectos`, `/impacto` render correctly
- [ ] **Contributions display** — Backer can see their contributions in MiCuenta
- [ ] **Evidence files load** — `proyecto_evidencia` URLs resolve (IPFS)
- [ ] **Email notifications work** — User can update preferences in MiCuenta
- [ ] **Indexer is syncing** — `/health` endpoint shows `supabaseOk: true`, no errors
- [ ] **Audit log intact** — Admin actions are present and match expectations
- [ ] **Backup audit uploaded** — New backup was created post-restore with audit log
- [ ] **Weekly restore-verify passes** — Next Monday's automated run shows ✅ green

### Incident report template

```markdown
## Database Restore Incident Report

**Date:** YYYY-MM-DD
**Incident ID:** INC-###
**Severity:** SEV1 / SEV2 / SEV3
**Restore method:** Backup / Reindex / Hybrid

**Root cause:**
[Description of what caused the data loss]

**Recovery steps taken:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**RTO met?** Yes / No (actual: XX minutes)
**RPO met?** Yes / No (data loss window: XX hours)

**Verification results:**
- proyectos: {count}
- aportaciones: {count}
- eventos: {count}
- All smoke tests: PASS

**Action items:**
- [ ] Update runbook with lessons learned
- [ ] Improve monitoring/alerting
- [ ] Review backup retention
```

---

## Appendix: Secrets Inventory

| Secret | Where Used | Rotation | Notes |
|--------|-----------|----------| ------|
| `SUPABASE_DB_URL` | `backup.yml` | Per-project | Connection string with password |
| `GPG_PRIVATE_KEY` | `restore-verify.yml` | 5 years (key expiry) | Store offline backup |
| `GPG_PUBLIC_KEY` | `backup.yml` | 5 years (key expiry) | Can be stored in-repo |
| `GPG_PASSPHRASE` | `restore-verify.yml` | Per-incident | Store in password manager |
| `GPG_RECIPIENT` | `backup.yml` | 5 years (key expiry) | Email matching key UID |
| `R2_ACCESS_KEY_ID` | Both workflows | Per-token | R2 API token |
| `R2_SECRET_ACCESS_KEY` | Both workflows | Per-token | R2 API token |
| `R2_ENDPOINT` | Both workflows | Rarely | Changes if provider changes |
| `R2_BUCKET` | Both workflows | Rarely | Changes if bucket recreated |

## Appendix: R2 Bucket Structure

```
bimex-backups/
├── bimex-db-20260624-020000.sql.gz.gpg    # Encrypted backup
├── bimex-db-20260623-020000.sql.gz.gpg
├── ...
└── audit/
    ├── backup-20260624-020000.log          # Audit log
    ├── backup-20260623-020000.log
    └── ...
```

### Naming convention

```
bimex-db-<YYYYMMDD>-<HHMMSS>.sql.gz.gpg
```

- `YYYYMMDD` — UTC date of backup
- `HHMMSS` — UTC time of backup
- `.sql.gz` — gzip-compressed PostgreSQL custom-format dump
- `.gpg` — GPG AES256 encryption wrapper

### Audit log format

```
BACKUP_TIMESTAMP=20260624-020000
BACKUP_FILE=bimex-db-20260624-020000.sql.gz
SHA256=<64-char hex digest>
BACKUP_SIZE=<bytes>
ENCRYPTED_SIZE=<bytes>
PGP_DUMP_EXIT_CODE=0
GPG_ENCRYPT_EXIT_CODE=0
UPLOAD_STATUS=success
```
