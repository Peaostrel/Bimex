# Bimex Contract Invariants

> Critical properties that the Bimex Soroban smart contract must never violate. These invariants are the foundation of the bug-bounty program and must be preserved across every release, upgrade, and audit.

**Version**: 1.0  
**Last updated**: 2026-06-24  
**Next review**: 2026-09-24  

---

## 1. Purpose

This document lists the invariants that must hold at all times for the Bimex protocol to be considered secure. Any report that demonstrates a violation of one of these invariants is considered a high-priority security issue.

Invariants are grouped by:

- **Auth & access control** — who can do what.
- **State machine** — valid project lifecycle transitions.
- **Funds safety** — principal and yield preservation.
- **Yield correctness** — accurate and fair yield calculation.
- **Storage & availability** — ledger persistence and TTL.
- **Upgrade safety** — controlled contract upgrades.

---

## 2. Auth & access control invariants

| ID | Invariant | Rationale | Test coverage |
|---|---|---|---|
| AUTH-01 | Only the address stored in `Clave::Admin` can call `admin_aprobar`, `admin_rechazar`, `admin_pausar`, `admin_reanudar`, `admin_cambiar_admin`, and `admin_upgrade`. | Prevents unauthorized governance actions. | ✅ `test_no_admin_no_puede_upgrade`, `test_solo_admin_puede_pausar`, `test_solo_admin_puede_reanudar`, `test_admin_cambiar_admin_no_autorizado` |
| AUTH-02 | `crear_proyecto` requires `dueno.require_auth()`. | Ensures the project owner is the signer. | ✅ `test_flujo_completo` |
| AUTH-03 | `contribuir` requires `backer.require_auth()`. | Ensures only the contributor can lock their own funds. | ✅ `test_flujo_completo` |
| AUTH-04 | `reclamar_yield` requires `proyecto.dueno.require_auth()`. | Only the project owner can claim yield. | ✅ `test_flujo_completo` |
| AUTH-05 | `retirar_principal` and `retiro_anticipado` require `backer.require_auth()`. | Only the backer can withdraw their own principal. | ✅ `test_flujo_completo`, `test_retiro_anticipado_devuelve_capital` |
| AUTH-06 | `abandonar_proyecto` requires `proyecto.dueno.require_auth()`. | Only the owner can mark a project abandoned. | ✅ `test_abandonar_y_continuar` |
| AUTH-07 | `solicitar_continuar` requires `nuevo_dueno.require_auth()`. | Only the new owner can take over an abandoned project. | ✅ `test_abandonar_y_continuar` |
| AUTH-08 | `admin_cambiar_admin` requires `admin_actual.require_auth()` and `admin_actual == stored_admin`. | Prevents arbitrary admin transfers. | ✅ `test_admin_cambiar_admin_exito`, `test_admin_cambiar_admin_no_autorizado`, `test_admin_cambiar_admin_mismo_admin_falla` |
| AUTH-09 | `admin_upgrade` requires `admin.require_auth()` and `admin == stored_admin`. | Only admin can update the WASM. | ✅ `test_solo_admin_puede_upgrade`, `test_no_admin_no_puede_upgrade` |
| AUTH-10 | Privileged functions must call `require_auth()` **before** reading or modifying state. | Prevents auth bypass through state manipulation. | ✅ All admin/owner/backer functions |

---

## 3. State machine invariants

Valid state transitions (any other transition is a violation):

```
EnRevision ──admin_aprobar──► EtapaInicial
EnRevision ──admin_rechazar──► Rechazado
EtapaInicial ──contribuir (first)──► EnProgreso
EnProgreso ──contribuir (goal met)──► Liberado
EnProgreso ──abandonar_proyecto──► Abandonado
EtapaInicial ──abandonar_proyecto──► Abandonado
Liberado ──abandonar_proyecto──► Abandonado
Abandonado ──solicitar_continuar──► EtapaInicial (if no funds)
Abandonado ──solicitar_continuar──► EnProgreso (if funds remain)
EnProgreso / Liberado ──retirar_principal (all funds withdrawn)──► EtapaInicial
```

| ID | Invariant | Rationale | Test coverage |
|---|---|---|---|
| STATE-01 | A project can only be approved (`admin_aprobar`) when it is in `EnRevision`. | Prevents duplicate or unauthorized approvals. | ✅ `test_admin_aprobar_proyecto_ya_aprobado_falla` |
| STATE-02 | A project can only be rejected (`admin_rechazar`) when it is in `EnRevision`. | Rejection is a one-time review action. | ✅ `test_admin_rechazar_proyecto_aprobado_falla` |
| STATE-03 | A project can only be abandoned from `EtapaInicial`, `EnProgreso`, or `Liberado`. | Rejected or already-review projects cannot be abandoned. | ✅ `test_vul02_no_abandonar_rechazado`, `test_vul02b_no_abandonar_en_revision` |
| STATE-04 | `solicitar_continuar` can only be called on `Abandonado` projects. | Prevents project hijacking while active. | ✅ `test_solicitar_continuar_proyecto_activo_falla` |
| STATE-05 | Contributions are only accepted when the project is in `EtapaInicial` or `EnProgreso`. | Prevents funding rejected, abandoned, or completed projects. | ✅ `test_vul08_no_contribuir_en_revision`, `test_contribuir_proyecto_rechazado_falla`, `test_contribuir_proyecto_liberado_falla` |
| STATE-06 | `retirar_principal` is only allowed when the project is `Liberado`, `Abandonado`, or the deadline has expired. | Prevents premature withdrawal of principal. | ✅ `test_vul09_no_retirar_en_progreso`, `test_retirar_principal_en_progreso_falla` |
| STATE-07 | `retiro_anticipado` is only allowed when the project is `EtapaInicial` or `EnProgreso` and the deadline has not expired. | Prevents abuse of early-exit path. | ✅ `test_retiro_anticipado_despues_de_vencimiento_falla`, `test_retiro_anticipado_proyecto_liberado_falla` |
| STATE-08 | `reclamar_yield` is only allowed when the project is `EnProgreso` or `Liberado` and has at least one active contribution. | Prevents yield extraction from invalid states. | ✅ `test_vul01_yield_bloqueado_en_revision`, `test_vul01b_yield_bloqueado_rechazado`, `test_vul01c_yield_bloqueado_abandonado`, `test_reclamar_yield_cero_falla` |
| STATE-09 | Pausing the contract does not affect admin-only governance actions (`admin_aprobar`, `admin_rechazar`, `admin_cambiar_admin`, `admin_upgrade`). | Ensures the admin can still recover during an incident. | ✅ `test_admin_aprobacion_funciona_pausado` |
| STATE-10 | Pausing blocks state-changing user operations (`contribuir`, `reclamar_yield`, `retirar_principal`, `retiro_anticipado`, `solicitar_continuar`, `crear_proyecto`, `abandonar_proyecto`). | Circuit breaker protects user funds. | ✅ `test_pausa_bloquea_contribuciones`, `test_reanudacion_permite_contribuciones` |
| STATE-11 | When all contributions are withdrawn from a project, the project returns to `EtapaInicial` (if it was `EnProgreso` or `Liberado`). | Allows the owner to restart or abandon the project cleanly. | ✅ `test_retirar_todos_los_fondos_vuelve_a_etapa_inicial` |

---

## 4. Funds safety invariants

| ID | Invariant | Rationale | Test coverage |
|---|---|---|---|
| FUNDS-01 | A backer can only withdraw **exactly** the amount they deposited (principal). Zero-loss guarantee. | Core protocol promise. | ✅ `test_flujo_completo`, `test_retiro_despues_de_vencimiento`, `test_retirar_principal_proyecto_abandonado` |
| FUNDS-02 | The sum of all backer principals for a project never exceeds the project's `meta`. | Prevents overfunding. | ✅ `test_vul03_overfunding_cap`, `test_estado_capital` |
| FUNDS-03 | The contract's total locked MXNe balance must always be at least the sum of all unwithdrawn principals plus any unclaimed yield. | Solvency invariant. | ✅ Indirectly covered by all flow tests; monitor via `estado_capital` + `calcular_yield_detallado`. |
| FUNDS-04 | When a backer withdraws principal, the corresponding `Aportacion` entry is removed. | Prevents double withdrawal. | ✅ `test_vul07_no_doble_retiro` |
| FUNDS-05 | `retiro_anticipado` returns 100% of the principal and does not pay any yield to the backer. | Yield stays in the project for the owner. | ✅ `test_retiro_anticipado_devuelve_capital` |
| FUNDS-06 | When a project is abandoned, every backer can recover 100% of their principal. | Zero-loss guarantee even on project failure. | ✅ `test_retirar_principal_proyecto_abandonado` |
| FUNDS-07 | When a project's deadline expires without reaching the goal, backers can recover 100% of their principal. | Zero-loss guarantee on underfunded projects. | ✅ `test_retiro_despues_de_vencimiento` |
| FUNDS-08 | The contract never transfers principal to anyone other than the original backer. | Principal is not confiscable. | ✅ `test_flujo_completo` (transfer destination is `backer`) |
| FUNDS-09 | `meta` must be greater than 0 when creating a project. | Prevents zero-goal projects. | ✅ `test_crear_proyecto_meta_cero_falla` |
| FUNDS-10 | Contribution amount must be greater than 0. | Prevents empty contributions. | ✅ `test_contribuir_cantidad_cero_falla` |
| FUNDS-11 | Capital split must be 50/50 between CETES and AMM (with integer rounding handled safely). | Preserves the documented yield model. | ✅ `test_capital_distribucion_impar`, `test_estado_capital` |
| FUNDS-12 | `total_aportado` must equal the sum of all active `Aportacion` entries for the project. | Internal accounting consistency. | ✅ `test_multiple_contributors_same_project`, `test_multiple_contributions_same_backer_accumulate` |

---

## 5. Yield correctness invariants

| ID | Invariant | Rationale | Test coverage |
|---|---|---|---|
| YIELD-01 | Yield is calculated only from the backer's original contribution timestamp, and top-ups do not reset that timestamp. | Prevents yield clock manipulation. | ✅ `test_vul04_timestamp_preservado_en_topup` |
| YIELD-02 | When a new owner takes over an abandoned project (`solicitar_continuar`), the project's `timestamp_inicio` is reset to the current ledger time. | Prevents the new owner from inheriting previously accrued yield. | ✅ `test_vul06_continuar_resetea_timestamp` |
| YIELD-03 | Yield rates configured at initialization cannot exceed `10_000_000` bps. | Prevents unrealistic or exploitative rates. | ✅ `test_vul05_yield_bps_cetes_excede_maximo`, `test_vul05b_yield_bps_amm_excede_maximo` |
| YIELD-04 | Yield is 0 if no time has elapsed since the contribution/project start timestamp. | Time-proportional yield. | ✅ `test_yield_cero_sin_tiempo_transcurrido` |
| YIELD-05 | `reclamar_yield` cannot be called if the calculated yield is 0. | Prevents empty claims and wasted fees. | ✅ `test_reclamar_yield_cero_falla` |
| YIELD-06 | Annual yield for CETES must be approximately 9.45% APY and AMM approximately 4.00% APY under production settings. | Business model correctness. | ✅ `test_yield_tasas_reales_produccion`, `test_yield_no_es_demo_exagerado` |
| YIELD-07 | The sum of all `yield_entregado` plus remaining unclaimed yield must never exceed the yield that can be mathematically generated from the locked capital and elapsed time. | Yield cannot be created from nothing. | ✅ Indirectly covered by yield tests. |
| YIELD-08 | Yield calculation must be overflow-safe for capital up to the protocol's maximum supported amount. | Protects against arithmetic attacks. | ✅ `test_yield_tasas_reales_produccion` uses large numbers; `calcular_yield_seguro` divides before multiplying. |

---

## 6. Storage & availability invariants

| ID | Invariant | Rationale | Test coverage |
|---|---|---|---|
| STORAGE-01 | `inicializar` can only be called once. | Prevents reinitialization attacks. | ✅ `test_inicializar_dos_veces_falla` |
| STORAGE-02 | Every state-mutating function must extend the instance TTL. | Prevents instance storage eviction. | ✅ All state-mutating functions call `extender_ttl_instancia`. |
| STORAGE-03 | Every read or write of a project must extend the project's persistent TTL. | Prevents project storage eviction. | ✅ `extender_ttl_proyecto` is called in all relevant functions. |
| STORAGE-04 | Every read or write of a backer contribution must extend the contribution's persistent TTL. | Prevents contribution storage eviction. | ✅ `extender_ttl_aportacion` is called in all relevant functions. |
| STORAGE-05 | The project counter (`ContadorProyectos`) is monotonically increasing. | IDs are never reused or rolled back. | ✅ `test_crear_multiples_proyectos` |
| STORAGE-06 | `doc_cid` and `motivo_rechazo` are stored as `String` and cannot be mutated by unauthorized parties. | Document integrity. | ✅ `test_admin_rechazar_con_motivo` |
| STORAGE-07 | TTL extension must keep storage alive for at least 1 day and bump up to 30 days for instances / 6 months for persistent entries. | Availability guarantee. | ✅ `test_extend_ttl` |

---

## 7. Upgrade safety invariants

| ID | Invariant | Rationale | Test coverage |
|---|---|---|---|
| UPGRADE-01 | Only the admin can call `admin_upgrade`. | Prevents arbitrary code replacement. | ✅ `test_solo_admin_puede_upgrade`, `test_no_admin_no_puede_upgrade` |
| UPGRADE-02 | Upgrades must preserve existing project, contribution, and configuration storage. | State must survive across WASM updates. | ✅ Relies on Soroban storage persistence; tested implicitly by contract test suite. |
| UPGRADE-03 | New WASM versions must continue to enforce all invariants in this document. | Regression protection. | ✅ New releases must pass the full test suite and add tests for new invariants. |

---

## 8. Known limitations (not in scope for new reports)

The following behaviors are known and accepted. Reports describing them will not be rewarded as new vulnerabilities, but suggestions for improvement are welcome.

| ID | Limitation | Reason |
|---|---|---|
| LIM-01 | A single admin key controls all governance. There is no multi-sig or timelock. | Accepted for the pilot phase; planned for post-pilot hardening. |
| LIM-02 | Yield is calculated using a simplified on-chain model, not actual off-chain CETES/AMM yields. | The protocol承诺ates a fixed reference rate; real yield is off-chain. |
| LIM-03 | The indexer relies on the public Soroban RPC and may lag or miss events under network stress. | Operational risk; indexer has backup/reindex scripts. |
| LIM-04 | `retiro_anticipado` leaves the accrued yield in the project for the owner. | By design; early exit does not entitle the backer to yield. |
| LIM-05 | Integer rounding in the 50/50 split may leave 1 stroop in the AMM bucket for odd amounts. | Acceptable; capital is still fully recoverable. |
| LIM-06 | Admin pause does not block read-only functions. | By design; transparency is maintained during incidents. |
| LIM-07 | The contract does not enforce KYC/AML on project owners or backers. | Regulatory compliance is handled off-chain by the operator. |

---

## 9. How to test invariants

Run the full contract test suite:

```bash
cd bimex
cargo test
```

All 39+ tests must pass. Each new release should add regression tests for any newly discovered invariant violation.

To verify invariants on the live testnet deployment:

1. Use the Stellar Laboratory or `soroban-cli` to inspect the contract state.
2. Compare `total_aportado` against the sum of live `Aportacion` entries.
3. Verify the contract MXNe balance is at least `total_aportado` plus unclaimed yield.
4. Check that no project state violates the transition diagram above.

---

## 10. References

- [`SECURITY.md`](../SECURITY.md) — Bug bounty policy and disclosure process.
- [`docs/THREAT-MODEL.md`](THREAT-MODEL.md) — Threat model and attack surface.
- [`docs/SECURITY-BOUNTY-TIER2.md`](SECURITY-BOUNTY-TIER2.md) — Tier 2 platform decision and budget.
- [`bimex/contracts/bimex/src/lib.rs`](../bimex/contracts/bimex/src/lib.rs) — Contract source.
- [`bimex/contracts/bimex/src/test.rs`](../bimex/contracts/bimex/src/test.rs) — Contract tests.

---

**Authors**: Bimex Security Team  
**Reviewers**: Contract, frontend, and indexer leads
