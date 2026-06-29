# Auditoría externa del contrato Bimex

> Página canónica del reporte de auditoría. El badge de auditoría del sitio
> (landing + Transparencia) enlaza aquí. Ver issue #136.

**Estado actual:** 🟡 _Pendiente — en preparación_

Mientras este documento muestre el estado "Pendiente" o "En progreso", **el
contrato no ha sido auditado de forma independiente** y no debe custodiar
fondos reales en Mainnet. No publicamos un badge de "auditado" sin un reporte
real enlazado en esta página.

---

## Resumen

| Campo | Valor |
|---|---|
| Firma auditora | _Por confirmar_ |
| Alcance | `bimex/contracts/bimex/src/lib.rs` (ver [AUDIT-SCOPE.md](AUDIT-SCOPE.md)) |
| Commit / blob auditado | _Por congelar — ver [AUDIT-SCOPE.md](AUDIT-SCOPE.md)_ |
| Fecha de inicio | — |
| Fecha del reporte final | — |
| Reporte completo (PDF/HTML) | — |
| Estado de hallazgos críticos/altos | — |

---

## Cómo se publica

1. Se contrata la firma (vía [SDF Audit Bank](AUDIT-SCOPE.md#sdf-audit-bank) o cotización directa).
2. Se congela el alcance en [AUDIT-SCOPE.md](AUDIT-SCOPE.md) (commit + blob hash de `lib.rs`).
3. Al recibir el reporte, se sube el PDF/HTML a `docs/auditoria/` y se enlaza arriba.
4. Se actualiza `bimex-frontend/src/config/auditoria.js`:
   ```js
   export const AUDITORIA = {
     estado: "completada",
     firma: "<Firma>",
     fecha: "<YYYY-MM-DD>",
     reporteUrl: "<URL del reporte público>",
     commitAuditado: "<blob hash de lib.rs auditado>",
   };
   ```
   El badge del sitio cambiará automáticamente a "Contrato auditado por &lt;Firma&gt;"
   con enlace al reporte.

---

## Hallazgos

> Se completa al recibir el reporte. Criterio de aceptación de #136: **todos los
> hallazgos críticos y altos resueltos** antes de Mainnet.

| ID | Severidad | Descripción | Estado | Resolución (PR / commit) |
|---|---|---|---|---|
| — | — | _Pendiente de auditoría_ | — | — |

### Leyenda de severidad

- **Crítica** — pérdida directa o congelamiento de fondos; compromiso total de admin.
- **Alta** — impacto financiero significativo; invariante rota; acción privilegiada no autorizada.
- **Media** — impacto limitado; fuga de datos sensibles.
- **Baja / Informativa** — recomendación de buenas prácticas, sin exploit directo.

---

## Documentación de soporte

- [AUDIT-SCOPE.md](AUDIT-SCOPE.md) — alcance congelado + checklist SDF Audit Bank
- [CONTRACT-INVARIANTS.md](CONTRACT-INVARIANTS.md) — invariantes que el contrato nunca debe violar
- [THREAT-MODEL.md](THREAT-MODEL.md) — modelo de amenazas, activos y vectores de ataque

---

_Última actualización: 2026-06-26._
