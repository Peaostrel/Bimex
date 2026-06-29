# Bimex Threat Model

> Threat model, trust assumptions, and attack surface for the Bimex zero-loss crowdfunding protocol on Stellar/Soroban.

**Version**: 1.0  
**Last updated**: 2026-06-24  
**Next review**: 2026-09-24

---

## 1. Table of contents

1. [Overview](#overview)
2. [Assets and value flows](#assets-and-value-flows)
3. [Trust model](#trust-model)
4. [Threat actors](#threat-actors)
5. [Attack surface](#attack-surface)
6. [Threat matrix](#threat-matrix)
7. [Mitigations and controls](#mitigations-and-controls)
8. [Residual risks](#residual-risks)
9. [Test environment](#test-environment)
10. [References](#references)

---

## 2. Overview

Bimex is a zero-loss social-impact crowdfunding platform:

- Contributors lock **MXNe** (a Mexican peso stablecoin on Stellar) into a Soroban smart contract.
- The contract splits the capital 50/50 into simulated **CETES** and **AMM** yield sources.
- Yield is streamed to the **project owner** over time.
- When the project ends or is abandoned, contributors can withdraw **100% of their principal**.

The protocol is designed so that contributors never lose their principal, assuming the contract and its dependencies behave correctly. This threat model documents the assets, trust assumptions, threat actors, and controls that protect those assets.

---

## 3. Assets and value flows

### 3.1 Core assets

| ID | Asset | Location | Criticality |
|---|---|---|---|
| A1 | MXNe principal contributed by backers | Locked in the Bimex contract | Critical |
| A2 | Accrued yield available to project owners | Calculated in the contract; transferred on `reclamar_yield` | High |
| A3 | Admin role and upgrade capability | Contract instance storage (`Clave::Admin`) | Critical |
| A4 | Project metadata (name, goal, docs, state) | Contract persistent storage | High |
| A5 | Backer contribution records | Contract persistent storage (`Clave::Aportacion`) | Critical |
| A6 | Frontend private keys / environment secrets | Vercel/Supabase/Resend dashboards | Critical |
| A7 | Indexer database and event history | PostgreSQL/Supabase + indexer server | High |
| A8 | Project owner reputation and user trust | Public perception | Medium |

### 3.2 Value flow diagram

```
┌─────────────┐         contribuir()         ┌──────────────────┐
│   Backer    │ ───────────────────────────► │ Bimex contract   │
│  (MXNe)     │                              │ (locks principal)│
└─────────────┘                              └────────┬─────────┘
                                                     │
                              ┌──────────────────────┼──────────────────────┐
                              │                      │                      │
                              ▼                      ▼                      ▼
                        ┌──────────┐          ┌──────────┐           ┌──────────────┐
                        │  CETES   │          │   AMM    │           │ Project owner│
                        │  bucket  │          │  bucket  │           │  (yield)     │
                        └──────────┘          └──────────┘           └──────────────┘
                              │                      │                      ▲
                              └──────────────────────┘                      │
                                         yield                              │
                                    (reclamar_yield) ──────────────────────┘

                              ┌─────────────┐
                              │   Backer    │ ◄──────────────────────────────┐
                              │  (principal)│    retirar_principal()          │
                              └─────────────┘                                 │
                                                                             │
                                        ┌────────────────────────────────────┘
                                        │
                                 ┌──────────────┐
                                 │ Bimex contract│
                                 └──────────────┘
```

---

## 4. Trust model

### 4.1 What the protocol trusts

| Component | Trust assumption | Justification |
|---|---|---|
| Stellar network | Consensus and ledger integrity | Base layer assumption; out of scope for this program. |
| Soroban runtime | Correct execution of WASM, auth, and storage | Base layer assumption. |
| MXNe token issuer | Token is redeemable 1:1 for MXN | Stablecoin assumption; Bimex does not custody the issuer. |
| Admin | Acts honestly to approve legitimate projects and rotate keys securely | Admin is a privileged role; compromise is critical. |
| Project owner | Provides truthful project documentation and claims yield only when entitled | Owner can abandon a project at any time, but cannot steal principal. |
| Frontend host | Serves the correct application code and keeps secrets safe | Vercel/hosting provider trust. |
| Indexer operator | Runs the indexer correctly and protects database/API keys | Operational trust. |
| Backers | Verify transactions in Freighter before signing | User-side trust. |

### 4.2 What the protocol does NOT trust

- Malicious backers trying to withdraw more than they deposited.
- Malicious project owners trying to claim yield or principal they are not entitled to.
- Compromised frontend code attempting to trick users into signing harmful transactions.
- External attackers probing public endpoints and RPC nodes.
- Any user-provided input (project metadata, amounts, addresses).

---

## 5. Threat actors

| ID | Actor | Motivation | Capability |
|---|---|---|---|
| T1 | External attacker | Steal funds, disrupt service | Low to medium (no privileged access) |
| T2 | Malicious project owner | Maximize yield, avoid accountability | Medium (can call owner functions) |
| T3 | Malicious backer | Recover principal plus extra funds | Low (can only call backer functions) |
| T4 | Compromised admin key | Steal all funds or take over protocol | High (admin role) |
| T5 | Compromised frontend host | Phish signatures, steal secrets | High (can alter the served app) |
| T6 | Compromised indexer | Hide events, delay notifications, leak data | Medium (controls off-chain view) |
| T7 | Insider / team member | Abuse secrets, deploy malicious code | High (access to CI/CD and infra) |
| T8 | Third-party dependency | Supply-chain exploit | Medium to high (Stellar SDK, Freighter, etc.) |

---

## 6. Attack surface

### 6.1 Smart contract

| Function | Main risk | In-scope |
|---|---|---|
| `inicializar` | Setting malicious token or extreme yield rates | Yes |
| `crear_proyecto` | Spam, invalid metadata, deadline manipulation | Yes |
| `admin_aprobar` / `admin_rechazar` | Unauthorized approval/rejection | Yes |
| `contribuir` | Overfunding, reentrancy, unauthorized state change | Yes |
| `reclamar_yield` | Yield extraction from non-active projects, double claims | Yes |
| `retirar_principal` | Unauthorized withdrawal, double withdrawal | Yes |
| `retiro_anticipado` | Withdrawal after deadline or from wrong state | Yes |
| `abandonar_proyecto` | Abandonment of non-owned/rejected projects | Yes |
| `solicitar_continuar` | Stealing an abandoned project with accumulated yield | Yes |
| `admin_cambiar_admin` | Admin transfer to attacker | Yes |
| `admin_pausar` / `admin_reanudar` | Unauthorized pause/resume | Yes |
| `admin_upgrade` | Malicious WASM upgrade | Yes |
| Read-only functions | Information leakage, TTL expiration | Yes |

### 6.2 Frontend

| Area | Main risk | In-scope |
|---|---|---|
| Wallet connection | Connection to malicious contract, network spoofing | Yes |
| Transaction building | Incorrect amounts, wrong recipient, bad contract ID | Yes |
| Project creation form | Metadata injection, IPFS upload tampering | Yes |
| Admin panel | Approval of malicious projects, exposure of admin key | Yes |
| Environment variables | Leaked `VITE_ADMIN_ADDRESS`, RPC keys, Supabase keys | Yes |
| Content Security Policy | XSS leading to malicious transaction signing | Yes |

### 6.3 Indexer

| Area | Main risk | In-scope |
|---|---|---|
| Event ingestion | Missing events, duplicate events, forged events | Yes |
| API endpoints | IDOR, injection, rate-limit bypass | Yes |
| Database | Unauthorized access, data tampering | Yes |
| TTL extension | Failure to extend → storage loss | Yes |
| Email notifications | SMTP injection, leaking backer addresses | Yes |

### 6.4 Infrastructure

| Area | Main risk | In-scope |
|---|---|---|
| Vercel deployment | Hostile code injection, rollback to vulnerable version | Yes |
| GitHub / CI | Secret exfiltration, malicious dependency update | Yes |
| Domain / DNS | DNS hijack serving fake frontend | Yes |
| Supabase / Resend | Database/email compromise | Yes |

---

## 7. Threat matrix

| ID | Threat | Actor | Target asset | Impact | Likelihood | Risk | Mitigation |
|---|---|---|---|---|---|---|---|
| TM-01 | Reentrancy on `contribuir` or `retirar_principal` | T1/T3 | A1 | Critical | Low | Medium | CEI pattern; effects before external token transfer. |
| TM-02 | Admin key compromise → full protocol takeover | T4 | A3, A1 | Critical | Low | Medium | Multi-sig or hardware wallet recommended; key rotation via `admin_cambiar_admin`. |
| TM-03 | Overfunding beyond project goal | T2 | A1 | Medium | Low | Low | `cantidad = cantidad.min(restante)` cap. |
| TM-04 | Yield extraction from non-active project | T2 | A2 | High | Low | Medium | `reclamar_yield` restricted to `EnProgreso` or `Liberado`. |
| TM-05 | Double withdrawal of principal | T3 | A1 | High | Low | Medium | `Aportacion` entry removed after withdrawal; state resets. |
| TM-06 | Unauthorized project abandonment | T2 | A1 | Medium | Low | Low | `abandonar_proyecto` requires owner auth. |
| TM-07 | New owner inherits stale yield period | T2 | A2 | High | Low | Medium | `solicitar_continuar` resets `timestamp_inicio`. |
| TM-08 | Yield clock reset on top-up | T2 | A2 | High | Low | Medium | Top-up preserves original `timestamp` of first contribution. |
| TM-09 | Yield rate manipulation at initialization | T7 | A2 | High | Low | Medium | Bounds check `yield_*_bps <= 10_000_000`. |
| TM-10 | Contribution after deadline | T2 | A1 | Low | Low | Low | `assert!(ahora < timestamp_vencimiento)`. |
| TM-11 | Frontend XSS tricking user into signing | T5 | A1 | High | Medium | High | CSP, input validation, simulated transaction review. |
| TM-12 | Malicious contract ID in frontend env | T5/T7 | A1 | Critical | Low | Medium | Validate contract ID against known deployments; pinned env. |
| TM-13 | Indexer data loss due to missed TTL extension | T6 | A7 | High | Low | Medium | Automated TTL extension; periodic re-indexing scripts. |
| TM-14 | Supabase/Resend credential leak | T7 | A6, A7 | High | Medium | High | Use server-side functions, rotate secrets, least privilege. |
| TM-15 | Supply-chain attack on Stellar SDK or Freighter | T8 | A1 | Critical | Low | Medium | Pin dependency versions; audit lockfiles; Snyk/Dependabot. |
| TM-16 | Social engineering of team members | T1 | A6 | Critical | Medium | High | Training, 2FA, hardware keys, no seed sharing. |
| TM-17 | DoS against public RPC | T1 | Availability | Low | High | Low | Use robust RPC providers; out of scope for bounty. |
| TM-18 | Storage TTL expiration causing data loss | T1/T6 | A4, A5 | High | Low | Medium | TTL extension on every state-mutating and read call. |
| TM-19 | Unauthorized WASM upgrade | T4 | Entire contract | Critical | Low | Medium | Admin-only upgrade; plan for multi-sig/timelock in future. |
| TM-20 | i128 overflow in yield calculation | T1/T2 | A2 | High | Low | Medium | `calcular_yield_seguro` divides before multiplying. |

---

## 8. Mitigations and controls

### 8.1 Smart contract

| Control | Where implemented | Status |
|---|---|---|
| Checks-Effects-Interactions (CEI) | `contribuir`, `retirar_principal`, `reclamar_yield`, `abandonar_proyecto` | ✅ |
| `require_auth()` at start of privileged functions | All admin/owner/backer functions | ✅ |
| Contribution cap to prevent overfunding | `contribuir`: `cantidad = cantidad.min(restante)` | ✅ |
| Yield-rate bounds | `inicializar`: `assert!(bps <= 10_000_000)` | ✅ |
| State-machine enforcement | `assert!` guards on every state transition | ✅ |
| Circuit breaker (pause) | `admin_pausar` / `admin_reanudar` | ✅ |
| Overflow-safe yield math | `calcular_yield_seguro` | ✅ |
| Top-up preserves yield timestamp | `contribuir` reuses existing `Aportacion.timestamp` | ✅ |
| New owner resets yield clock | `solicitar_continuar` resets `timestamp_inicio` | ✅ |
| TTL extension | `extender_ttl_*` helpers | ✅ |
| Admin rotation | `admin_cambiar_admin` | ✅ |
| Upgrade path | `admin_upgrade` (admin-only) | ✅ |

### 8.2 Frontend

| Control | Where implemented | Status |
|---|---|---|
| Transaction simulation before signing | `contrato.js` | ✅ |
| Environment-based contract ID | `.env` files, Vercel env | ✅ |
| Input validation | `errores.js`, component forms | ✅ |
| Error handling and user feedback | `formato.js`, toast system | ✅ |
| Sentry integration | `@sentry/react` | ✅ |
| CSP / security headers | `vercel.json` | ✅ |

### 8.3 Indexer and infrastructure

| Control | Where implemented | Status |
|---|---|---|
| TTL extension on ingestion | `index.js` | ✅ |
| Database schema with constraints | `schema.sql` | ✅ |
| Backup/restore scripts | `bimex-indexer/scripts/` | ✅ |
| CI testing for contract and frontend | `.github/workflows/ci.yml` | ✅ |
| Dependabot / lockfile monitoring | `package-lock.json`, `Cargo.lock` | ✅ |

---

## 9. Residual risks

These risks are accepted or planned for future mitigation:

| ID | Risk | Owner | Planned mitigation |
|---|---|---|---|
| RR-01 | Single admin key with no multi-sig/timelock | Security team | Evaluate multi-sig admin for Mainnet (post-pilot). |
| RR-02 | Reliance on public Stellar RPC | DevOps | Add fallback RPC providers and private node option. |
| RR-03 | No formal external audit yet | Security team | Complete external audit before large-scale Mainnet launch. |
| RR-04 | Dependence on third-party wallets (Freighter) | Frontend team | Support additional wallets and verify signature integrity. |
| RR-05 | Off-chain indexer as source of truth for UX | Backend team | Frontend always re-verifies balances and states on-chain. |
| RR-06 | Social engineering / team credential theft | Operations | 2FA, hardware keys, security training, and incident response plan. |

---

## 10. Test environment

A dedicated test environment is available for security research.

| Resource | Testnet value | Notes |
|---|---|---|
| Bimex contract | `CDFFTEQLNIG2RAUONFXSQX2YS2UTQTCBEUAPK6S42XFNIOQEYPBJVH5T` | Deployed on Stellar Testnet. |
| MXNe SAC token | `CDDIGHPVTW4PSCQCU67NQ4NXZ4NX5GDLNL3O67WT5RQ4GT6RXIEYPC4T` | Testnet stablecoin. |
| Soroban RPC | `https://soroban-testnet.stellar.org` | Public testnet RPC. |
| Frontend | `https://bimex-frontend.vercel.app` | Current staging/testnet build. |
| Faucet | Stellar Laboratory | Fund test accounts with the Friendbot. |

### How to run tests locally

```bash
# Smart contract
cd bimex
cargo test

# Frontend
cd bimex-frontend
npm install
npm run test:run
npm run build

# Indexer
cd bimex-indexer
npm install
npm start
```

### Local testnet workflow

1. Create or import a Freighter wallet on **Stellar Testnet**.
2. Fund the account with the [Stellar Laboratory Friendbot](https://laboratory.stellar.org/#account-creator?network=test).
3. Use the testnet frontend or the contract functions directly to create, approve, contribute to, and withdraw from projects.
4. Do not send real MXNe or Mainnet transactions.

---

## 11. References

- [`docs/CONTRACT-INVARIANTS.md`](CONTRACT-INVARIANTS.md) — Critical contract properties.
- [`SECURITY.md`](../SECURITY.md) — Bug bounty policy and disclosure process.
- [`docs/SECURITY-BOUNTY-TIER2.md`](SECURITY-BOUNTY-TIER2.md) — Tier 2 platform decision and budget.
- [Soroban docs](https://soroban.stellar.org/docs)
- [Stellar smart contract security best practices](https://soroban.stellar.org/docs/tokens/authorization)
- [CEI pattern reference](https://fravoll.github.io/solidity-hacks/checks-effects-interactions.html)

---

**Authors**: Bimex Security Team  
**Reviewers**: Contract, frontend, and indexer leads
