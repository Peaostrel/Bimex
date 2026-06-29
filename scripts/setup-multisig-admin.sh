#!/usr/bin/env bash
# =============================================================================
# setup-multisig-admin.sh — Crea cuenta Stellar multi-sig 2-of-3 para admin
# =============================================================================
# Uso:
#   bash scripts/setup-multisig-admin.sh testnet [--fund <secret>]
#   bash scripts/setup-multisig-admin.sh mainnet [--fund <secret>]
#
# Pasos:
#   1. Genera 3 keypairs para custodios (hardware wallets recomendado)
#   2. Genera la cuenta multi-sig (master weight = 0)
#   3. Opcional: funda la cuenta + configura SetOptions automáticamente
#   4. Imprime JSON con direcciones y secrets para distribuir
# =============================================================================
set -euo pipefail

NETWORK="${1:-}"
FLAG_FUND="${2:-}"
FUND_SECRET="${3:-}"

if [[ "$NETWORK" != "testnet" && "$NETWORK" != "mainnet" ]]; then
  echo "Uso: bash scripts/setup-multisig-admin.sh <testnet|mainnet> [--fund <secret>]"
  exit 1
fi

# locate stellar-sdk — prefer bimex-indexer
SDK_DIR=""
if [ -d "bimex-indexer/node_modules/@stellar/stellar-sdk" ]; then
  SDK_DIR="bimex-indexer"
elif [ -d "bimex-frontend/node_modules/@stellar/stellar-sdk" ]; then
  SDK_DIR="bimex-frontend"
fi

if [ -z "$SDK_DIR" ] && [ "$FLAG_FUND" == "--fund" ]; then
  echo "Instalando @stellar/stellar-sdk en bimex-indexer..."
  (cd bimex-indexer && npm install --silent)
  SDK_DIR="bimex-indexer"
fi

NODE_SCRIPT="scripts/setup-multisig-account.mjs"

if [ "$FLAG_FUND" == "--fund" ]; then
  NODE_PATH="$SDK_DIR/node_modules" node "$NODE_SCRIPT" "$NETWORK" "" "$FUND_SECRET"
else
  echo "Generando keys (dry-run, sin fundir)..."
  NODE_PATH="$SDK_DIR/node_modules" node "$NODE_SCRIPT" "$NETWORK"
fi

echo ""
echo "============================================================"
echo " INSTRUCCIONES"
echo "============================================================"
echo ""
echo "1. Distribuye los 3 secrets de custodio a cada custodio"
echo "   (hardware wallet / offline storage recomendado)"
echo "2. Funde la cuenta multi-sig desde admin:"
echo "   Enviar almenos 10 XLM a <multisig_address>"
echo "3. Una vez fundada, ejecutar SetOptions:"
echo "   - Master weight = 0"
echo "   - Low/Med/High threshold = 2"
echo "   - 3 signers con weight = 1"
echo "4. Verificar:"
echo "   curl https://horizon${NETWORK}.stellar.org/accounts/<multisig_address>"
echo ""
echo "Para configuracion automatica:"
echo "  bash scripts/setup-multisig-admin.sh $NETWORK --fund <admin_secret>"
echo ""
echo "Luego migrar admin con:"
echo "  bash scripts/migrate-to-multisig.sh"
echo "============================================================"
