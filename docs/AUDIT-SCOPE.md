# Alcance de auditoría — contrato Bimex (#136)

> Documento de **congelamiento de alcance**: define exactamente qué código se
> audita, para no auditar un blanco móvil. Se completa el commit/blob final
> justo antes de entregar el código a la firma auditora.

---

## 1. Objetivo auditado (alcance congelado)

| Campo | Valor |
|---|---|
| Archivo | `bimex/contracts/bimex/src/lib.rs` |
| Líneas | 787 |
| Blob hash (git) | `2bb253a3fbe7d984ce066e794330254a973eda95` |
| Rama de referencia | `main` |
| Commit a congelar | _por fijar al iniciar la auditoría_ |

El blob hash identifica de forma inmutable el contenido del archivo. Para
verificar que el código no cambió desde el congelamiento:

```bash
git hash-object bimex/contracts/bimex/src/lib.rs
# debe coincidir con el blob hash de arriba
```

Si el valor difiere, el contrato cambió y el alcance debe re-congelarse antes
de auditar.

### Funciones en alcance

Funciones públicas del contrato (todas las que mutan o exponen estado):

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
- Todas las funciones de solo lectura que exponen estado

### Fuera de alcance

- `bimex-frontend/` (frontend React) — cubierto por el programa de bug bounty
- `bimex-indexer/` (indexer Node.js) — idem
- Dependencias de terceros (Soroban SDK, Stellar SDK) salvo que afecten fondos

---

## 2. Pasos previos (maximizar valor de la auditoría)

Bloqueantes de Mainnet que deben resolverse **antes** de congelar el commit:

- [ ] #64 — TTL management (bloqueante de Mainnet)
- [ ] #67 — faucet secret expuesta (higiene del repo)
- [ ] Congelar el alcance del contrato (fijar commit en la tabla de arriba)
- [x] Documentar invariantes esperadas → [CONTRACT-INVARIANTS.md](CONTRACT-INVARIANTS.md)
- [x] Documentar modelo de amenazas → [THREAT-MODEL.md](THREAT-MODEL.md)

### Invariantes clave a verificar

Ver [CONTRACT-INVARIANTS.md](CONTRACT-INVARIANTS.md) para la lista completa. Las más críticas:

- La suma de aportaciones retirable == capital depositado (zero-loss).
- Solo el admin puede aprobar/rechazar proyectos.
- El capital de un contribuidor siempre es recuperable (principal protegido).
- El overfunding está acotado (no se acepta por encima de la meta).

---

## 3. Opciones de auditoría

### SDF Audit Bank

El **Audit Bank** de la Stellar Development Foundation ha subsidiado auditorías
de proyectos Soroban. Aplicar **primero** por esta vía.

Checklist de aplicación:

- [ ] Repositorio público y README actualizado
- [ ] Contrato compila y pasa tests (`cd bimex && cargo test`)
- [ ] Cobertura de tests documentada (39 tests, ~100% — PR #30)
- [ ] Alcance congelado (este documento, sección 1)
- [ ] Invariantes y modelo de amenazas enlazados
- [ ] Deploy en Testnet verificable + dirección del contrato
- [ ] Descripción del proyecto y del uso de fondos reales en Mainnet
- [ ] Enviar solicitud al Audit Bank de la SDF

### Firmas con experiencia Soroban (cotización directa)

Como alternativa o complemento si el Audit Bank no cubre el alcance:

- Veridise
- OtterSec
- Certora
- _(otras con experiencia Stellar/Soroban)_

### Complemento gratuito

- Análisis estático (`cargo audit`, `cargo clippy -D warnings` — ya en CI)
- Revisión comunitaria / programa de bug bounty ([../SECURITY.md](../SECURITY.md))

---

## 4. Entrega y publicación del reporte

1. Resolver hallazgos críticos/altos (criterio de aceptación de #136).
2. Publicar el reporte en [AUDITORIA.md](AUDITORIA.md) + `docs/auditoria/`.
3. Actualizar `bimex-frontend/src/config/auditoria.js` → estado `"completada"`.
4. Verificar que el badge del sitio enlaza al reporte completo.

---

_Última actualización: 2026-06-26._
