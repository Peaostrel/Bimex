import { useTranslation } from "react-i18next";
import { AUDITORIA, auditoriaPublicada } from "../config/auditoria.js";

/**
 * Badge público del estado de auditoría externa del contrato (issue #136).
 *
 * Refleja el estado real configurado en src/config/auditoria.js:
 *  - "pendiente"   → "Auditoría externa: en preparación" (neutral)
 *  - "en_progreso" → "Auditoría en curso — <firma>" (azul)
 *  - "completada"  → "Contrato auditado por <firma> ↗" enlaza al reporte (verde)
 *
 * variant="compact" → pill pequeña para la landing.
 * variant="full"    → banner para la página de Transparencia.
 */
export default function AuditoriaBadge({ variant = "full" }) {
  const { t } = useTranslation();
  const publicada = auditoriaPublicada();
  const enProgreso = AUDITORIA.estado === "en_progreso";

  // Paleta según estado: verde (auditado), azul (en curso), neutral (pendiente).
  const tono = publicada
    ? { fg: "var(--green)", bg: "var(--green-dim)", bd: "rgba(22,163,74,0.20)" }
    : enProgreso
    ? { fg: "var(--navy)", bg: "var(--navy-dim)", bd: "rgba(30,58,95,0.18)" }
    : { fg: "var(--muted)", bg: "var(--bg)", bd: "var(--border2)" };

  const etiqueta = publicada
    ? t("auditoria.completada", { firma: AUDITORIA.firma })
    : enProgreso
    ? t("auditoria.enProgreso", { firma: AUDITORIA.firma || t("auditoria.firmaTbd") })
    : t("auditoria.pendiente");

  const Icono = publicada ? IconShieldCheck : IconShieldClock;

  // ---- Compact (landing): pill enlazable o estática ----
  if (variant === "compact") {
    const contenido = (
      <>
        <Icono size={13} />
        <span>{etiqueta}</span>
        {publicada && <span aria-hidden="true" style={{ marginLeft: 2 }}>↗</span>}
      </>
    );
    const estilo = {
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: "0.74rem", fontWeight: 600, color: tono.fg,
      background: tono.bg, border: `1px solid ${tono.bd}`,
      padding: "4px 10px", borderRadius: "99px", textDecoration: "none",
      width: "fit-content",
    };
    return publicada ? (
      <a href={AUDITORIA.reporteUrl} target="_blank" rel="noreferrer noopener" style={estilo}>
        {contenido}
      </a>
    ) : (
      <span style={estilo} title={t("auditoria.tooltip")}>{contenido}</span>
    );
  }

  // ---- Full (Transparencia): banner ----
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      background: tono.bg, border: `1px solid ${tono.bd}`,
      borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 24,
    }}>
      <span style={{ color: tono.fg, flexShrink: 0, marginTop: 2 }}>
        <Icono size={18} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <p style={{ fontSize: "0.86rem", color: "var(--text2)", lineHeight: 1.5, margin: 0 }}>
          <strong style={{ color: tono.fg }}>{etiqueta}</strong>
        </p>
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          {publicada ? (
            <>
              {AUDITORIA.fecha ? `${AUDITORIA.fecha} · ` : ""}
              <a href={AUDITORIA.reporteUrl} target="_blank" rel="noreferrer noopener"
                 style={{ color: "var(--navy)", fontWeight: 600, whiteSpace: "nowrap" }}>
                {t("auditoria.verReporte")} ↗
              </a>
            </>
          ) : (
            t("auditoria.notaPendiente")
          )}
        </p>
      </div>
    </div>
  );
}

function IconShieldCheck({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function IconShieldClock({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="12 9 12 12 14 13.5" />
    </svg>
  );
}
