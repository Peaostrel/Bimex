import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { obtenerTodosLosProyectos, obtenerAportacion } from "../stellar/contrato";
import { formatearNumero, formatearNumeroConDecimales } from "../utils/formato.js";

// ── Niveles de confianza ──────────────────────────────────────────────────────
const NIVELES = [
  {
    id: "semilla",
    nombre: "Semilla",
    icono: "🌱",
    min: 0,
    max: 999,
    color: "var(--navy)",
    bg: "var(--navy-dim)",
    border: "rgba(30,58,95,0.18)",
    recompensas: [
      { id: "r1", nombre: "Badge Semilla", desc: "Tu primer paso en Bimex",     icono: "🏅", umbral: 0,   desbloqueado: true  },
      { id: "r2", nombre: "Primer aporte", desc: "Contribuiste tu primer MXNe", icono: "💚", umbral: 1,   desbloqueado: false },
    ],
  },
  {
    id: "brote",
    nombre: "Brote",
    icono: "🌿",
    min: 1_000,
    max: 9_999,
    color: "var(--green)",
    bg: "var(--green-dim)",
    border: "rgba(22,163,74,0.20)",
    recompensas: [
      { id: "r3", nombre: "Inversor Brote",   desc: "Invertiste 1,000+ MXNe en total", icono: "🌿", umbral: 1_000, desbloqueado: false },
      { id: "r4", nombre: "Regalo sorpresa",  desc: "Desbloquea al llegar a 5,000 MXNe", icono: "🎁", umbral: 5_000, desbloqueado: false },
    ],
  },
  {
    id: "arbol",
    nombre: "Árbol",
    icono: "🌳",
    min: 10_000,
    max: 99_999,
    color: "var(--amber)",
    bg: "var(--amber-dim)",
    border: "rgba(217,119,6,0.20)",
    recompensas: [
      { id: "r5", nombre: "Árbol de impacto", desc: "Invertiste 10,000+ MXNe",          icono: "🌳", umbral: 10_000,  desbloqueado: false },
      { id: "r6", nombre: "Caja misteriosa",  desc: "Acceso exclusivo a proyectos VIP", icono: "📦", umbral: 50_000,  desbloqueado: false },
    ],
  },
  {
    id: "selva",
    nombre: "Selva",
    icono: "🌲",
    min: 100_000,
    max: Infinity,
    color: "#065F46",
    bg: "rgba(6,95,70,0.07)",
    border: "rgba(6,95,70,0.20)",
    recompensas: [
      { id: "r7", nombre: "Guardián Selva", desc: "Invertiste 100,000+ MXNe",    icono: "🌲", umbral: 100_000, desbloqueado: false },
      { id: "r8", nombre: "NFT exclusivo",  desc: "NFT de colección arte mexicano", icono: "🎨", umbral: 200_000, desbloqueado: false },
    ],
  },
];

function nivelActual(totalMXNe) {
  return NIVELES.slice().reverse().find(n => totalMXNe >= n.min) ?? NIVELES[0];
}

function nivelSiguiente(totalMXNe) {
  return NIVELES.find(n => n.min > totalMXNe) ?? null;
}

function calcularRecompensas(totalMXNe) {
  return NIVELES.flatMap(n =>
    n.recompensas.map(r => ({ ...r, desbloqueado: totalMXNe >= r.umbral }))
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Recompensas({ direccion, refrescar, totalInvertido: totalInvertidoProp }) {
  const { t } = useTranslation();
  const [abierto,   setAbierto]   = useState(false);
  const [totalMXNe, setTotalMXNe] = useState(0);
  const [cargando,  setCargando]  = useState(!totalInvertidoProp);
  const [sorpresa,  setSorpresa]  = useState(null);
  const panelRef = useRef(null);
  const botonRef = useRef(null);

  // Si el padre ya calculó totalInvertido, úsalo directamente
  useEffect(() => {
    if (totalInvertidoProp != null) {
      const b = typeof totalInvertidoProp === "bigint" ? totalInvertidoProp : BigInt(totalInvertidoProp ?? 0);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTotalMXNe(Number(b / BigInt(10_000_000)) + Number(b % BigInt(10_000_000)) / 10_000_000);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCargando(false);
      return;
    }
    if (!direccion) return;
    let cancelado = false;
    (async () => {
      setCargando(true);
      try {
        const proyectos = await obtenerTodosLosProyectos();
        const aportaciones = await Promise.all(
          proyectos.map(p => obtenerAportacion(p.id, direccion).catch(() => BigInt(0)))
        );
        const totalStroops = aportaciones.reduce((s, a) => {
          try { return s + BigInt(a); } catch { return s; }
        }, BigInt(0));
        if (!cancelado) {
          const mxne = Number(totalStroops / BigInt(10_000_000)) + Number(totalStroops % BigInt(10_000_000)) / 10_000_000;
          setTotalMXNe(mxne);
        }
      } catch {
        if (!cancelado) setTotalMXNe(0);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [direccion, refrescar, totalInvertidoProp]);

  // Cierra con Escape o clic fuera
  useEffect(() => {
    if (!abierto) return;
    function onKey(e) { if (e.key === "Escape") { setAbierto(false); botonRef.current?.focus(); } }
    function onOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target) && !botonRef.current?.contains(e.target))
        setAbierto(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onOutside); };
  }, [abierto]);

  const nivel       = nivelActual(totalMXNe);
  const siguiente   = nivelSiguiente(totalMXNe);
  const recompensas = calcularRecompensas(totalMXNe);
  const pct         = siguiente
    ? Math.min(((totalMXNe - nivel.min) / (siguiente.min - nivel.min)) * 100, 100)
    : 100;
  const desbloqueadas = recompensas.filter(r => r.desbloqueado).length;

  return (
    <div style={{ position: "relative" }}>
      {/* Botón navbar */}
      <button
        ref={botonRef}
        onClick={() => setAbierto(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={t("recompensas.ariaBtn", { level: nivel.nombre, count: desbloqueadas })}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--bg)",
          border: "1px solid var(--border2)",
          color: "var(--text2)",
          padding: "6px 12px",
          borderRadius: 99,
          fontWeight: 600,
          fontSize: "0.8rem",
          cursor: "pointer",
          transition: "all 0.15s",
          position: "relative",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: "0.95rem" }}>{nivel.icono}</span>
        <span>{nivel.nombre}</span>
        {desbloqueadas > 0 && (
          <span style={{
            position: "absolute", top: -5, right: -5,
            background: "var(--navy)", color: "#fff",
            borderRadius: "50%", width: 17, height: 17,
            fontSize: "0.62rem", fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid var(--card)",
          }} aria-hidden="true">
            {desbloqueadas}
          </span>
        )}
      </button>

      {/* Panel de recompensas */}
      {abierto && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={t("recompensas.ariaPanel")}
          style={st.panel}
        >
          {/* Header */}
          <div style={st.panelHeader}>
            <div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {t("recompensas.label")}
              </div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)", marginTop: 2 }}>
                {t("recompensas.level")} {nivel.icono} {nivel.nombre}
              </div>
            </div>
            <button onClick={() => setAbierto(false)} aria-label={t("recompensas.closePanel")} style={st.cerrar}>×</button>
          </div>

          {/* Total invertido */}
          <div style={{ ...st.totalCard, background: nivel.bg, border: `1.5px solid ${nivel.border}` }}>
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {t("recompensas.totalInvested")}
            </div>
            {cargando ? (
              <div style={{ fontSize: "1.5rem", color: nivel.color, marginTop: 4 }}>—</div>
            ) : (
              <div style={{ fontSize: "1.5rem", color: nivel.color, fontWeight: 800, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {formatearNumeroConDecimales(totalMXNe, 2)} MXNe
              </div>
            )}
          </div>

          {/* Barra de progreso al siguiente nivel */}
          {siguiente && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.74rem" }}>
                <span style={{ color: "var(--muted)" }}>{t("recompensas.progressTo")} {siguiente.icono} {siguiente.nombre}</span>
                <span style={{ color: nivel.color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {formatearNumero(Math.floor(totalMXNe))} / {formatearNumero(siguiente.min)} MXNe
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progreso al siguiente nivel: ${pct.toFixed(0)}%`}
                style={{ height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}
              >
                <div style={{ height: "100%", width: `${pct}%`, background: nivel.color, borderRadius: 99, transition: "width 0.6s ease" }} />
              </div>
              <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 6 }}>
                {t("recompensas.remaining", { amount: formatearNumeroConDecimales(Math.max(0, siguiente.min - totalMXNe), 2) })}
              </p>
            </div>
          )}
          {!siguiente && (
            <div style={{ textAlign: "center", padding: "10px 0", marginBottom: 14 }}>
              <p style={{ fontSize: "0.82rem", color: nivel.color, fontWeight: 700, marginTop: 4 }}>
                {t("recompensas.maxLevel")}
              </p>
            </div>
          )}

          {/* Grid de recompensas */}
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            {t("recompensas.rewardsCount", { unlocked: desbloqueadas, total: recompensas.length })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {recompensas.map(r => (
              <button
                key={r.id}
                onClick={() => { if (r.desbloqueado) setSorpresa(r); }}
                disabled={!r.desbloqueado}
                aria-label={r.desbloqueado
                  ? t("recompensas.ariaUnlocked", { name: r.nombre })
                  : t("recompensas.ariaLocked", { name: r.nombre, amount: formatearNumero(r.umbral) })}
                style={{
                  ...st.recompensaBtn,
                  opacity: r.desbloqueado ? 1 : 0.45,
                  cursor: r.desbloqueado ? "pointer" : "not-allowed",
                  border: r.desbloqueado ? `1.5px solid ${nivel.border}` : "1.5px dashed var(--border2)",
                  background: r.desbloqueado ? nivel.bg : "var(--bg)",
                }}
              >
                <span style={{ fontSize: "1.3rem", marginBottom: 4, filter: r.desbloqueado ? "none" : "grayscale(1)" }}>{r.icono}</span>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: r.desbloqueado ? "var(--text)" : "var(--muted)", lineHeight: 1.3, textAlign: "center" }}>
                  {r.desbloqueado ? r.nombre : t("recompensas.locked")}
                </span>
                {!r.desbloqueado && (
                  <span style={{ fontSize: "0.64rem", color: "var(--subtle)", marginTop: 2 }}>
                    {r.umbral >= 1000
                      ? `${(r.umbral / 1000).toFixed(r.umbral % 1000 === 0 ? 0 : 1)}k MXNe`
                      : `${r.umbral} MXNe`}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Info */}
          <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--navy-dim)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(30,58,95,0.12)" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
              {t("recompensas.tip")}
            </p>
          </div>
        </div>
      )}

      {/* Modal de recompensa desbloqueada */}
      {sorpresa && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Recompensa desbloqueada: ${sorpresa.nombre}`}
          onClick={() => setSorpresa(null)}
        >
          <div className="modal" style={{ maxWidth: 360, textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>{sorpresa.icono}</div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--navy)", marginBottom: 8 }}>{sorpresa.nombre}</h2>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: 20 }}>{sorpresa.desc}</p>
            <div style={{ padding: 14, background: "var(--navy-dim)", border: "1.5px solid rgba(30,58,95,0.18)", borderRadius: "var(--radius-sm)", marginBottom: 20 }}>
              <p style={{ fontSize: "0.82rem", color: "var(--navy)", fontWeight: 600, margin: 0 }}>
                {t("recompensas.unlocked")}<br />
                <span style={{ color: "var(--muted)", fontWeight: 400 }}>{t("recompensas.unlockedHint")}</span>
              </p>
            </div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setSorpresa(null)}>
              {t("recompensas.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const st = {
  panel: {
    position: "absolute",
    top: "calc(100% + 12px)",
    right: 0,
    width: 320,
    background: "var(--card)",
    border: "1.5px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: 20,
    boxShadow: "var(--shadow-lg)",
    zIndex: 200,
    animation: "slideUp 0.2s ease",
  },
  panelHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16,
  },
  cerrar: {
    background: "none", border: "none", color: "var(--muted)", fontSize: "1.3rem",
    cursor: "pointer", padding: "2px 6px", borderRadius: 6, lineHeight: 1,
  },
  totalCard: {
    borderRadius: "var(--radius-sm)", padding: "14px 16px", marginBottom: 16,
  },
  recompensaBtn: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "12px 8px", borderRadius: "var(--radius-sm)",
    transition: "all 0.15s", gap: 4,
  },
};
