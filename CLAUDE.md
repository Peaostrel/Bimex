# Bimex — Contexto del Proyecto

## Qué es Bimex
Plataforma de crowdfunding de impacto social construida sobre Stellar/Soroban. Los contribuidores aportan MXNe (peso mexicano estable) a proyectos; el capital siempre es recuperable. El rendimiento (CETES ~9.45% + AMM Stellar ~4%) financia el proyecto. Al finalizar, cada contribuidor recupera exactamente lo que aportó.

**Deploy:** https://bimex-frontend.vercel.app  
**Repo:** https://github.com/David1984TK/Bimex  
**Branch de trabajo:** `claude/bimex-review-wlvPQ`

## Stack
- **Smart contract:** Rust / Soroban (Stellar)
- **Frontend:** React + Vite, `bimex-frontend/`
- **Indexer:** Node.js, `bimex-indexer/`
- **Token:** MXNe (Etherfuse)
- **Wallet:** Freighter
- **Deploy:** Vercel (root directory: `bimex-frontend/`)
- **Notificaciones:** Resend + Supabase

## Estructura
```
bimex/                  → Smart contract Rust/Soroban
bimex-frontend/         → React app (Vite)
bimex-indexer/          → Indexer de eventos on-chain
docs/                   → Guías y documentación
scripts/                → Scripts de deploy y prueba
```

## Variables de entorno (bimex-frontend/.env.example)
- `VITE_CONTRACT_ID` — ID del contrato desplegado
- `VITE_RPC_URL` — https://soroban-testnet.stellar.org
- `VITE_TOKEN_MXNE` — dirección token MXNe
- `VITE_ADMIN_ADDRESS` — wallet admin
- `FAUCET_SECRET` (backend) — faucet testnet secret key, never VITE_ prefixed
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — notificaciones
- `VITE_PINATA_API_KEY` / `VITE_PINATA_SECRET` — IPFS (opcional, fallback SHA-256)

## Lo que se hizo en esta sesión

### PRs mergeados a main
| PR | Autor | Contenido |
|---|---|---|
| #23 | Ejirowebfi | Seguridad contrato (CEI, overfunding cap, bounds check) |
| #22 | Dennis-Ritchie1 | Indexer on-chain (bimex-indexer) |
| #24 | Dennis-Ritchie1 | UI mobile responsive |
| #25 | Ejirowebfi | Recompensas / badges |
| #27 | Dennis-Ritchie1 | i18n ES/EN |
| #28 | Dennis-Ritchie1 | Contrato usa IPFS CID (String) en vez de SHA-256 (BytesN<32>) |
| #26 | Ejirowebfi | Sistema de notificaciones email (Resend + Supabase) |
| #29 | JoesWalker | Script deploy Mainnet + env vars |
| #30 | JoesWalker | 19 tests adicionales (cobertura 100%) |
| #34 | Darkdante9 | Documentación técnica v2 |
| #35 | Darkdante9 | Docs onboarding comunidad (docs/) |
| #40 | Zarmaijemimah | Docs proyecto piloto + scripts bash |
| #41 | Zarmaijemimah | Specs página transparencia pública (.kiro/specs/) |
| #32 | JoesWalker | IPFS Pinata integrado en CrearProyecto.jsx |

### Fixes directos a main (rama `claude/bimex-review-wlvPQ`)
- **Navbar landing mobile:** padding `clamp(14px,4vw,48px)`, prop `inNavbar` en `ConectarWallet`, badge TESTNET oculto en móvil (`navbar-hide-tablet`)
- **IPFS completo:** `src/utils/ipfs.js` + integración real en `avanzarAPaso3` (sube INE/Plan/Presupuesto en paralelo, fallback SHA-256)

## Notas importantes
- El contrato almacena `doc_cid: String` (no `BytesN<32>`) desde PR #28
- Si IPFS está configurado: `docCid = "CID1|CID2|CID3"` (3 docs separados por `|`)
- Si Pinata no está configurado: fallback automático a SHA-256 hex
- Vercel despliega desde `main`. El root directory debe apuntarse a `bimex-frontend/` en el dashboard de Vercel
- Admin address en `VITE_ADMIN_ADDRESS` o hardcoded como fallback en `App.jsx`
- Tests del contrato: 39 tests, 0 failures (`cd bimex && cargo test`)
