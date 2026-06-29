#!/usr/bin/env bash
# =============================================================================
#  generate-gpg-key.sh — One-time GPG key pair generation for backup encryption.
#
#  Run this ONCE on a trusted machine to create the backup encryption keys.
#  The public key is used by the daily backup workflow to encrypt backups.
#  The private key is stored as a GitHub Secret and used by the weekly
#  restore-verify workflow for decryption.
#
#  Output:
#    ./gpg-backup-key.pub   — Public key (safe to share, store in repo secrets)
#    ./gpg-backup-key.asc   — Private key (SECRET! store as GitHub Secret)
#
#  Usage:
#    bash scripts/generate-gpg-key.sh
#
#  After running:
#    1. Store ./gpg-backup-key.asc as GitHub Secret: GPG_PRIVATE_KEY
#    2. Store the passphrase you enter as GitHub Secret: GPG_PASSPHRASE
#    3. Copy ./gpg-backup-key.pub content as GitHub Variable: GPG_PUBLIC_KEY
#    4. Keep a secure offline backup of both keys
# =============================================================================
set -euo pipefail

OUTPUT_DIR="."
KEY_NAME="bimex-backup-encryption"
KEY_EMAIL="backups@bimex.app"
KEY_EXPIRE="5y"

echo "============================================"
echo " Bimex — GPG Backup Encryption Key Generation"
echo "============================================"
echo ""
echo "This script will generate a GPG key pair for encrypting database backups."
echo ""
echo "You will be prompted to enter a passphrase for the private key."
echo "THIS PASSPHRASE IS CRITICAL — store it securely."
echo ""

read -r -p "Enter output directory [${OUTPUT_DIR}]: " INPUT_DIR
OUTPUT_DIR="${INPUT_DIR:-${OUTPUT_DIR}}"
mkdir -p "${OUTPUT_DIR}"

# Generate batch config for unattended key generation
cat > /tmp/gpg-batch-config.txt <<EOF
%echo Generating Bimex backup encryption key
Key-Type: RSA
Key-Length: 4096
Key-Usage: encrypt
Name-Real: ${KEY_NAME}
Name-Email: ${KEY_EMAIL}
Expire-Date: ${KEY_EXPIRE}
%no-protection
%commit
%echo Key generation complete
EOF

echo "Generating RSA 4096-bit encryption key (expires: ${KEY_EXPIRE})..."
gpg --batch --gen-key /tmp/gpg-batch-config.txt 2>&1

# Get the key ID
KEY_ID=$(gpg --list-keys --with-colons "${KEY_EMAIL}" 2>/dev/null \
  | grep '^pub:' | head -1 | cut -d: -f5)

if [ -z "$KEY_ID" ]; then
  echo "ERROR: Could not find generated key. Exiting."
  exit 1
fi

echo ""
echo "Key generated: ${KEY_ID}"

# Export public key
gpg --batch --yes --armor --export "${KEY_ID}" > "${OUTPUT_DIR}/gpg-backup-key.pub"
echo "Public key exported: ${OUTPUT_DIR}/gpg-backup-key.pub"

# Export private key
echo ""
echo "============================================"
echo " IMPORTANT: You will now be prompted for the"
echo " passphrase to export the PRIVATE KEY."
echo "============================================"
echo ""
gpg --batch --yes --armor --export-secret-keys "${KEY_ID}" > "${OUTPUT_DIR}/gpg-backup-key.asc"
echo "Private key exported: ${OUTPUT_DIR}/gpg-backup-key.asc"

echo ""
echo "============================================"
echo " SUCCESS — Keys generated"
echo "============================================"
echo ""
echo "  Public key:  ${OUTPUT_DIR}/gpg-backup-key.pub"
echo "  Private key: ${OUTPUT_DIR}/gpg-backup-key.asc"
echo "  Key ID:      ${KEY_ID}"
echo "  Recipient:   ${KEY_EMAIL}"
echo ""
echo "NEXT STEPS:"
echo "  1. Add these secrets to GitHub:"
echo "     - GPG_PRIVATE_KEY  (contents of gpg-backup-key.asc)"
echo "     - GPG_PASSPHRASE   (the passphrase you entered)"
echo "     - GPG_RECIPIENT    (${KEY_EMAIL})"
echo ""
echo "  2. Verify your encrypted backup:"
echo "     gpg --decrypt backup.sql.gz.gpg 2>/dev/null | head -c 100"
echo ""
echo "  3. Keep a secure OFFLINE backup of both key files."
echo "     If the private key is lost, EXISTING BACKUPS ARE UNRECOVERABLE."
echo "============================================"

rm -f /tmp/gpg-batch-config.txt
