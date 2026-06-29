# Security Policy & Bug Bounty Program

> Responsible disclosure and vulnerability reward program for Bimex

**Bimex** is a zero-loss social-impact crowdfunding platform built on Stellar/Soroban. We take security seriously and welcome independent researchers to help us keep contributors, project owners, and the protocol safe.

---

## Table of contents

1. [Supported versions](#supported-versions)
2. [How to report a vulnerability](#how-to-report-a-vulnerability)
3. [Tier 1 — Self-hosted program (active now)](#tier-1--self-hosted-program-active-now)
4. [Tier 2 — Platform program (post-launch)](#tier-2--platform-program-post-launch)
5. [Scope](#scope)
6. [Out of scope](#out-of-scope)
7. [Severity and rewards](#severity-and-rewards)
8. [Rules of engagement](#rules-of-engagement)
9. [Hall of Fame](#hall-of-fame)
10. [Dependency and supply-chain security](#dependency-and-supply-chain-security)
11. [Security resources](#security-resources)
12. [Preguntas frecuentes / FAQ](#preguntas-frecuentes--faq)

---

## Supported versions

| Component | Version / branch | Supported |
|---|---|---|
| Smart contract (`bimex/contracts/bimex`) | `main` | ✅ |
| Frontend (`bimex-frontend`) | `main` | ✅ |
| Indexer (`bimex-indexer`) | `main` | ✅ |
| Older branches or demo versions | any | ❌ |

We only accept reports against the current `main` branch deployed on **Stellar Testnet** or **Stellar Mainnet**.

---

## How to report a vulnerability

Please do **not** open public issues or pull requests for security vulnerabilities. Instead, use one of these channels:

### Preferred (encrypted)

Send an email to **security@bimex.example** with:

- A clear description of the vulnerability.
- Steps to reproduce (proof-of-concept, transaction XDR, or code snippet).
- The affected component(s) and version(s).
- The severity you believe it represents.
- Your public key if you want an encrypted reply (optional).

We will acknowledge receipt within **72 hours** and share a detailed assessment within **10 business days**.

### Alternative

If you cannot reach us by email, open a **private advisory** via GitHub Security Advisories:

1. Go to the repository **Security** tab.
2. Click **Advisories** → **New draft security advisory**.
3. Submit the draft and request a private fork if needed.

We are committed to coordinated disclosure. Once a fix is deployed, we will publish a security advisory and credit you (with your permission).

---

## Tier 1 — Self-hosted program (active now)

Until Bimex is listed on a commercial bug-bounty platform, we run a self-hosted program from this `SECURITY.md`.

### What you get

| Reward | Details |
|---|---|
| **No initial monetary reward** | Bimex is pre-launch and operates on a limited budget. |
| **Public recognition** | Your name/alias in our [Hall of Fame](#hall-of-fame) and on the project website. |
| **Swag** | Bimex stickers and/or merchandise for valid reports (medium severity or higher). |
| **Fast response** | Acknowledgment within 72 hours and a full assessment within 10 business days. |
| **Coordinated disclosure** | We publish a CVE/GitHub Security Advisory and credit you (unless you prefer anonymity). |

### What we expect

- Reports must include a reproducible proof-of-concept.
- Vulnerabilities must affect the **in-scope** components listed below.
- Reports must not violate our [Rules of engagement](#rules-of-engagement).

---

## Tier 2 — Platform program (post-launch)

After the pilot project completes and the protocol reaches a steady operating state, we will migrate Tier 1 to a managed platform. The current plan is to evaluate **Immunefi** and **HackerOne** and choose the platform that best fits a crypto-native protocol.

### Evaluation criteria

| Criterion | Weight | Notes |
|---|---|---|
| Crypto/web3 experience | High | Immunefi specializes in DeFi/smart contract programs. |
| KYC/payment flexibility | High | Must support global researchers and stablecoin payouts. |
| Severity triage quality | High | Triage must understand Soroban/Stellar semantics. |
| Program visibility | Medium | Size of the researcher community. |
| Cost / platform fees | Medium | Must fit the post-launch security budget. |

### Proposed budget and payouts

| Severity | Reward range (USD) | Example impact |
|---|---|---|
| Critical | $10,000 – $25,000 | Direct theft of user funds, unauthorized draining of contract, bypass of admin/auth controls. |
| High | $3,000 – $9,000 | Unauthorized yield extraction, state manipulation causing loss of principal, broken invariants. |
| Medium | $500 – $2,500 | XSS/CSRF on frontend leading to unauthorized transactions, sensitive data exposure, DoS of dApp logic. |
| Low | $250 – $500 | UI bugs, misconfigurations, missing best-practice headers. |
| Informational | Public recognition only | Best-practice suggestions with no direct exploit. |

The final budget and payout table will be documented in the chosen platform after the selection process is complete.

### Planned timeline

| Milestone | Target date |
|---|---|
| Tier 1 live | now (this `SECURITY.md`) |
| Pilot project evaluation | 9 weeks after Mainnet pilot launch |
| Platform selection decision | within 2 weeks after pilot ends |
| Tier 2 program listed | within 4 weeks after selection |

Track progress in [`docs/SECURITY-BOUNTY-TIER2.md`](docs/SECURITY-BOUNTY-TIER2.md).

---

## Scope

We accept reports for the following components when they are running against the **current `main` branch** on **Stellar Testnet** or **Mainnet**.

### 1. Smart contract (`bimex/contracts/bimex`)

- `inicializar`
- `crear_proyecto`
- `admin_aprobar` / `admin_rechazar`
- `contribuir`
- `reclamar_yield`
- `retirar_principal`
- `retiro_anticipado`
- `abandonar_proyecto`
- `solicitar_continuar`
- `admin_cambiar_admin`
- `admin_pausar` / `admin_reanudar`
- `admin_upgrade`
- All read-only functions that expose state

### 2. Frontend (`bimex-frontend`)

- Wallet connection and transaction signing flow (`ConectarWallet`, `contrato.js`)
- Project creation, contribution, and withdrawal flows
- Admin panel approval/rejection flow
- IPFS document upload and hash handling
- Input validation and transaction simulation

### 3. Indexer (`bimex-indexer`)

- Event ingestion and parsing (`index.js`, `eventParser.js`)
- Database schema and API endpoints (`api.js`, `database.js`)
- TTL extension logic
- Email notification handling (`notifications.js`)

### 4. Infrastructure and deployment

- Vercel/frontend configuration (`vercel.json`, environment variables)
- CI/CD secrets handling
- Indexer server hardening

---

## Out of scope

The following are **not eligible** for rewards:

| Category | Examples |
|---|---|
| **Known bugs** | Issues already tracked in GitHub or listed in [`docs/CONTRACT-INVARIANTS.md`](docs/CONTRACT-INVARIANTS.md) as accepted limitations. |
| **Social engineering** | Phishing, credential theft, impersonation of team members. |
| **Physical attacks** | Attacks against team hardware, offices, or personal devices. |
| **DoS against public RPC** | Stellar public Soroban RPC rate limits, network congestion, or third-party outages. |
| **Outdated code** | Reports against branches other than `main` or old contract deployments. |
| **Best-practice only** | Missing HTTP headers without a demonstrated exploit, minor CSP issues with no impact. |
| **Third-party dependencies** | Bugs in Stellar SDK, Soroban, Freighter, Vercel, or Supabase unless they directly affect Bimex user funds. |
| **Testnet faucet abuse** | Draining the testnet faucet or minting test tokens. |

If you are unsure whether something is in scope, please ask before testing.

---

## Severity and rewards

### Severity rubric

| Severity | Definition |
|---|---|
| **Critical** | Direct, unprivileged loss or permanent freezing of user funds; arbitrary code execution; full admin compromise. |
| **High** | Significant financial impact under constrained conditions; broken core invariant; unauthorized privileged action. |
| **Medium** | Limited financial impact; user experience degradation with security consequences; sensitive data leak. |
| **Low** | Minor issue; difficult to exploit; limited impact. |
| **Informational** | No direct exploit; best-practice recommendation. |

### Reward matrix (Tier 1)

| Severity | Tier 1 reward |
|---|---|
| Critical | Hall of Fame + swag + priority Tier 2 consideration |
| High | Hall of Fame + swag |
| Medium | Hall of Fame + swag |
| Low | Hall of Fame |
| Informational | Hall of Fame (at our discretion) |

The final severity and reward are determined by the Bimex security team. Duplicate reports of the same root cause will be merged and the first complete report receives the reward.

---

## Rules of engagement

- **Do not exploit** vulnerabilities beyond what is necessary to prove the issue.
- **Do not interact** with Mainnet user funds or real projects without explicit written permission.
- **Use Testnet** for all testing whenever possible. A dedicated test environment is documented in [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md).
- **Do not violate privacy** of other users or the team.
- **Do not perform social engineering** or physical attacks.
- **Report promptly** once you confirm a vulnerability.
- **Give us a reasonable time** to fix the issue before any public disclosure (minimum 90 days, or sooner by mutual agreement).

Violations of these rules may disqualify you from the program and may result in legal action.

---

## Hall of Fame

We thank the following researchers for responsibly disclosing security issues:

| Date | Researcher | Alias | Severity | Issue |
|---|---|---|---|---|
| — | *Awaiting first report* | — | — | — |

To be added to this list, submit a valid in-scope report and opt-in to public recognition.

---

## Dependency and supply-chain security

We continuously monitor third-party dependencies for known vulnerabilities across all ecosystems.

### Automated scanning (CI)

Every push and pull request runs a vulnerability gate in [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Ecosystem | Tool | Gate |
|---|---|---|
| Rust contract (`bimex`) | `cargo audit --deny warnings` | Fails CI on any advisory |
| Frontend (`bimex-frontend`) | `npm audit --audit-level=high` | Fails CI on high/critical CVEs |
| Indexer (`bimex-indexer`) | `npm audit --audit-level=high` | Fails CI on high/critical CVEs |

### Automated updates (Dependabot)

[`.github/dependabot.yml`](.github/dependabot.yml) opens **weekly** pull requests, grouped per ecosystem, for:

- `npm` — `bimex-frontend` and `bimex-indexer`
- `cargo` — `bimex` (smart contract)
- `github-actions` — workflow action versions

### Remediation SLA

| Advisory severity | Action |
|---|---|
| **Critical / High (security update)** | Reviewed and merged within **72 hours** of the Dependabot PR or audit alert. |
| Moderate | Triaged within one week; merged on the next dependency cycle. |
| Low / informational | Batched into routine maintenance. |

Security-driven dependency updates take priority over feature work. If a high/critical CVE cannot be fixed within 72 hours (e.g. no patch is available), the team documents a mitigation and tracks it via a private advisory.

---

## Security resources

- [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) — Threat model, assets, and attack vectors.
- [`docs/CONTRACT-INVARIANTS.md`](docs/CONTRACT-INVARIANTS.md) — Critical properties the contract must never violate.
- [`docs/AUDITORIA.md`](docs/AUDITORIA.md) — External audit report and findings status (issue #136).
- [`docs/AUDIT-SCOPE.md`](docs/AUDIT-SCOPE.md) — Frozen audit scope and SDF Audit Bank application checklist.
- [`docs/SECURITY-BOUNTY-TIER2.md`](docs/SECURITY-BOUNTY-TIER2.md) — Tier 2 platform decision and budget tracking.
- [Testnet contract addresses](README.md#contract-addresses-testnet)
- [CI workflow](.github/workflows/ci.yml) — Automated contract and frontend tests.

---

## Preguntas frecuentes / FAQ

**¿Puedo reportar en español?**  
Sí. Aceptamos reportes en español e inglés.

**¿Necesito usar Mainnet?**  
No. Testnet es suficiente para la mayoría de los reportes. No toques fondos reales sin permiso por escrito.

**¿Cuándo habrá recompensas en efectivo?**  
El programa Tier 1 no ofrece recompensas monetarias. Las recompensas en efectivo comenzarán con Tier 2 después del proyecto piloto.

**¿Puedo permanecer anónimo?**  
Sí. Indícalo en tu reporte y no publicaremos tu nombre.

---

**Last updated**: 2026-06-24  
**Next review**: 2026-09-24
