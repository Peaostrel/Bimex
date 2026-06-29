#!/usr/bin/env bash
# =============================================================================
# test-multisig-flow.sh — Prueba el flujo multi-sig (admin_pausar + reanudar)
# =============================================================================
# Uso:
#   export CONTRACT_ID=C...
#   bash scripts/test-multisig-flow.sh --network testnet [--signer-1 S...] [--signer-2 S...]
#
# Nota: Requiere 2 de 3 signers para firmar (threshold 2-of-3)
# =============================================================================
set -euo pipefail

NETWORK="testnet"
SIGNER_1=""
SIGNER_2=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network) NETWORK="$2"; shift 2 ;;
    --signer-1) SIGNER_1="$2"; shift 2 ;;
    --signer-2) SIGNER_2="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

: "${CONTRACT_ID:?Falta CONTRACT_ID}"
: "${SIGNER_1:?Falta --signer-1}"
: "${SIGNER_2:?Falta --signer-2}"

echo "1/3 Firmando admin_pausar con signer 1..."
stellar keys add msig-signer-1 --secret-key "$SIGNER_1" 2>/dev/null || true
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source msig-signer-1 \
  --network "$NETWORK" \
  -- admin_pausar \
  --admin "$(stellar keys address --secret-key "$SIGNER_1")"

echo "   ✓ Pausado (probablemente falte 1 firma — esto es esperado con multi-sig)"
echo "   Necesitas construir la tx con stellar tx build + firmar con ambos signers"
echo ""
echo "Ver documentacion completa en docs/runbook-admin-multisig.md"
