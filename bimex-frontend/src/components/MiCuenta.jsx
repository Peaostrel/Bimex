import { useState, useEffect, useRef, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import { createClient } from "@supabase/supabase-js";
import { parsearError } from "../utils/errores.js";
import usePaginacion from "../hooks/usePaginacion";
import usePaginacionLocal from "../hooks/usePaginacionLocal";
import Paginacion from "./Paginacion";
import {
  obtenerTodosLosProyectos,
  obtenerAportacion,
  calcularYield,
  stroopsAMXNe,
} from "../stellar/contrato";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const supabase = supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("placeholder.supabase.co") && supabaseAnonKey !== "placeholder"
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ─── Config de estado ─────────────────────────────────────────────────────────

const ESTADO_CFG = {
  EtapaInicial: { labelKey: "status.EtapaInicial", badgeClass: "badge-muted"  },
  EnProgreso:   { labelKey: "status.EnProgreso",   badgeClass: "badge-teal"   },
  Liberado:     { labelKey: "status.Liberado",     badgeClass: "badge-amber"  },
  Abandonado:   { labelKey: "status.Abandonado",   badgeClass: "badge-red"    },
  EnRevision:   { labelKey: "status.EnRevision",   badgeClass: null, customStyle: { background: "var(--amber-dim)", color: "var(--amber)", border: "1px solid rgba(217,119,6,0.20)" } },
  Rechazado:    { labelKey: "status.Rechazado",    badgeClass: "badge-red"    },
};

function getBadgeCfg(estado) {
  return ESTADO_CFG[estado] ?? ESTADO_CFG.EtapaInicial;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(aportado, meta) {
  const a = Number(aportado ?? 0);
  const m = Number(meta ?? 0);
  return m > 0 ? Math.min((a / m) * 100, 100) : 0;
}

function puedeRetirar(estado) {
  return estado === "EtapaInicial" || estado === "EnProgreso" || estado === "Liberado" || estado === "Abandonado";
}

function escaparCSV(valor) {
  const texto = String(valor ?? "");
  const sanitizado = /^\s*[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return `"${sanitizado.replace(/"/g, '""')}"`;
}

function stroopsADecimal(stroops, decimales) {
  const n = BigInt(stroops ?? 0);
  const esNegativo = n < 0n;
  const absoluto = esNegativo ? -n : n;
  const entero = absoluto / 10_000_000n;
  const resto = absoluto % 10_000_000n;
  const signo = esNegativo ? "-" : "";
  const decimalesNorm = Math.max(0, Math.min(7, Math.trunc(Number(decimales) || 0)));
  if (decimalesNorm === 0) return `${signo}${entero}`;
  return `${signo}${entero}.${String(resto).padStart(7, "0").slice(0, decimalesNorm)}`;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconCapital() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v2m0 8v2M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-2.5 2.5S9.5 13 9.5 14.5a2.5 2.5 0 0 0 5 0"/>
    </svg>
  );
}

function IconRendimiento() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  );
}

function IconProyectos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

function IconSeedling() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 20c0-5.5 5.5-9 9-9"/>
      <path d="M2 9c0-3.3 2.7-6 6-6 3.3 0 6 2.7 6 6 0 4.4-3 6-6 6-2 0-4-.5-6-2"/>
    </svg>
  );
}

function IconInbox() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Spinner() {
  const { t } = useTranslation();
  return (
    <div style={estilos.loadingWrap} role="status" aria-live="polite" aria-label={t("cuenta.loading")}>
      <div style={estilos.spinner} aria-hidden="true" />
      <p style={{ color: "var(--muted)", marginTop: 16, fontSize: "0.9rem" }}>{t("cuenta.loading")}</p>
    </div>
  );
}

function SkeletonTableRows({ count = 5 }) {
  return (
    <div aria-hidden="true" style={{ pointerEvents: 'none', userSelect: 'none' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 16, padding: '12px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
          <div className="skeleton" style={{ height: 16, width: '25%' }} />
          <div className="skeleton" style={{ height: 16, width: '10%' }} />
          <div className="skeleton" style={{ height: 16, width: '12%' }} />
          <div className="skeleton" style={{ height: 16, width: '12%' }} />
          <div className="skeleton" style={{ height: 16, width: '15%' }} />
          <div className="skeleton" style={{ height: 16, width: '10%' }} />
          <div className="skeleton" style={{ height: 28, width: '16%', borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

function EstadoBadge({ estado }) {
  const { t } = useTranslation();
  const cfg = getBadgeCfg(estado);
  if (cfg.customStyle) {
    return <span className="badge" style={cfg.customStyle}>{t(cfg.labelKey)}</span>;
  }
  return <span className={`badge ${cfg.badgeClass}`}>{t(cfg.labelKey)}</span>;
}

// ─── Metric Cards (top summary) ───────────────────────────────────────────────

function MetricCard({ icon, label, value, accent }) {
  return (
    <div style={{ ...estilos.metricCard, borderTopColor: accent ?? "var(--navy)" }}>
      <div style={estilos.metricIcon}>{icon}</div>
      <div style={estilos.metricLabel}>{label}</div>
      <div style={{ ...estilos.metricValue, color: accent ?? "var(--navy)" }}>{value}</div>
    </div>
  );
}

// ─── Pestaña: Mis proyectos ───────────────────────────────────────────────────

const CardMiProyecto = memo(function CardMiProyecto({ proyecto, onVerProyecto }) {
  const { t } = useTranslation();
  const progreso = pct(proyecto.aportado, proyecto.meta);

  return (
    <article className="card" style={estilos.card}>
      <div style={estilos.cardTop}>
        <h3 style={estilos.cardTitulo}>{proyecto.nombre}</h3>
        <EstadoBadge estado={proyecto.estado} />
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: "0.76rem", color: "var(--muted)" }}>{t("cuenta.funding")}</span>
          <span style={{ fontSize: "0.76rem", color: "var(--navy)", fontWeight: 700 }}>
            {progreso.toFixed(0)}%
          </span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={Math.round(progreso)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${progreso.toFixed(0)}% del objetivo`}
        >
          <div className="progress-fill" style={{ width: `${progreso}%` }} />
        </div>
      </div>

      <div style={estilos.statsRow}>
        <div>
          <div style={estilos.statLabel}>{t("cuenta.raised")}</div>
          <div style={estilos.statValor}>{stroopsAMXNe(proyecto.aportado)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={estilos.statLabel}>{t("cuenta.goal")}</div>
          <div style={estilos.statValor}>{stroopsAMXNe(proyecto.meta)}</div>
        </div>
      </div>

      <button
        className="btn btn-secondary"
        style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
        onClick={() => onVerProyecto(proyecto)}
        aria-label={`${t("cuenta.viewDetails")} ${proyecto.nombre}`}
      >
        {t("cuenta.viewDetails")}
      </button>
    </article>
  );
});

function TabMisProyectos({ proyectos, direccion, onVerProyecto }) {
  const { t } = useTranslation();
  const misProyectos = useMemo(() => proyectos.filter((p) => p.dueno === direccion), [proyectos, direccion]);
  const gridRef = useRef(null);
  const { datosPagina, pagina, setPagina, totalPaginas } = usePaginacionLocal(misProyectos, [direccion]);

  const handlePaginaChange = (nueva) => {
    setPagina(nueva);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (misProyectos.length === 0) {
    return (
      <div style={estilos.empty}>
        <IconSeedling />
        <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)", marginTop: 16 }}>
          {t("cuenta.noProjects")}
        </p>
        <p style={{ fontSize: "0.86rem", color: "var(--muted)", marginTop: 6 }}>
          {t("cuenta.noProjectsHint")}
        </p>
      </div>
    );
  }

  return (
    <div ref={gridRef}>
      <div className="cuenta-grid" style={estilos.grid} role="list" aria-label={t("cuenta.ariaProjects")}>
        {datosPagina.map((p) => (
          <CardMiProyecto key={p.id} proyecto={p} onVerProyecto={onVerProyecto} />
        ))}
      </div>
      <Paginacion pagina={pagina} totalPaginas={totalPaginas} onChange={handlePaginaChange} />
    </div>
  );
}

// ─── Pestaña: Mis contribuciones ──────────────────────────────────────────────

function TabMisContribuciones({ proyectos, direccion, onVerProyecto }) {
  const { t } = useTranslation();
  const [contribuciones, setContribuciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorContrib, setErrorContrib] = useState(null);
  const tableTopRef = useRef(null);

  function exportarCSV(rows) {
    const encabezado = [
      t("cuenta.colProyecto"),
      t("cuenta.colModo"),
      t("cuenta.colCapital"),
      t("cuenta.colRendimiento"),
      t("cuenta.colEstado"),
      t("cuenta.colCierre"),
    ];
    const dateFormatter = new Intl.DateTimeFormat("es-MX");
    const filas = rows.map((c) => {
      const fechaInicio = c.proyecto?.timestamp_inicio
        ? dateFormatter.format(new Date(c.proyecto.timestamp_inicio * 1000))
        : "";
      const fechaCierre = c.proyecto?.fecha_cierre ?? "";
      const modoRaw = c.proyecto?.modo ?? "";
      const modo = modoRaw === "Mecenas" ? t("detalle.modeMecenas") : modoRaw === "Inversor" ? t("detalle.modeInversor") : modoRaw;

      return [
        escaparCSV(c.proyecto?.nombre ?? ""),
        escaparCSV(modo),
        escaparCSV(stroopsADecimal(c.aportacion, 2)),
        escaparCSV(stroopsADecimal(c.yieldAcum, 4)),
        escaparCSV(c.proyecto?.estado ?? ""),
        escaparCSV(fechaCierre || fechaInicio),
      ];
    });
    const csv = [encabezado, ...filas].map((fila) => fila.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bimex-historial-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // If Supabase is configured we use paginated query from the aportaciones table.
  const useSupabasePagination = !!supabase && !!direccion;

  const paginacion = usePaginacion(
    (desde, hasta) => {
      if (!useSupabasePagination) return Promise.resolve({ data: [], count: 0 });
      return supabase
        .from("aportaciones")
        .select("proyecto_id, contribuidor, monto, retirado, timestamp", { count: "exact" })
        .eq("contribuidor", direccion)
        .order("timestamp", { ascending: false })
        .range(desde, hasta);
    },
    [direccion]
  );

  useEffect(() => {
    let mounted = true;
    async function loadFallback() {
      // fallback to previous behavior (on-chain lookups) when Supabase is not available
      if (useSupabasePagination) return;
      if (proyectos.length === 0) { setCargando(false); return; }
      setCargando(true); setErrorContrib(null);
      try {
        const resultados = await Promise.all(
          proyectos.map(async (p) => {
            const [aportacion, yieldAcum] = await Promise.all([
              obtenerAportacion(p.id, direccion),
              calcularYield(p.id, direccion),
            ]);
            return { proyecto: p, aportacion, yieldAcum };
          })
        );
        if (!mounted) return;
        setContribuciones(resultados.filter((r) => r.aportacion > BigInt(0)));
      } catch (e) {
        if (!mounted) return;
        setErrorContrib(parsearError(e));
      } finally { if (mounted) setCargando(false); }
    }
    loadFallback();
    return () => { mounted = false; };
  }, [proyectos, direccion, useSupabasePagination]);

  if (cargando) {
    return (
      <div role="status" aria-live="polite" aria-label={t("cuenta.loading")}>{
        <SkeletonTableRows count={5} />
      }</div>
    );
  }

  if (errorContrib) {
    return (
      <div role="alert" style={{ color: "var(--error, #DC2626)", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.18)", borderRadius: "var(--radius-sm)", padding: "14px 18px", fontSize: "0.86rem", marginTop: 8 }}>
        {errorContrib}
      </div>
    );
  }

  const encabezadoContribuciones = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
      <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>
        {t("cuenta.myContributions")}
      </h3>
      <button
        onClick={() => exportarCSV(contribuciones)}
        className="btn-outline"
        disabled={contribuciones.length === 0}
      >
        ↓ {t("cuenta.descargarCSV", "Descargar CSV")}
      </button>
    </div>
  );

  // If using Supabase pagination, show table driven by paginacion.datos
  const usingSupabase = useSupabasePagination;
  const rows = usingSupabase ? paginacion.datos : contribuciones;

  if (!usingSupabase && contribuciones.length === 0) {
    return (
      <div>
        {encabezadoContribuciones}
        <div style={estilos.empty}>
          <IconInbox />
          <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)", marginTop: 16 }}>
            {t("cuenta.noContributions")}
          </p>
          <p style={{ fontSize: "0.86rem", color: "var(--muted)", marginTop: 6 }}>
            {t("cuenta.noContributionsHint")}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div>
      {encabezadoContribuciones}
      <div ref={tableTopRef} />
      <div style={{ overflowX: "auto" }}>
        <table style={estilos.table}>
          <thead>
            <tr>
              <th style={estilos.th}>{t("cuenta.colProyecto")}</th>
              <th style={estilos.th}>{t("cuenta.colModo")}</th>
              <th style={{ ...estilos.th, textAlign: "right" }}>{t("cuenta.colCapital")}</th>
              <th style={{ ...estilos.th, textAlign: "right" }}>{t("cuenta.colRendimiento")}</th>
              <th style={estilos.th}>{t("cuenta.colEstado")}</th>
              <th style={estilos.th}>{t("cuenta.colCierre")}</th>
              <th style={estilos.th} />
            </tr>
          </thead>
          <tbody>
            {usingSupabase ? (
              paginacion.cargando ? (
                <tr><td colSpan={7}><SkeletonTableRows count={5} /></td></tr>
              ) : (
                rows.map((r) => {
                  const proyecto = proyectos.find((p) => Number(p.id) === Number(r.proyecto_id)) || { id: r.proyecto_id, nombre: `#${r.proyecto_id}`, estado: "EtapaInicial" };
                  const modo = proyecto.modo ?? "Inversor";
                  return (
                    <tr key={`${r.proyecto_id}_${r.timestamp}`} style={estilos.tr}>
                      <td style={estilos.td}><span style={{ fontWeight: 600, color: "var(--text)" }}>{proyecto.nombre}</span></td>
                      <td style={estilos.td}><span className={modo === "Mecenas" ? "badge badge-teal" : "badge badge-navy"}>{modo}</span></td>
                      <td style={{ ...estilos.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{stroopsAMXNe(r.monto)}</td>
                      <td style={{ ...estilos.td, textAlign: "right", color: "var(--green)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>—</td>
                      <td style={estilos.td}><EstadoBadge estado={proyecto.estado} /></td>
                      <td style={{ ...estilos.td, color: "var(--muted)", fontSize: "0.83rem" }}>{r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}</td>
                      <td style={{ ...estilos.td, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => onVerProyecto(proyecto)} aria-label={`${t("cuenta.viewDetailsShort")} ${proyecto.nombre}`}>
                            <IconFile />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )
            ) : (
              rows.map(({ proyecto, aportacion, yieldAcum }) => {
                const puedeRet = puedeRetirar(proyecto.estado);
                const modo = proyecto.modo ?? "Inversor";
                return (
                  <tr key={proyecto.id} style={estilos.tr}>
                    <td style={estilos.td}><span style={{ fontWeight: 600, color: "var(--text)" }}>{proyecto.nombre}</span></td>
                    <td style={estilos.td}><span className={modo === "Mecenas" ? "badge badge-teal" : "badge badge-navy"}>{modo}</span></td>
                    <td style={{ ...estilos.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{stroopsAMXNe(aportacion)}</td>
                    <td style={{ ...estilos.td, textAlign: "right", color: "var(--green)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{stroopsAMXNe(yieldAcum)}</td>
                    <td style={estilos.td}><EstadoBadge estado={proyecto.estado} /></td>
                    <td style={{ ...estilos.td, color: "var(--muted)", fontSize: "0.83rem" }}>{proyecto.fecha_cierre ?? "—"}</td>
                    <td style={{ ...estilos.td, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => onVerProyecto(proyecto)} aria-label={`${t("cuenta.viewDetailsShort")} ${proyecto.nombre}`}>
                          <IconFile />
                        </button>
                        {puedeRet && (
                          <button className="btn btn-amber" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => onVerProyecto(proyecto)} aria-label={`${t("cuenta.withdraw")} ${proyecto.nombre}`}>
                            {t("cuenta.withdraw")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {usingSupabase && (
        <Paginacion pagina={paginacion.pagina} totalPaginas={paginacion.totalPaginas} onChange={(p) => { paginacion.setPagina(p); tableTopRef.current?.scrollIntoView({ behavior: "auto", block: "start" }); }} />
      )}
    </div>
  );
}

// ─── Notificaciones ───────────────────────────────────────────────────────────

function NotificacionesPanel({ direccion }) {
  const [email,   setEmail]   = useState("");
  const [enabled, setEnabled] = useState(true);
  const [estado,  setEstado]  = useState("idle"); // idle | saving | ok | error
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    if (!direccion || !supabase) return;
    supabase
      .from("user_notifications")
      .select("email, notifications_enabled")
      .eq("wallet_address", direccion)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setEmail(data.email); setEnabled(data.notifications_enabled); }
        setCargado(true);
      })
      .catch(() => setCargado(true));
  }, [direccion]);

  async function guardar(e) {
    e.preventDefault();
    if (!email || !supabase) return;
    setEstado("saving");
    const { error } = await supabase
      .from("user_notifications")
      .upsert({ wallet_address: direccion, email, notifications_enabled: enabled }, { onConflict: "wallet_address" });
    setEstado(error ? "error" : "ok");
    setTimeout(() => setEstado("idle"), 3000);
  }

  if (!cargado) return null;

  return (
    <div style={estilos.notiPanel}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IconBell />
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>
              Notificaciones por email
            </div>
            <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>
              Recibe alertas cuando tu proyecto sea aprobado, financiado o tenga yield disponible.
            </div>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(v => !v)}
          style={{
            width: 44, height: 24, borderRadius: 99, border: "none", cursor: "pointer",
            background: enabled ? "var(--navy)" : "var(--border2)",
            position: "relative", flexShrink: 0, transition: "background 0.2s",
          }}
          aria-label={enabled ? "Desactivar notificaciones" : "Activar notificaciones"}
        >
          <span style={{
            position: "absolute", top: 3,
            left: enabled ? 22 : 3,
            width: 18, height: 18, borderRadius: "50%",
            background: "#fff", transition: "left 0.2s",
          }} />
        </button>
      </div>

      {enabled && (
        <form onSubmit={guardar} style={{ display: "flex", gap: 8 }}>
          <input
            type="email"
            required
            placeholder="tu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              flex: 1, padding: "9px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1.5px solid var(--border2)",
              fontFamily: "inherit", fontSize: "0.88rem",
              outline: "none", color: "var(--text)",
            }}
            onFocus={e => { e.target.style.borderColor = "var(--navy)"; }}
            onBlur={e => { e.target.style.borderColor = "var(--border2)"; }}
            aria-label="Email para notificaciones"
          />
          <button
            type="submit"
            disabled={estado === "saving"}
            className="btn btn-primary"
            style={{ whiteSpace: "nowrap", padding: "9px 18px" }}
          >
            {estado === "saving" ? "…" : estado === "ok" ? "Guardado" : estado === "error" ? "Error" : "Guardar"}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MiCuenta({ direccion, onVerProyecto, onTotalInvertido }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("proyectos");
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorPrincipal, setErrorPrincipal] = useState(null);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      setErrorPrincipal(null);
      try {
        const data = await obtenerTodosLosProyectos();
        setProyectos(data);
      } catch (e) {
        setErrorPrincipal(parsearError(e));
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [direccion]);

  const numCreados = useMemo(() => proyectos.filter((p) => p.dueno === direccion).length, [proyectos, direccion]);

  const [numApoyados,   setNumApoyados]   = useState(null);
  const [totalInvertido, setTotalInvertido] = useState(null);
  const [totalYield,     setTotalYield]     = useState(null);

  useEffect(() => {
    if (proyectos.length === 0) {
      setNumApoyados(0);
      setTotalInvertido(BigInt(0));
      setTotalYield(BigInt(0));
      return;
    }

    let cancelado = false;

    async function calcularResumen() {
      try {
        const resultados = await Promise.all(
          proyectos.map(async (p) => {
            const [aportacion, yieldAcum] = await Promise.all([
              obtenerAportacion(p.id, direccion),
              calcularYield(p.id, direccion),
            ]);
            return { aportacion, yieldAcum };
          })
        );
        if (cancelado) return;
        const positivos = resultados.filter((r) => r.aportacion > BigInt(0));
        const total  = positivos.reduce((acc, r) => acc + r.aportacion, BigInt(0));
        const totalY = positivos.reduce((acc, r) => {
          try { return acc + BigInt(r.yieldAcum ?? 0); } catch { return acc; }
        }, BigInt(0));
        setNumApoyados(positivos.length);
        setTotalInvertido(total);
        setTotalYield(totalY);
        onTotalInvertido?.(total);
      } catch (e) {
        if (!cancelado) {
          setErrorPrincipal(parsearError(e));
          setNumApoyados(0);
          setTotalInvertido(BigInt(0));
          setTotalYield(BigInt(0));
        }
      }
    }

    calcularResumen();
    return () => { cancelado = true; };
  }, [proyectos, direccion, onTotalInvertido]);

  const resumenListo = numApoyados !== null && totalInvertido !== null;

  return (
    <div className="cuenta-contenedor" style={estilos.contenedor}>
      {/* Header */}
      <div style={estilos.header}>
        <div>
          <h2 style={estilos.titulo}>{t("cuenta.title")}</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.84rem", marginTop: 4, fontFamily: "monospace" }}>
            {direccion.slice(0, 8)}…{direccion.slice(-6)}
          </p>
        </div>
      </div>

      {/* Error principal */}
      {errorPrincipal && (
        <div role="alert" style={{ color: "var(--error, #DC2626)", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.18)", borderRadius: "var(--radius-sm)", padding: "12px 16px", fontSize: "0.86rem", marginBottom: 20 }}>
          {errorPrincipal}
        </div>
      )}

      {/* 3 Metric Cards */}
      <div style={estilos.metricsRow}>
        <MetricCard
          icon={<IconCapital />}
          label={t("cuenta.totalInvested")}
          value={resumenListo ? stroopsAMXNe(totalInvertido) : "—"}
          accent="var(--navy)"
        />
        <MetricCard
          icon={<IconRendimiento />}
          label={t("cuenta.yieldAccumulated")}
          value={resumenListo ? stroopsAMXNe(totalYield) : "—"}
          accent="var(--green)"
        />
        <MetricCard
          icon={<IconProyectos />}
          label={t("cuenta.projectsSupported")}
          value={resumenListo ? numApoyados : "—"}
          accent="var(--navy)"
        />
      </div>

      {/* Notificaciones */}
      <NotificacionesPanel direccion={direccion} />

      {/* Tabs */}
      <div className="cuenta-tabs-row" style={estilos.tabsRow} role="tablist" aria-label={t("cuenta.ariaSections")}>
        <button
          role="tab"
          aria-selected={tab === "proyectos"}
          aria-controls="panel-proyectos"
          id="tab-proyectos"
          onClick={() => setTab("proyectos")}
          style={{ ...estilos.tabBtnBase, ...(tab === "proyectos" ? estilos.tabBtnActivo : estilos.tabBtnInactivo) }}
        >
          {t("cuenta.myProjects")}
          {!cargando && numCreados > 0 && (
            <span style={{ ...estilos.tabChip, background: tab === "proyectos" ? "rgba(255,255,255,0.22)" : "var(--navy-dim)", color: tab === "proyectos" ? "#fff" : "var(--navy)" }}>
              {numCreados}
            </span>
          )}
        </button>

        <button
          role="tab"
          aria-selected={tab === "contribuciones"}
          aria-controls="panel-contribuciones"
          id="tab-contribuciones"
          onClick={() => setTab("contribuciones")}
          style={{ ...estilos.tabBtnBase, ...(tab === "contribuciones" ? estilos.tabBtnActivo : estilos.tabBtnInactivo) }}
        >
          {t("cuenta.myContributions")}
          {resumenListo && numApoyados > 0 && (
            <span style={{ ...estilos.tabChip, background: tab === "contribuciones" ? "rgba(255,255,255,0.22)" : "var(--navy-dim)", color: tab === "contribuciones" ? "#fff" : "var(--navy)" }}>
              {numApoyados}
            </span>
          )}
        </button>
      </div>

      {/* Paneles */}
      {cargando ? (
        <div role="status" aria-live="polite" aria-label={t("cuenta.loading")} style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div style={estilos.metricsRow}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ ...estilos.metricCard, borderTop: '3px solid var(--border)' }}>
                <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 4, marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 22, width: '40%' }} />
              </div>
            ))}
          </div>
          <div className="cuenta-tabs-row" style={{ ...estilos.tabsRow, borderBottom: '2px solid var(--border)', marginBottom: 24, gap: 4 }}>
            <div className="skeleton" style={{ height: 38, width: 130, borderRadius: '6px 6px 0 0' }} />
            <div className="skeleton" style={{ height: 38, width: 150, borderRadius: '6px 6px 0 0' }} />
          </div>
          <SkeletonTableRows count={4} />
        </div>
      ) : (
        <>
          <div
            role="tabpanel"
            id="panel-proyectos"
            aria-labelledby="tab-proyectos"
            hidden={tab !== "proyectos"}
          >
            {tab === "proyectos" && (
              <TabMisProyectos
                proyectos={proyectos}
                direccion={direccion}
                onVerProyecto={onVerProyecto}
              />
            )}
          </div>

          <div
            role="tabpanel"
            id="panel-contribuciones"
            aria-labelledby="tab-contribuciones"
            hidden={tab !== "contribuciones"}
          >
            {tab === "contribuciones" && (
              <TabMisContribuciones
                proyectos={proyectos}
                direccion={direccion}
                onVerProyecto={onVerProyecto}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const estilos = {
  contenedor: {
    maxWidth: "1140px",
    margin: "0 auto",
    padding: "40px 24px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  titulo: {
    fontSize: "1.75rem",
    fontWeight: 800,
    color: "var(--navy)",
    letterSpacing: "-0.02em",
  },

  // Metric cards
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 28,
  },
  metricCard: {
    background: "var(--card)",
    border: "1.5px solid var(--border)",
    borderTop: "3px solid var(--navy)",
    borderRadius: "var(--radius)",
    padding: "20px 22px",
    boxShadow: "var(--shadow-sm)",
  },
  metricIcon: {
    marginBottom: 10,
  },
  metricLabel: {
    fontSize: "0.7rem",
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    fontWeight: 700,
    marginBottom: 6,
  },
  metricValue: {
    fontSize: "1.35rem",
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
  },

  // Notification panel
  notiPanel: {
    background: "var(--card)",
    border: "1.5px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "20px 24px",
    marginBottom: 28,
    boxShadow: "var(--shadow-sm)",
  },

  // Tabs
  tabsRow: {
    display: "flex",
    gap: 4,
    marginBottom: 24,
    borderBottom: "2px solid var(--border)",
    paddingBottom: 0,
  },
  tabBtnBase: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 18px",
    borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
    fontWeight: 700,
    fontSize: "0.88rem",
    cursor: "pointer",
    border: "none",
    borderBottom: "2.5px solid transparent",
    transition: "all 0.15s",
    marginBottom: -2,
  },
  tabBtnActivo: {
    background: "var(--navy)",
    color: "#fff",
    borderBottomColor: "var(--navy)",
  },
  tabBtnInactivo: {
    background: "transparent",
    color: "var(--muted)",
    borderBottomColor: "transparent",
  },
  tabChip: {
    borderRadius: "99px",
    padding: "1px 7px",
    fontSize: "0.70rem",
    fontWeight: 700,
  },

  // Grid de cards (proyectos)
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))",
    gap: 20,
  },

  // Card individual
  card: {
    display: "flex",
    flexDirection: "column",
    cursor: "default",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 4,
  },
  cardTitulo: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "var(--text)",
    lineHeight: 1.3,
    flex: 1,
  },
  statsRow: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1.5px solid var(--border)",
  },
  statLabel: {
    fontSize: "0.70rem",
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 700,
    marginBottom: 3,
  },
  statValor: {
    fontSize: "0.84rem",
    color: "var(--text2)",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
  },

  // Contributions table
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.88rem",
  },
  th: {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: "0.70rem",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    fontWeight: 700,
    color: "var(--muted)",
    borderBottom: "2px solid var(--border)",
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "12px 14px",
    color: "var(--text2)",
    verticalAlign: "middle",
  },

  // Estado vacío
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "80px 0",
    textAlign: "center",
  },

  // Carga
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "80px 0",
  },
  spinner: {
    width: 36,
    height: 36,
    border: "3px solid var(--navy-dim)",
    borderTopColor: "var(--navy)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};
