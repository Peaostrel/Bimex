import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cidAUrl } from "../utils/ipfs.js";

/** Índice 0 = INE (privada), 1 = plan, 2 = presupuesto */
const INE_INDEX = 0;

export default function SelloVerificado({ cids = [], fallbackHash = null, esFallback = false }) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    if (!abierto) return;
    const handler = (e) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [abierto]);

  const docLabels = [
    t("sello.docINE"),
    t("sello.docPlan"),
    t("sello.docPresupuesto"),
  ];

  if (esFallback && fallbackHash) {
    return (
      <div className="sello-badge sello-badge--fallback" title={t("sello.fallbackTitle")}>
        <IconShieldCheck />
        <span>{t("sello.fallbackLabel")}</span>
        <code style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "monospace", marginLeft: 4 }}>
          SHA-256: {fallbackHash.slice(0, 10)}…
        </code>
      </div>
    );
  }

  if (!cids.length) return null;

  return (
    <>
      <button
        type="button"
        className="sello-badge"
        onClick={() => setAbierto(true)}
        aria-label={t("sello.abrirModal")}
      >
        <IconShieldCheck />
        <span>{t("sello.label")}</span>
        <span style={{ fontSize: "0.72rem", color: "var(--muted)", marginLeft: 4 }}>↗</span>
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-sello-titulo"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false); }}
        >
          <div style={{
            background: "var(--card)", borderRadius: "var(--radius)",
            padding: "28px 24px", maxWidth: 440, width: "90%",
            display: "flex", flexDirection: "column", gap: 18,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconShieldCheck size={20} />
              <h3 id="modal-sello-titulo" style={{ margin: 0, fontSize: "1rem" }}>
                {t("sello.modalTitulo")}
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
              {t("sello.modalDesc")}
            </p>

            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {cids.map((cid, i) => {
                const esINE = i === INE_INDEX;
                const label = docLabels[i] ?? `${t("sello.documento")} ${i + 1}`;
                return (
                  <li key={cid} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: "var(--radius-sm)",
                    background: "var(--bg)", border: "1px solid var(--border)",
                  }}>
                    <IconFile />
                    <span style={{ flex: 1, fontSize: "0.85rem", fontWeight: 500 }}>{label}</span>
                    {esINE ? (
                      <span style={{
                        fontSize: "0.75rem", color: "var(--green)", fontWeight: 600,
                        background: "rgba(22,163,74,0.1)", padding: "2px 8px", borderRadius: 99,
                        whiteSpace: "nowrap",
                      }}>
                        ✓ {t("sello.verificada")}
                      </span>
                    ) : (
                      <a
                        href={cidAUrl(cid)}
                        target="_blank"
                        rel="noreferrer noopener"
                        style={{ fontSize: "0.78rem", color: "var(--navy)", fontWeight: 600, whiteSpace: "nowrap" }}
                        aria-label={`${t("sello.verDoc")} ${label}`}
                      >
                        IPFS ↗
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>

            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.4 }}>
              {t("sello.privacidadNota")}
            </p>

            <button
              className="btn btn-outline"
              style={{ width: "100%" }}
              onClick={() => setAbierto(false)}
              type="button"
            >
              {t("sello.cerrar")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function IconShieldCheck({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
