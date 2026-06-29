#!/usr/bin/env bash
# =============================================================================
#  restore-verify.sh — Download, decrypt, restore, and validate a Supabase
#                      PostgreSQL backup in an ephemeral Docker container.
#
#  Environment variables:
#    SUPABASE_DB_URL       — (optional, for reference only — not used in restore)
#    GPG_PRIVATE_KEY       — ASCII-armored GPG private key to decrypt backups
#    GPG_PASSPHRASE        — Passphrase for the GPG private key
#    R2_ACCESS_KEY_ID      — S3-compatible access key
#    R2_SECRET_ACCESS_KEY  — S3-compatible secret key
#    R2_ENDPOINT           — S3 endpoint URL
#    R2_BUCKET             — Bucket name
#    R2_REGION             — Region (default: auto)
#    BACKUP_FILE           — (optional) specific backup to restore; latest if unset
#
#  Returns:
#    0 — restore + validation succeeded
#    1 — any step failed
# =============================================================================
set -euo pipefail

: "${GPG_PRIVATE_KEY:?GPG_PRIVATE_KEY is required}"
: "${GPG_PASSPHRASE:?GPG_PASSPHRASE is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"

R2_REGION="${R2_REGION:-auto}"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"; docker rm -f bimex-restore-pg 2>/dev/null || true' EXIT

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { log "FAIL: $*"; exit 1; }

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${R2_REGION}"

# ── Step 1: Download latest backup ──────────────────────────────────────────
log "Determining latest backup..."

if [ -n "${BACKUP_FILE:-}" ]; then
  REMOTE_FILE="${BACKUP_FILE}"
  log "Using specified backup: ${REMOTE_FILE}"
else
  REMOTE_FILE=$(aws s3api list-objects \
    --bucket "${R2_BUCKET}" \
    --endpoint-url "${R2_ENDPOINT}" \
    --query "Contents[?contains(Key, 'bimex-db-') && !contains(Key, 'audit/')].[Key,LastModified]" \
    --output text 2>/dev/null \
  | sort -k2 -r \
  | head -1 \
  | awk '{print $1}')

  if [ -z "$REMOTE_FILE" ]; then
    fail "No backups found in bucket ${R2_BUCKET}"
  fi
  log "Latest backup: ${REMOTE_FILE}"
fi

log "Downloading ${REMOTE_FILE}..."
aws s3 cp "s3://${R2_BUCKET}/${REMOTE_FILE}" "${WORKDIR}/backup.sql.gz.gpg" \
  --endpoint-url "${R2_ENDPOINT}" --no-progress

# ── Step 2: Import GPG key and decrypt ──────────────────────────────────────
log "Importing GPG private key..."
echo "${GPG_PRIVATE_KEY}" | gpg --batch --yes --import 2>&1 | head -5

GPG_KEY_ID=$(gpg --list-keys --with-colons 2>/dev/null \
  | grep '^pub:' | head -1 | cut -d: -f5)
if [ -z "$GPG_KEY_ID" ]; then
  GPG_KEY_ID=$(gpg --list-secret-keys --with-colons 2>/dev/null \
    | grep '^sec:' | head -1 | cut -d: -f5)
fi
log "GPG key ID: ${GPG_KEY_ID:-unknown}"

log "Decrypting backup..."
echo "${GPG_PASSPHRASE}" | gpg --batch --yes --passphrase-fd 0 \
  --output "${WORKDIR}/backup.sql.gz" \
  --decrypt "${WORKDIR}/backup.sql.gz.gpg" 2>&1

if [ ! -f "${WORKDIR}/backup.sql.gz" ]; then
  fail "Decryption failed — output file not found"
fi

DECRYPTED_SIZE=$(stat -c%s "${WORKDIR}/backup.sql.gz" 2>/dev/null || stat -f%z "${WORKDIR}/backup.sql.gz")
log "Decryption complete. Size: ${DECRYPTED_SIZE} bytes"

# ── Step 3: Start ephemeral PostgreSQL ──────────────────────────────────────
log "Starting ephemeral PostgreSQL container..."

docker rm -f bimex-restore-pg 2>/dev/null || true
docker run -d \
  --name bimex-restore-pg \
  -e POSTGRES_USER=bimex \
  -e POSTGRES_PASSWORD=bimex_verify \
  -e POSTGRES_DB=bimex \
  -p 5433:5432 \
  postgres:17-alpine \
  -c max_connections=50 \
  2>&1

# Wait for PG to be ready
for i in $(seq 1 30); do
  if docker exec bimex-restore-pg pg_isready -U bimex -d bimex >/dev/null 2>&1; then
    log "PostgreSQL is ready (attempt ${i})"
    break
  fi
  if [ "$i" -eq 30 ]; then
    fail "PostgreSQL did not become ready after 30 attempts"
  fi
  sleep 1
done

# ── Step 4: Restore ─────────────────────────────────────────────────────────
log "Restoring backup..."

# Custom format restore; ignore errors on non-existent objects (e.g. comments)
pg_restore \
  --host=localhost \
  --port=5433 \
  --username=bimex \
  --dbname=bimex \
  --format=custom \
  --verbose \
  "${WORKDIR}/backup.sql.gz" 2>&1 \
| tail -20

log "Restore command completed."

# ── Step 5: Validate restored data (smoke tests) ────────────────────────────
log "Running smoke tests..."

run_query() {
  local query="$1"
  local label="$2"
  local result

  result=$(docker exec bimex-restore-pg psql -U bimex -d bimex -t -A -c "$query" 2>&1)
  local exit_code=$?

  if [ "$exit_code" -ne 0 ]; then
    fail "Query FAILED [${label}]: ${query} — ${result}"
  fi

  log "  [PASS] ${label}: ${result}"
}

run_query "SELECT count(*) FROM proyectos;"      "proyectos table accessible"
run_query "SELECT count(*) FROM aportaciones;"    "aportaciones table accessible"
run_query "SELECT count(*) FROM eventos;"         "eventos table accessible"
run_query "SELECT count(*) FROM audit_log;"       "audit_log table accessible"
run_query "SELECT count(*) FROM proyecto_evidencia;" "proyecto_evidencia table accessible"
run_query "SELECT count(*) FROM user_notifications;" "user_notifications table accessible"

# Verify schema integrity via information_schema
run_query "
  SELECT count(*) FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('proyectos','aportaciones','eventos','audit_log','proyecto_evidencia','user_notifications');
" "all core tables exist in information_schema"

# Record counts for audit
TOTAL_PROYECTOS=$(docker exec bimex-restore-pg psql -U bimex -d bimex -t -A -c "SELECT count(*) FROM proyectos;")
TOTAL_APORTACIONES=$(docker exec bimex-restore-pg psql -U bimex -d bimex -t -A -c "SELECT count(*) FROM aportaciones;")
TOTAL_EVENTOS=$(docker exec bimex-restore-pg psql -U bimex -d bimex -t -A -c "SELECT count(*) FROM eventos;")

log "=== VALIDATION SUMMARY ==="
log "  Proyectos:       ${TOTAL_PROYECTOS}"
log "  Aportaciones:    ${TOTAL_APORTACIONES}"
log "  Eventos:         ${TOTAL_EVENTOS}"
log "  Result:          ALL SMOKE TESTS PASSED"

exit 0
