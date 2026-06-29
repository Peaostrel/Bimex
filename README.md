# Bimex

> Zero-loss social impact crowdfunding on Stellar/Soroban

[![CI](https://github.com/David1984TK/Bimex/actions/workflows/ci.yml/badge.svg)](https://github.com/David1984TK/Bimex/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Network: Testnet](https://img.shields.io/badge/Network-Stellar%20Testnet-brightgreen)](https://stellar.expert/explorer/testnet/)
[![Contract](https://img.shields.io/badge/Contract-Soroban-orange)](https://soroban.stellar.org)
[![Frontend](https://img.shields.io/badge/Frontend-Vercel-black)](https://bimex-frontend.vercel.app)
[![Security](https://img.shields.io/badge/Security-Open-green)](./.github/SECURITY.md)
For responsible disclosure, see our [Security Policy](.github/SECURITY.md).

Contributors lock MXNe stablecoin into the contract. The yield (~13.45% APY) funds the project. When the project completes, every contributor gets their exact principal back — zero loss.

## How it works

```
Contributor locks MXNe
        │
        ├─ 50% → CETES (9.45% APY) ─┐
        ├─ 50% → AMM   (4.00% APY) ─┴─→ Yield goes to project owner
        │
        └─ Project completes → contributor withdraws 100% of principal
```

## 🚀 Pilot Project

We're launching our first real-world project on Mainnet! Check out the complete guide:

- [Pilot Project Guide](docs/guia-proyecto-piloto.md) - Complete onboarding process
- [Executive Checklist](docs/checklist-ejecutivo-piloto.md) - Step-by-step checklist
- [Marketing Plan](docs/plan-marketing-piloto.md) - Communication strategy
- [Scripts](scripts/README.md) - Helper scripts for deployment

**Status**: Ready to launch | **Timeline**: 9 weeks | **Budget**: $15,000 MXN

## Quick start

```bash
# Frontend
cd bimex-frontend
npm install
cp .env.example .env.local   # fill in contract IDs
npm run dev                  # http://localhost:5173

# Contract (only if modifying)
cd bimex
cargo test
stellar contract build
```

## Documentation

| Document | Description |
|---|---|
| [Technical docs](DOCUMENTACION.txt) | Deployment, contract functions, lifecycle, changelog |
| [Contributor guide](docs/guia-contribuidor.md) | How to back a project as a user |
| [Project creator guide](docs/guia-creador-proyecto.md) | How to launch a project on Bimex |
| [Technical integration guide](docs/guia-tecnica-integracion.md) | ABI, CLI examples, JS SDK integration |
| [Pilot project guide](docs/guia-proyecto-piloto.md) | First real-world project on Mainnet |
| [API reference](docs/api.md) | Indexer endpoints, rate limits, configuration |
| [FAQ (español)](docs/faq-es.md) | Preguntas frecuentes |
| [FAQ (English)](docs/faq-en.md) | Frequently asked questions |
| [Security policy](SECURITY.md) | Bug bounty program and responsible disclosure |
| [Threat model](docs/THREAT-MODEL.md) | Assets, threat actors, and attack surface |
| [Contract invariants](docs/CONTRACT-INVARIANTS.md) | Properties the smart contract must never violate |
| [Bug bounty Tier 2](docs/SECURITY-BOUNTY-TIER2.md) | Platform decision and budget for the post-launch program |

## Contract addresses (Testnet)

| Resource | ID |
|---|---|
| Bimex contract | `CDFFTEQLNIG2RAUONFXSQX2YS2UTQTCBEUAPK6S42XFNIOQEYPBJVH5T` |
| MXNe SAC token | `CDDIGHPVTW4PSCQCU67NQ4NXZ4NX5GDLNL3O67WT5RQ4GT6RXIEYPC4T` |
| Soroban RPC | `https://soroban-testnet.stellar.org` |

## Stack

- **Smart contract**: Rust / Soroban SDK (WASM)
- **Frontend**: React 19 + Vite + Stellar SDK v14
- **Wallet**: Freighter
- **Deploy**: Vercel (frontend) · Stellar Testnet (contract)

## Security

This repository has active **Secret Scanning** and **Push Protection** enabled to prevent accidental exposure of credentials and secrets (such as Stellar secret keys or Supabase service role tokens). 

Please ensure you do not commit any secrets. Any push containing suspected secrets will be automatically blocked by GitHub.
