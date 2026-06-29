import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const supabase = supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("placeholder.supabase.co") && supabaseAnonKey !== "placeholder"
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

function fmtMXNe(stroops) {
  const mxne = Number(stroops) / 10_000_000;
  return mxne.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function SkeletonCard() {
  return (
    <div className="card" aria-hidden="true" style={{ pointerEvents: "none", userSelect: "none", ...estilos.card }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div className="skeleton" style={{ height: 48, width: 48, borderRadius: 8 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 20, width: "70%", marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 14, width: "40%" }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 8, borderRadius: 4, marginBottom: 14 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className="skeleton" style={{ height: 36, borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 36, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export default function CasosDeExito() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [completados, setCompletados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [evidenciaMap, setEvidenciaMap] = useState({});

  useEffect(() => {
    let cancel = false;
    async function cargar() {
      setCargando(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/impacto`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancel) return;
        setCompletados(data);

        if (supabase && data.length > 0) {
          const ids = data.map(p => p.id);
          const { data: evidencia } = await supabase
            .from("proyecto_evidencia")
            .select("*")
            .in("proyecto_id", ids)
            .order("uploaded_at", { ascending: false });
          if (cancel) return;
          if (evidencia) {
            const map = {};
            for (const e of evidencia) {
              if (!map[e.proyecto_id]) map[e.proyecto_id] = [];
              map[e.proyecto_id].push(e);
            }
            setEvidenciaMap(map);
          }
        }
      } catch (e) {
        if (!cancel) setError(e.message || t("impacto.errorLoad"));
      } finally {
        if (!cancel) setCargando(false);
      }
    }
    cargar();
    return () => { cancel = true; };
  }, [t]);

  return (
    <div style={estilos.page}>
      {cargando ? (
        <div style={estilos.grid}>
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div style={estilos.empty}>
          <p style={{ color: "var(--error)", fontSize: "0.9rem" }}>{error}</p>
        </div>
      ) : completados.length === 0 ? (
        <div style={estilos.empty}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--border2)" }}>
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
          <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginTop: 16 }}>
            {t("impacto.empty")}
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>
            {t("impacto.emptyHint")}
          </p>
        </div>
      ) : (
        <div style={estilos.grid}>
          {completados.map((p) => {
            const evids = evidenciaMap[p.id] ?? [];
            return (
              <ImpactCard
                key={p.id}
                proyecto={p}
                evidenciaCount={evids.length}
                onView={() => navigate(`/proyectos/${p.id}`)}
                t={t}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ImpactCard({ proyecto, evidenciaCount, onView, t }) {
  const pct = proyecto.porcentaje_devuelto ?? 0;
  const isFullReturn = pct >= 100;

  return (
    <article
      className="card"
      style={estilos.card}
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onView(); }}
    >
      <div style={estilos.cardHeader}>
        <div style={estilos.cardHeaderLeft}>
          <h3 style={estilos.cardTitle}>{proyecto.nombre}</h3>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={estilos.verifiedBadge}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              {t("impacto.verifiedBadge")}
            </span>
            {evidenciaCount > 0 && (
              <span style={estilos.evidenciaBadge}>
                {evidenciaCount} {evidenciaCount === 1 ? "evidencia" : "evidencias"}
              </span>
            )}
          </div>
        </div>
        <div style={estilos.metaBadge}>
          {t("impacto.fundedGoal")}
        </div>
      </div>

      <div style={estilos.metricsGrid}>
        <div style={estilos.metricCell}>
          <div style={estilos.metricLabel}>{t("impacto.totalContributed")}</div>
          <div style={estilos.metricValue}>{fmtMXNe(proyecto.total_contribuido)} MXNe</div>
        </div>
        <div style={estilos.metricCell}>
          <div style={estilos.metricLabel}>{t("impacto.contributors", { count: proyecto.num_contribuidores, plural: proyecto.num_contribuidores !== 1 ? "es" : "" })}</div>
          <div style={estilos.metricValue}>{proyecto.num_contribuidores}</div>
        </div>
        <div style={estilos.metricCell}>
          <div style={estilos.metricLabel}>{t("impacto.yieldGenerated")}</div>
          <div style={{ ...estilos.metricValue, color: "var(--green)" }}>+{fmtMXNe(proyecto.yield_generado)} MXNe</div>
        </div>
        <div style={estilos.metricCell}>
          <div style={estilos.metricLabel}>{t("impacto.capitalReturned")}</div>
          <div style={{
            ...estilos.metricValue,
            color: isFullReturn ? "var(--green)" : "var(--amber)",
            fontWeight: 700,
          }}>
            {isFullReturn ? t("impacto.capitalReturnedFull") : t("impacto.capitalReturnedPct", { pct })}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px 16px" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", fontSize: "0.75rem",
          color: "var(--muted)", marginBottom: 4,
        }}>
          <span>{t("impacto.capitalReturned")}</span>
          <span style={{ fontWeight: 700, color: isFullReturn ? "var(--green)" : "var(--text)" }}>
            {pct}%
          </span>
        </div>
        <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{
            width: `${pct}%`,
            background: isFullReturn ? "var(--green)" : "var(--amber)",
          }} />
        </div>
      </div>

      <div style={estilos.cardFooter}>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          {t("impacto.transactionCount", { count: (proyecto.transacciones?.contribuciones?.length ?? 0) + (proyecto.transacciones?.retiros?.length ?? 0), plural: "" })}
        </span>
        <button
          className="btn btn-secondary"
          style={{ fontSize: "0.82rem", padding: "6px 14px" }}
          onClick={(e) => { e.stopPropagation(); onView(); }}
        >
          {t("impacto.viewDetails")}
        </button>
      </div>
    </article>
  );
}

const estilos = {
  page: {
    maxWidth: "1140px",
    margin: "0 auto",
    padding: "40px 24px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
    gap: 20,
  },
  card: {
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: "1.5px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--card)",
    transition: "box-shadow 0.15s, border-color 0.15s",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "20px 20px 12px",
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "var(--text)",
    margin: "0 0 6px",
    lineHeight: 1.3,
  },
  verifiedBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "var(--green)",
    background: "var(--green-dim)",
    border: "1px solid rgba(22,163,74,0.20)",
    padding: "2px 8px",
    borderRadius: 99,
  },
  evidenciaBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "var(--navy)",
    background: "var(--navy-dim)",
    border: "1px solid rgba(30,58,95,0.15)",
    padding: "2px 8px",
    borderRadius: 99,
  },
  metaBadge: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "var(--green)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "var(--green-dim)",
    border: "1px solid rgba(22,163,74,0.20)",
    padding: "4px 10px",
    borderRadius: 99,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 1,
    background: "var(--border)",
    borderTop: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    margin: "0 0 12px",
  },
  metricCell: {
    background: "var(--card)",
    padding: "12px 16px",
  },
  metricLabel: {
    fontSize: "0.68rem",
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 600,
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: "'SFMono-Regular','Consolas',monospace",
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "var(--text)",
  },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px 16px",
    borderTop: "1px solid var(--border)",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "80px 0",
    textAlign: "center",
  },
};
