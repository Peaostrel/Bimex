/**
 * Estado de la auditoría externa del contrato (issue #136).
 *
 * Única fuente de verdad para el badge de auditoría que se muestra en la
 * landing y en la página de Transparencia. Mientras no exista un reporte
 * público, el estado debe reflejar la realidad ("pendiente" / "en_progreso").
 * NUNCA marcar "completada" sin un reporte real enlazado en `reporteUrl`.
 *
 * Estados válidos:
 *   "pendiente"   → aún no inicia / en preparación (SDF Audit Bank, cotizaciones)
 *   "en_progreso" → auditoría en curso con una firma contratada
 *   "completada"  → reporte público disponible, hallazgos críticos/altos resueltos
 */
export const AUDITORIA = {
  estado: "pendiente",

  /** Firma auditora (ej. "OtterSec", "Veridise"). null hasta contratar. */
  firma: null,

  /** Fecha del reporte final en formato YYYY-MM-DD. null hasta completar. */
  fecha: null,

  /**
   * URL del reporte público completo. Debe estar definida para que el badge
   * "completada" enlace al reporte. Apunta a docs/AUDITORIA.md mientras se
   * publica el PDF/HTML definitivo.
   */
  reporteUrl: null,

  /**
   * Identificador inmutable del código auditado (alcance congelado).
   * Ver docs/AUDIT-SCOPE.md. Blob hash de bimex/contracts/bimex/src/lib.rs.
   */
  commitAuditado: null,
};

/** true solo cuando hay un reporte real enlazado: evita afirmaciones falsas. */
export const auditoriaPublicada = () =>
  AUDITORIA.estado === "completada" && !!AUDITORIA.reporteUrl;
