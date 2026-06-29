import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { obtenerTodosLosProyectos, calcularYieldDetallado, stroopsAMXNe, urlExplorer, CONFIG } from "../stellar/contrato";
import { parsearError } from "../utils/errores.js";
import { createClient } from "@supabase/supabase-js";
import usePaginacion from "../hooks/usePaginacion";
import usePaginacionLocal from "../hooks/usePaginacionLocal";
import Paginacion from "./Paginacion";
import AuditoriaBadge from "./AuditoriaBadge";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const supabase = supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("placeholder.supabase.co") && supabaseAnonKey !== "placeholder"
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const ESTADOS_OCULTOS = new Set(["EnRevision", "Rechazado"]);

const ESTADO_CFG = {
  EtapaInicial: { badge: "badge-muted" },
  EnProgreso:   { badge: "badge-teal"  },
  Liberado:     { badge: "badge-amber" },
  Abandonado:   { badge: "badge-red"   },
};

function StatStrip({ label, valor, mono, highlight }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontFamily: mono ? "'SFMono-Regular', 'Consolas', monospace" : "inherit",
        fontWeight: 700, fontSize: "0.95rem",
        color: highlight ? "var(--green)" : "var(--text2)",
      }}>
        {valor}
      </div>
    </div>
  );
}

export default function Transparencia({ onVolver }) {
  const { t } = useTranslation();
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [filtro, setFiltro] = useState("Todos");
  const [auditFiltro, setAuditFiltro] = useState("Todos");
  const [auditActor, setAuditActor] = useState("");
  const [auditStartDate, setAuditStartDate] = useState("");
  const [auditEndDate, setAuditEndDate] = useState("");
  const [totalYield, setTotalYield] = useState(BigInt(0));
  const contribTopRef = useRef(null);
  const auditTopRef = useRef(null);

  const FILTROS = [
    { key: "Todos",        label: t("filters.all")        },
    { key: "EtapaInicial", label: t("filters.initial")    },
    { key: "EnProgreso",   label: t("filters.inProgress") },
    { key: "Liberado",     label: t("filters.released")   },
    { key: "Abandonado",   label: t("filters.abandoned")  },
  ];

  async function cargar() {
    setCargando(true);
    setErrorCarga(null);
    try {
      const data = await obtenerTodosLosProyectos();
      const publicos = data.filter(p => !ESTADOS_OCULTOS.has(p.estado));
      setProyectos(publicos);

      const yields = await Promise.all(
        publicos.map(p => calcularYieldDetallado(p.id).catch(() => ({ total: BigInt(0) })))
      );
      const sumaYield = yields.reduce((s, y) => {
        try { return s + BigInt(y?.total ?? 0); } catch { return s; }
      }, BigInt(0));
      setTotalYield(sumaYield);
    } catch (e) {
      setErrorCarga(parsearError(e));
    } finally {
      setCargando(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar(); }, []);

  // Paginated contributions across platform (Supabase)
  const contribPaginacion = usePaginacion(
    (desde, hasta) => {
      if (!supabase) return Promise.resolve({ data: [], count: 0 });
      return supabase
        .from("aportaciones")
        .select("proyecto_id, contribuidor, monto, retirado, timestamp", { count: "exact" })
        .order("timestamp", { ascending: false })
        .range(desde, hasta);
    },
    [/* no extra deps */ filtro]
  );

  const auditPaginacion = usePaginacion(
    async (desde, hasta) => {
      const params = new URLSearchParams({ limit: hasta - desde + 1, offset: desde });
      if (auditFiltro !== "Todos") params.set("action", auditFiltro);
      if (auditActor.trim()) params.set("actor", auditActor.trim());
      if (auditStartDate) params.set("start_date", auditStartDate);
      if (auditEndDate) params.set("end_date", auditEndDate);
      const res = await fetch(`${API_URL}/audit?${params}`);
      if (!res.ok) throw new Error("Error fetching audit");
      return res.json(); // { data, count }
    },
    [auditFiltro, auditActor, auditStartDate, auditEndDate]
  );

  const totalBloqueado = proyectos.reduce((s, p) => {
    try { return s + BigInt(p.aportado ?? 0); } catch { return s; }
  }, BigInt(0));
  const enProgreso = proyectos.filter(p => p.estado === "EnProgreso").length;

  const proyectosFiltrados = filtro === "Todos"
    ? proyectos
    : proyectos.filter(p => p.estado === filtro);

  const gridRef = useRef(null);
  const { datosPagina, pagina, setPagina, totalPaginas } = usePaginacionLocal(proyectosFiltrados, [filtro]);

  const handlePaginaChange = (nueva) => {
    setPagina(nueva);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ maxWidth: "1140px", margin: "0 auto", padding: "40px 24px" }}>

      {onVolver && (
        <button
          onClick={onVolver}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--navy)", fontWeight: 500, fontSize: "0.88rem",
            padding: "0 0 20px 0", display: "block",
          }}
        >
          {t("transp.back")}
        </button>
      )}

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
          {t("transp.title")}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 4 }}>
          {t("transp.subtitle")}
        </p>
      </div>

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        background: "var(--navy-dim)", border: "1px solid rgba(30,58,95,0.12)",
        borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 24,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--navy)", flexShrink: 0, marginTop: 2 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style={{ fontSize: "0.86rem", color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
          <strong style={{ color: "var(--text2)" }}>{t("transp.infoTitle")}</strong>{" "}
          {t("transp.infoDesc")}{" "}
          <a
            href={urlExplorer("contract", CONFIG.CONTRACT_ID)}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--navy)", fontWeight: 600, whiteSpace: "nowrap" }}
          >
            {t("transp.viewContract")} ↗
          </a>
        </p>
      </div>

      <AuditoriaBadge variant="full" />

      {errorCarga && (
        <div role="alert" style={{
          color: "var(--error, #DC2626)", background: "rgba(220,38,38,0.06)",
          border: "1px solid rgba(220,38,38,0.18)", borderRadius: "var(--radius-sm)",
          padding: "12px 16px", fontSize: "0.86rem", marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <span>{t("transp.errorLoad")}</span>
          <button
            onClick={cargar}
            style={{
              background: "none", border: "1px solid rgba(220,38,38,0.30)", cursor: "pointer",
              color: "var(--error, #DC2626)", padding: "4px 12px", borderRadius: "var(--radius-sm)",
              fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: "0.82rem", whiteSpace: "nowrap",
            }}
          >
            {t("transp.retry")}
          </button>
        </div>
      )}

      {cargando ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 0" }} role="status" aria-live="polite">
          <div style={{ width: 32, height: 32, border: "2px solid var(--border)", borderTopColor: "var(--navy)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} aria-hidden="true" />
          <p style={{ color: "var(--muted)", marginTop: 16, fontSize: "0.9rem" }}>{t("transp.loading")}</p>
        </div>
      ) : (
        <>
          {proyectos.length > 0 && (
            <div className="stats-strip-scroll lista-stats-strip" style={{
              display: "flex", alignItems: "center",
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", padding: "16px 24px",
              marginBottom: 20, boxShadow: "var(--shadow-sm)",
            }}>
              <StatStrip label={t("transp.statTotal")} valor={proyectos.length} />
              <div style={{ width: 1, height: 28, background: "var(--border)", flexShrink: 0 }} />
              <StatStrip label={t("transp.statLocked")} valor={stroopsAMXNe(totalBloqueado)} mono />
              <div style={{ width: 1, height: 28, background: "var(--border)", flexShrink: 0 }} />
              <StatStrip label={t("transp.statProgress")} valor={enProgreso} highlight />
              <div style={{ width: 1, height: 28, background: "var(--border)", flexShrink: 0 }} />
              <StatStrip label={t("transp.statYield")} valor={stroopsAMXNe(totalYield)} mono />
            </div>
          )}

          {proyectos.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", marginRight: 8 }}>
                {t("transp.filterLabel")}
              </span>
            </div>
          )}

          {proyectos.length > 0 && (
            <div className="filtros-row" style={{
              display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20,
            }}>
              {FILTROS.map(f => {
                const activo = filtro === f.key;
                const count = f.key === "Todos"
                  ? proyectos.length
                  : proyectos.filter(p => p.estado === f.key).length;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFiltro(f.key)}
                    aria-pressed={activo}
                    style={{
                      padding: "6px 14px", borderRadius: "var(--radius-sm)",
                      fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: "0.82rem",
                      cursor: "pointer", transition: "all 0.15s",
                      display: "flex", alignItems: "center", gap: 4,
                      background: activo ? "var(--navy)" : "var(--card)",
                      color: activo ? "#fff" : "var(--text2)",
                      border: `1px solid ${activo ? "var(--navy)" : "var(--border2)"}`,
                    }}
                  >
                    {f.label}
                    <span style={{
                      background: activo ? "rgba(255,255,255,0.22)" : "var(--bg)",
                      color: activo ? "#fff" : "var(--muted)",
                      borderRadius: "99px", padding: "1px 7px",
                      fontSize: "0.72rem", fontWeight: 600, marginLeft: 2,
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {proyectos.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 0", textAlign: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--border2)" }}>
                <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
              </svg>
              <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginTop: 16 }}>
                {t("transp.empty")}
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>
                {t("transp.emptyHint")}
              </p>
            </div>
          ) : proyectosFiltrados.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 0", textAlign: "center" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--border2)" }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginTop: 16 }}>
                {t("transp.noResults")}
              </p>
              <button
                className="btn btn-ghost"
                onClick={() => setFiltro("Todos")}
                style={{ marginTop: 16 }}
              >
                {t("transp.viewAll")}
              </button>
            </div>
          ) : (
            <>
              <div ref={gridRef} className="grid-proyectos" style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))",
                gap: 16,
              }} role="list" aria-label={t("transp.title")}>
                {datosPagina.map(p => (
                  <ProyectoCard key={p.id} proyecto={p} />
                ))}
              </div>
              <Paginacion pagina={pagina} totalPaginas={totalPaginas} onChange={handlePaginaChange} />
            </>
          )}
          {/* Paginated contributions table */}
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>{t("transp.contributionsTitle")}</h2>
            <div ref={contribTopRef} />
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 12 }}>{t("transp.colProject")}</th>
                    <th style={{ textAlign: "left", padding: 12 }}>{t("transp.colContributor")}</th>
                    <th style={{ textAlign: "right", padding: 12 }}>{t("transp.colAmount")}</th>
                    <th style={{ textAlign: "right", padding: 12 }}>{t("transp.colWhen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {contribPaginacion.cargando ? (
                    <tr><td colSpan={4}><div style={{ padding: 12 }}><div className="skeleton" style={{ height: 140 }} /></div></td></tr>
                  ) : (
                    contribPaginacion.datos.map((r) => {
                      const proyecto = proyectos.find((p) => Number(p.id) === Number(r.proyecto_id)) || { nombre: `#${r.proyecto_id}` };
                      return (
                        <tr key={`${r.proyecto_id}_${r.contribuidor}_${r.timestamp}`}>
                          <td style={{ padding: 12 }}>{proyecto.nombre}</td>
                          <td style={{ padding: 12, fontFamily: "monospace" }}>
                            <a
                              href={urlExplorer("account", r.contribuidor)}
                              target="_blank"
                              rel="noreferrer"
                              title={`${t("transp.viewAccount")}: ${r.contribuidor}`}
                              style={{ color: "var(--navy)", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}
                            >
                              {r.contribuidor ? `${r.contribuidor.slice(0, 5)}…${r.contribuidor.slice(-4)}` : "—"} ↗
                            </a>
                          </td>
                          <td style={{ padding: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{stroopsAMXNe(r.monto)}</td>
                          <td style={{ padding: 12, textAlign: "right" }}>{r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={contribPaginacion.pagina} totalPaginas={contribPaginacion.totalPaginas} onChange={(p) => { contribPaginacion.setPagina(p); contribTopRef.current?.scrollIntoView({ behavior: "auto", block: "start" }); }} />
          </div>

          {/* Paginated Audit Trail table */}
          <div style={{ marginTop: 40 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>{t("transp.auditTitle")}</h2>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {["Todos", "aprobar", "rechazar", "pausar", "reanudar", "upgrade"].map(f => (
                    <button
                      key={f}
                      onClick={() => setAuditFiltro(f)}
                      style={{
                        padding: "4px 10px", borderRadius: "var(--radius-sm)",
                        fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: "0.75rem",
                        cursor: "pointer", transition: "all 0.15s",
                        background: auditFiltro === f ? "var(--navy)" : "var(--card)",
                        color: auditFiltro === f ? "#fff" : "var(--text2)",
                        border: `1px solid ${auditFiltro === f ? "var(--navy)" : "var(--border2)"}`,
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input type="text" placeholder="Actor address..." value={auditActor} onChange={e => setAuditActor(e.target.value)} style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", width: 150 }} />
                  <input type="date" value={auditStartDate} onChange={e => setAuditStartDate(e.target.value)} style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
                  <input type="date" value={auditEndDate} onChange={e => setAuditEndDate(e.target.value)} style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
                </div>
              </div>
              <a
                href={`${API_URL}/audit?format=csv${auditFiltro !== "Todos" ? `&action=${auditFiltro}` : ""}${auditActor ? `&actor=${auditActor}` : ""}${auditStartDate ? `&start_date=${auditStartDate}` : ""}${auditEndDate ? `&end_date=${auditEndDate}` : ""}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  color: "var(--text)", padding: "6px 12px", borderRadius: "var(--radius-sm)",
                  fontSize: "0.82rem", fontWeight: 600, textDecoration: "none",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {t("transp.auditExportCsv")}
              </a>
            </div>
            
            <div ref={auditTopRef} />
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 12 }}>{t("transp.auditTime")}</th>
                    <th style={{ textAlign: "left", padding: 12 }}>{t("transp.auditAction")}</th>
                    <th style={{ textAlign: "left", padding: 12 }}>{t("transp.auditActor")}</th>
                    <th style={{ textAlign: "left", padding: 12 }}>{t("transp.auditTarget")}</th>
                    <th style={{ textAlign: "center", padding: 12 }}>{t("transp.auditHash")}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditPaginacion.cargando ? (
                    <tr><td colSpan={5}><div style={{ padding: 12 }}><div className="skeleton" style={{ height: 140 }} /></div></td></tr>
                  ) : auditPaginacion.datos.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>{t("transp.auditEmpty")}</td></tr>
                  ) : (
                    auditPaginacion.datos.map((r) => (
                      <tr key={r.id}>
                        <td style={{ padding: 12 }}>{r.block_time ? new Date(r.block_time).toLocaleString() : "—"}</td>
                        <td style={{ padding: 12 }}>
                          <span style={{ background: "var(--bg)", padding: "2px 6px", borderRadius: "4px", fontSize: "0.8rem", border: "1px solid var(--border2)" }}>
                            {r.action}
                          </span>
                        </td>
                        <td style={{ padding: 12, fontFamily: "monospace" }}>
                          <a
                            href={urlExplorer("account", r.actor_address)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--navy)", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}
                          >
                            {r.actor_address ? `${r.actor_address.slice(0, 5)}…${r.actor_address.slice(-4)}` : "—"} ↗
                          </a>
                        </td>
                        <td style={{ padding: 12 }}>{r.target}</td>
                        <td style={{ padding: 12, textAlign: "center", fontFamily: "monospace" }}>
                          {r.tx_hash ? (
                            <a
                              href={urlExplorer("tx", r.tx_hash)}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "var(--navy)", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}
                            >
                              {r.tx_hash.slice(0, 4)}…{r.tx_hash.slice(-4)} ↗
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={auditPaginacion.pagina} totalPaginas={auditPaginacion.totalPaginas} onChange={(p) => { auditPaginacion.setPagina(p); auditTopRef.current?.scrollIntoView({ behavior: "auto", block: "start" }); }} />
          </div>
        </>
      )}
    </div>
  );
}

function ProyectoCard({ proyecto }) {
  const { t } = useTranslation();
  const meta     = Number(proyecto.meta);
  const aportado = Number(proyecto.aportado);
  const pct      = meta > 0 ? Math.min((aportado / meta) * 100, 100) : 0;
  const estado   = proyecto.estado ?? "EtapaInicial";
  const cfg      = ESTADO_CFG[estado] ?? ESTADO_CFG.EtapaInicial;

  return (
    <article
      className="card"
      role="listitem"
      style={{ display: "flex", flexDirection: "column", opacity: estado === "Abandonado" ? 0.75 : 1 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span className={`badge ${cfg.badge}`}>
          <span className="badge-dot" />
          {t(`status.${estado}`)}
        </span>
        {proyecto.doc_hash && (
          <span style={{
            background: "var(--green-dim)", border: "1px solid rgba(22,163,74,0.20)",
            color: "var(--green)", fontSize: "0.7rem", fontWeight: 600,
            padding: "2px 8px", borderRadius: "99px",
          }}>
            {t("transp.verified")}
          </span>
        )}
      </div>

      <h3 style={{ fontSize: "0.98rem", fontWeight: 600, marginBottom: 4, lineHeight: 1.4, color: "var(--text)" }}>
        {proyecto.nombre}
      </h3>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{t("transp.funding")}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--green)", fontWeight: 700 }}>
            {pct.toFixed(0)}%
          </span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${pct.toFixed(0)}%`}
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            {t("transp.locked")}
          </div>
          <div style={{ fontFamily: "'SFMono-Regular','Consolas',monospace", fontSize: "0.82rem", color: "var(--text2)", marginTop: 3, fontWeight: 600 }}>
            {stroopsAMXNe(proyecto.aportado)}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            {t("transp.goal")}
          </div>
          <div style={{ fontFamily: "'SFMono-Regular','Consolas',monospace", fontSize: "0.82rem", color: "var(--muted)", marginTop: 3, fontWeight: 600 }}>
            {stroopsAMXNe(proyecto.meta)}
          </div>
        </div>
      </div>
    </article>
  );
}
