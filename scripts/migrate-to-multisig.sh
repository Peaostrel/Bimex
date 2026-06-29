#!/usr/bin/env bash
# =============================================================================
# migrate-to-multisig.sh — Migra admin del contrato a cuenta multi-sig
# =============================================================================
# Uso:
#   export CONTRACT_ID=C...         # Contract ID del contrato Bimex
#   export ADMIN_SECRET=S...        # Clave secreta del admin ACTUAL
#   export MULTISIG_ADDRESS=G...    # Dirección de la cuenta multi-sig
#   bash scripts/migrate-to-multisig.sh [--network testnet|mainnet]
# =============================================================================
set -euo pipefail

NETWORK="${1:-mainnet}"
: "${CONTRACT_ID:?Falta CONTRACT_ID}"
: "${ADMIN_SECRET:?Falta ADMIN_SECRET}"
: "${MULTISIG_ADDRESS:?Falta MULTISIG_ADDRESS}"

echo "============================================================"
echo " Migrar admin del contrato a multi-sig"
echo "============================================================"
echo " Contract ID     : $CONTRACT_ID"
echo " Admin actual    : $(stellar keys address --secret-key "$ADMIN_SECRET" 2>/dev/null || echo '?')"
echo " Nuevo admin     : $MULTISIG_ADDRESS"
echo " Network         : $NETWORK"
echo "============================================================"
echo ""

read -p "¿Confirmar migración? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "Cancelado"
  exit 0
fi

stellar keys add multisig-migrate --secret-key "$ADMIN_SECRET" 2>/dev/null || true

echo "Ejecutando admin_cambiar_admin..."

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source multisig-migrate \
  --network "$NETWORK" \
  -- admin_cambiar_admin \
  --admin_actual "$(stellar keys address --secret-key "$ADMIN_SECRET")" \
  --nuevo_admin "$MULTISIG_ADDRESS"

stellar keys remove multisig-migrate 2>/dev/null || true

echo ""
echo "✓ Admin migrado a multi-sig: $MULTISIG_ADDRESS"
echo ""
echo "Verificar en explorer:"
echo "  https://stellar.expert/explorer/${NETWORK}/contract/$CONTRACT_ID"
echo "Probar flujo multi-sig completo:"
echo "  bash scripts/test-multisig-flow.sh --network $NETWORK"
