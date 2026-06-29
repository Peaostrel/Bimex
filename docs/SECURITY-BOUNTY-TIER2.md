# Bug Bounty Tier 2 — Platform Decision & Budget

> Decision record and budget proposal for migrating the Bimex bug-bounty program from self-hosted (Tier 1) to a managed platform (Tier 2) after the Mainnet pilot.

**Status**: Proposed  
**Last updated**: 2026-06-24  
**Decision deadline**: 2 weeks after the pilot project ends  
**Target launch**: 4 weeks after the platform is selected

---

## 1. Context

Tier 1 of the Bimex bug-bounty program is defined in [`SECURITY.md`](../SECURITY.md). It is a self-hosted program with no monetary rewards but offers public recognition and swag. Tier 1 is active immediately to encourage ongoing scrutiny and demonstrate our commitment to security while the protocol is still in the pilot phase.

Once the first Mainnet pilot project completes and the protocol enters a steady operating state, we will launch Tier 2 on a specialized bug-bounty platform. This document records the evaluation criteria, platform candidates, proposed budget, severity table, and acceptance criteria.

---

## 2. Candidates under evaluation

| Platform | Website | Specialization | Pros | Cons |
|---|---|---|---|---|
| **Immunefi** | https://immunefi.com | DeFi and smart contract security | Largest web3 researcher community; crypto-native triage; flexible payouts in stablecoins; no upfront retainer for many programs. | Higher competition for researcher attention; KYC required for large payouts. |
| **HackerOne** | https://hackerone.com | General vulnerability disclosure | Mature platform; strong triage; enterprise trust; supports many asset types. | Less crypto-native; may require higher operational overhead to explain Soroban/Stellar semantics. |

### Evaluation criteria

| # | Criterion | Weight | Why it matters |
|---|---|---|---|
| 1 | Crypto/web3 experience | High | The platform must understand DeFi, smart contracts, and non-EVM chains (Stellar/Soroban). |
| 2 | KYC and payment flexibility | High | Researchers are global; payouts should support stablecoins and flexible KYC tiers. |
| 3 | Triage quality | High | Triagers must correctly classify Soroban/Stellar bugs and not dismiss them as "blockchain issues". |
| 4 | Researcher visibility | Medium | A larger community increases the probability of finding bugs beforeMainnet attackers. |
| 5 | Cost and platform fees | Medium | Must fit the post-launch security budget without crowding out audit or monitoring spend. |
| 6 | Integration with GitHub | Low | Nice-to-have for advisory drafting and coordinated disclosure. |

### Preliminary scoring

| Platform | Crypto exp. | KYC/Payment | Triage | Visibility | Cost | Total |
|---|---|---|---|---|---|---|
| Immunefi | 5/5 | 4/5 | 4/5 | 5/5 | 4/5 | **22/25** |
| HackerOne | 3/5 | 4/5 | 3/5 | 4/5 | 3/5 | **17/25** |

> **Recommendation**: Immunefi is the preferred candidate due to its crypto-native focus and researcher community. The final decision will be ratified by the security team after the pilot.

---

## 3. Proposed budget

### Total annual security budget (post-pilot)

| Category | Amount (USD) | Notes |
|---|---|---|
| Bug-bounty rewards | $50,000 | Payouts for Critical, High, Medium, and Low reports. |
| Platform fees / program management | $10,000 | Immunefi does not charge an upfront retainer for most programs; this covers optional managed services, KYC overhead, and gas for payouts. |
| Monitoring & tooling | $5,000 | Dependency scanning, on-chain monitoring, alerting. |
| External audits (ongoing) | $20,000 | Annual re-audit or targeted audit budget. |
| **Total annual security budget** | **$85,000** | Can be adjusted based on TVL and protocol growth. |

### Bounty reward table (Tier 2)

| Severity | Reward range (USD) | Typical impact | Examples |
|---|---|---|---|
| **Critical** | $10,000 – $25,000 | Direct theft or freezing of funds; full protocol compromise. | Bypass of `require_auth`, unauthorized `admin_upgrade`, draining of contract MXNe balance. |
| **High** | $3,000 – $9,000 | Significant financial impact under constrained conditions; broken core invariant. | Unauthorized yield extraction, state manipulation causing partial loss of principal, unauthorized admin actions. |
| **Medium** | $500 – $2,500 | Limited financial impact or UX security issue. | XSS/CSRF leading to unauthorized transaction signing, sensitive data exposure in indexer, DoS of dApp logic. |
| **Low** | $250 – $500 | Minor issue with limited exploitability. | Missing security headers without demonstrated exploit, minor input validation issues. |
| **Informational** | Public recognition | Best-practice suggestion with no direct exploit. | Documentation improvements, non-exploitable design recommendations. |

### Budget allocation assumptions

- The $50,000 reward pool is an annual cap. If paid out early, the program can be refilled or paused based on runway.
- The first year assumes a maximum of 1–2 Critical reports, 2–3 High reports, and a handful of Medium/Low reports.
- Actual payouts within each severity band are determined by the platform triage team and the Bimex security team based on exploitability, impact, and quality of the report.
- Duplicate reports of the same root cause will not receive duplicate payouts.

---

## 4. Scope for Tier 2

The platform program will use the same scope as Tier 1, clearly divided into three domains:

| Domain | In scope | Out of scope |
|---|---|---|
| **Smart contract** | `bimex/contracts/bimex` on current `main` branch, deployed on Testnet or Mainnet. | Old contract versions, third-party Stellar/Soroban bugs unless they directly affect Bimex funds. |
| **Frontend** | `bimex-frontend` on current `main`, including wallet connection, signing flow, project creation, contribution, withdrawal, admin panel, and IPFS upload. | Third-party wallet bugs (Freighter), browser bugs, UI issues without security impact. |
| **Indexer** | `bimex-indexer` on current `main`, including event ingestion, API, database, TTL extension, and notifications. | DoS against public Stellar RPC, third-party SMTP/SMS provider bugs. |
| **Infrastructure** | Vercel config, CI/CD secrets handling, domain/DNS, Supabase/Resend configuration. | Physical attacks, social engineering, team-member device compromise. |

### Out of scope (explicit)

- Known bugs tracked in GitHub or listed in [`CONTRACT-INVARIANTS.md`](CONTRACT-INVARIANTS.md) as accepted limitations.
- Social engineering, phishing, or credential-stuffing attacks against team members or users.
- Denial of service against public Stellar RPC endpoints or network congestion.
- Attacks requiring compromised user wallet seed phrases.
- Best-practice findings without a working exploit or demonstrated impact.

---

## 5. Timeline and milestones

| Milestone | Target date | Owner |
|---|---|---|
| Tier 1 program live | 2026-06-24 (now) | Security team |
| Mainnet pilot launch | 2026-07-XX | Product team |
| Pilot evaluation complete | 9 weeks after launch | Security + Product team |
| Final platform selection | 2 weeks after pilot ends | Security team |
| Legal/finance review of platform terms | 1 week after selection | Operations |
| Program listed on chosen platform | 4 weeks after selection | Security team |
| First paid bounty (if any) | Ongoing | Platform + Security team |

---

## 6. Acceptance criteria

Tier 2 will be considered successfully launched when all of the following are true:

1. ✅ A platform (Immunefi or HackerOne) has been selected and documented in this file.
2. ✅ A final budget and reward table has been approved by the project leads.
3. ✅ The program is publicly listed on the chosen platform with the Bimex scope and rules.
4. ✅ A link to the platform program is added to [`SECURITY.md`](../SECURITY.md) and to the project website footer.
5. ✅ At least one security team member is registered as the program owner and can triage reports.
6. ✅ The program's scope, out-of-scope list, and payout table are consistent with [`SECURITY.md`](../SECURITY.md), [`THREAT-MODEL.md`](THREAT-MODEL.md), and [`CONTRACT-INVARIANTS.md`](CONTRACT-INVARIANTS.md).

---

## 7. Decision log

| Date | Decision | Rationale | Status |
|---|---|---|---|
| 2026-06-24 | Tier 1 launched as self-hosted program in `SECURITY.md` | No budget for paid rewards before pilot; still need ongoing coverage. | ✅ Approved |
| 2026-06-24 | Pre-select Immunefi as Tier 2 platform | Best crypto-native fit, largest web3 researcher community, flexible stablecoin payouts. | 🔄 Pending pilot evaluation |
| 2026-06-24 | Set annual Tier 2 bounty budget at $50,000 | Conservative cap aligned with pilot TVL and expected protocol growth. | 🔄 Pending final approval |

---

## 8. References

- [`SECURITY.md`](../SECURITY.md) — Tier 1 program, disclosure process, and rules.
- [`docs/THREAT-MODEL.md`](THREAT-MODEL.md) — Threat model and attack surface.
- [`docs/CONTRACT-INVARIANTS.md`](CONTRACT-INVARIANTS.md) — Critical contract properties.
- [Immunefi documentation](https://docs.immunefi.com/)
- [HackerOne documentation](https://docs.hackerone.com/)

---

**Authors**: Bimex Security Team  
**Approvers**: Project lead, Operations lead, Legal (when budget is finalized)
