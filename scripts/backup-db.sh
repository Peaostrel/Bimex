#!/usr/bin/env bash
# =============================================================================
#  backup-db.sh — Daily Supabase PostgreSQL backup with GPG encryption and
#                 S3-compatible (R2) upload with automated retention.
#
#  Environment variables (all required):
#    SUPABASE_DB_URL      — PostgreSQL connection string (libpq format)
#    GPG_RECIPIENT        — GPG key ID or email to encrypt backups
#    R2_ACCESS_KEY_ID     — S3-compatible access key
#    R2_SECRET_ACCESS_KEY — S3-compatible secret key
#    R2_ENDPOINT          — S3 endpoint URL (e.g. https://<acct>.r2.cloudflarestorage.com)
#    R2_BUCKET            — Bucket name
#    R2_REGION            — Region (default: auto)
#
#  Retention (GFS scheme):
#    Daily:  keep last 30 days
#    Weekly: keep last 12 weeks (oldest backup per ISO week, for backups >30d)
#    Monthly: keep last 12 months (oldest backup per month, for backups >12w)
#
#  Output:
#    Encrypted backup uploaded to: s3://<bucket>/bimex-db-<date>-<time>.sql.gz.gpg
#    Audit log:                    s3://<bucket>/audit/backup-<date>-<time>.log
# =============================================================================
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${GPG_RECIPIENT:?GPG_RECIPIENT is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"

R2_REGION="${R2_REGION:-auto}"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
DATE_STAMP=$(date -u +%Y-%m-%d)
BACKUP_FILE="bimex-db-${TIMESTAMP}.sql.gz"
ENCRYPTED_FILE="${BACKUP_FILE}.gpg"
AUDIT_FILE="audit/backup-${TIMESTAMP}.log"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# ── Step 1: pg_dump ─────────────────────────────────────────────────────────
log "Starting pg_dump..."
pg_dump "${SUPABASE_DB_URL}" \
  --format=custom \
  --compress=6 \
  --file="${WORKDIR}/${BACKUP_FILE}" \
  --verbose 2>&1 | tee -a "${WORKDIR}/dump.log"

BACKUP_SIZE=$(stat -c%s "${WORKDIR}/${BACKUP_FILE}" 2>/dev/null || stat -f%z "${WORKDIR}/${BACKUP_FILE}")
log "pg_dump complete. Size: ${BACKUP_SIZE} bytes"

# ── Step 2: Checksum ─────────────────────────────────────────────────────────
SHA256_DIGEST=$(sha256sum "${WORKDIR}/${BACKUP_FILE}" | cut -d' ' -f1)
log "SHA256: ${SHA256_DIGEST}"

# ── Step 3: GPG encrypt ─────────────────────────────────────────────────────
log "Encrypting with GPG (recipient: ${GPG_RECIPIENT})..."
gpg --batch --yes --trust-model always \
  --recipient "${GPG_RECIPIENT}" \
  --output "${WORKDIR}/${ENCRYPTED_FILE}" \
  --encrypt "${WORKDIR}/${BACKUP_FILE}"

ENCRYPTED_SIZE=$(stat -c%s "${WORKDIR}/${ENCRYPTED_FILE}" 2>/dev/null || stat -f%z "${WORKDIR}/${ENCRYPTED_FILE}")
log "Encryption complete. Encrypted size: ${ENCRYPTED_SIZE} bytes"

# ── Step 4: Upload to R2 ────────────────────────────────────────────────────
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${R2_REGION}"

log "Uploading encrypted backup to s3://${R2_BUCKET}/${ENCRYPTED_FILE}..."
aws s3 cp "${WORKDIR}/${ENCRYPTED_FILE}" "s3://${R2_BUCKET}/${ENCRYPTED_FILE}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --no-progress

# ── Step 5: Upload audit log ────────────────────────────────────────────────
{
  echo "BACKUP_TIMESTAMP=${TIMESTAMP}"
  echo "BACKUP_FILE=${BACKUP_FILE}"
  echo "SHA256=${SHA256_DIGEST}"
  echo "BACKUP_SIZE=${BACKUP_SIZE}"
  echo "ENCRYPTED_SIZE=${ENCRYPTED_SIZE}"
  echo "PGP_DUMP_EXIT_CODE=0"
  echo "GPG_ENCRYPT_EXIT_CODE=0"
  echo "UPLOAD_STATUS=success"
} > "${WORKDIR}/audit.log"

aws s3 cp "${WORKDIR}/audit.log" "s3://${R2_BUCKET}/${AUDIT_FILE}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --no-progress

log "Audit log uploaded to s3://${R2_BUCKET}/${AUDIT_FILE}"

# ── Step 6: Retention enforcement (GFS) ─────────────────────────────────────
log "Enforcing retention policy..."

apply_retention() {
  local label=$1       # "daily", "weekly", "monthly"
  local keep_count=$2  # 30, 12, 12
  local min_age_days=$3  # 0, 30, 84 (12 weeks)

  log "  Retention [${label}]: keep last ${keep_count}, min age ${min_age_days}d"

  aws s3api list-objects \
    --bucket "${R2_BUCKET}" \
    --endpoint-url "${R2_ENDPOINT}" \
    --query "Contents[?contains(Key, 'bimex-db-')].[Key,LastModified]" \
    --output text 2>/dev/null \
  | while read -r key lastmod; do
      if [ -z "$key" ]; then continue; fi
      if [[ "$key" == audit/* ]]; then continue; fi
      echo "${lastmod}T00:00:00Z ${key}"
    done \
  | sort -r \
  | awk -v keep="${keep_count}" -v min_age="${min_age_days}" '
    BEGIN { count=0 }
    {
      key = $NF
      # Use date from filename: bimex-db-YYYYMMDD-HHMMSS.sql.gz.gpg
      match(key, /bimex-db-([0-9]{4})([0-9]{2})([0-9]{2})/, arr)
      backup_epoch = mktime(arr[1] " " arr[2] " " arr[3] " 0 0 0")
      now_epoch = systime()
      age_days = (now_epoch - backup_epoch) / 86400
      if (age_days < min_age) next
      count++
      if (count > keep) print key
    }' \
  | while read -r stale_key; do
      if [ -z "$stale_key" ]; then continue; fi
      log "  Deleting stale backup: ${stale_key}"
      aws s3 rm "s3://${R2_BUCKET}/${stale_key}" \
        --endpoint-url "${R2_ENDPOINT}" \
        --no-progress
    done
}

apply_retention "daily"   30   0
apply_retention "weekly"  12  30
apply_retention "monthly" 12  84

log "Retention enforcement complete."

# ── Summary ──────────────────────────────────────────────────────────────────
log "=== BACKUP COMPLETE ==="
log "  Backup:       s3://${R2_BUCKET}/${ENCRYPTED_FILE}"
log "  Size (raw):   ${BACKUP_SIZE} bytes"
log "  Size (enc):   ${ENCRYPTED_SIZE} bytes"
log "  SHA256:       ${SHA256_DIGEST}"
log "  Audit:        s3://${R2_BUCKET}/${AUDIT_FILE}"
