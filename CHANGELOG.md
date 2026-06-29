# Changelog

All notable changes to Bimex are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- SSE real-time updates: indexer pushes `proyecto_actualizado`, `nueva_contribucion`, `yield_reclamado` events to connected clients (#62)
- Public changelog page accessible from the app footer (#81)
- Security policy and self-hosted bug bounty program (`SECURITY.md`) with Tier 1 rules, disclosure process, and Hall of Fame.
- Threat model document (`docs/THREAT-MODEL.md`) covering assets, threat actors, attack surface, and mitigations.
- Contract invariants document (`docs/CONTRACT-INVARIANTS.md`) listing the critical properties the smart contract must never violate.
- Tier 2 bug bounty decision and budget document (`docs/SECURITY-BOUNTY-TIER2.md`) evaluating Immunefi vs HackerOne with a $500–$25k payout table.

---

## [2.1.0] — 2026-05-27

### Added
- Dark mode with toggle in navbar (#59)
- Project search with debounce (#60)
- Share project with QR code (#61)
- Transparency page with on-chain stats (#57)
- Rewards panel (`Recompensas.jsx`) connected to real contract data (#56)
- CETES live rate via Etherfuse displayed in landing stats bar (#55)
- i18n support (Spanish / English) with `react-i18next` (#53)
- Skeleton loading states across all data-fetching components (#48)
- Toast notification system replacing inline error messages (#50)

### Improved
- Code splitting: bundle reduced ~40% (#47)
- Mobile-first responsive design across all views (#49)
- Admin panel with project approval / rejection flow (#46)

### Fixed
- TTL management in contract storage (#64)
- Security headers in Vercel deployment (#65)

---

## [2.0.0] — 2026-04-23

### Added
- `EnRevision` state: projects require admin approval before accepting funds
- `admin_aprobar()` and `admin_rechazar()` contract functions
- `Rechazado` state with `motivo_rechazo` field
- `doc_hash` (BytesN<32>): SHA-256 document hash stored on-chain for verifiability
- `calcular_yield_detallado()`: returns yield broken down by CETES and AMM
- `estado_capital()`: returns current capital distribution
- `solicitar_continuar()`: allows a new owner to resume an abandoned project
- `bimex-indexer`: on-chain indexing service to extend persistent storage TTL and maintain event history

### Fixed (security audit)
- CEI pattern (Checks-Effects-Interactions) applied in `contribuir()`, `retirar_principal()`, `reclamar_yield()`, and `abandonar_proyecto()` — prevents reentrancy attacks
- `require_auth()` moved to the start of every function that requires it, before any storage reads or business logic
- Contribution cap: `cantidad = cantidad.min(restante)` prevents accidental or malicious overfunding
- Top-up preserves the backer's original timestamp (additional contributions no longer reset the yield clock)
- `solicitar_continuar()` resets `timestamp_inicio` so the new owner does not inherit accumulated yield from the previous period
- `calcular_yield_seguro()` uses early division to avoid i128 overflow with large capitals
- Bounds check in `inicializar()`: `yield_cetes_bps` and `yield_amm_bps` cannot exceed 10,000,000 bps

### Changed
- Yield rates updated to production values: CETES 9.45% APY (`yield_cetes_bps = 945`), AMM 4.00% APY (`yield_amm_bps = 400`)

---

## [1.0.0] — 2026-03-15

### Added
- Initial demo presented at Hack+ Alebrije (Stellar | CDMX)
- Core contract functions: `crear_proyecto`, `contribuir`, `retirar_principal`, `reclamar_yield`
- Basic React frontend with Freighter wallet integration
- Stellar Testnet deployment
