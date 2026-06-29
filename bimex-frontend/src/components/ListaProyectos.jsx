import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { obtenerTodosLosProyectos, stroopsAMXNe } from "../stellar/contrato";
import { parsearError } from "../utils/errores.js";
import { getStorage } from "../utils/storage.js";

const ESTADOS_OCULTOS = new Set(["EnRevision", "Rechazado"]);
const CACHE_KEY_LISTA = "bimex.cache.proyectos";
const CACHE_KEY_LISTA_TS = "bimex.cache.proyectos.ts";
const storageLocal = getStorage("local");

function serializarProyecto(proyecto) {
  return {
    ...proyecto,
    meta: proyecto.meta?.toString?.() ?? "0",
    aportado: proyecto.aportado?.toString?.() ?? "0",
    yield_entregado: proyecto.yield_entregado?.toString?.() ?? "0",
    capital_en_cetes: proyecto.capital_en_cetes?.toString?.() ?? "0",
    capital_en_amm: proyecto.capital_en_amm?.toString?.() ?? "0",
    yield_cetes_acumulado: proyecto.yield_cetes_acumulado?.toString?.() ?? "0",
    yield_amm_acumulado: proyecto.yield_amm_acumulado?.toString?.() ?? "0",
  };
}

function hidratarProyecto(proyecto) {
  return {
    ...proyecto,
    meta: BigInt(proyecto.meta ?? 0),
    aportado: BigInt(proyecto.aportado ?? 0),
    yield_entregado: BigInt(proyecto.yield_entregado ?? 0),
    capital_en_cetes: BigInt(proyecto.capital_en_cetes ?? 0),
    capital_en_amm: BigInt(proyecto.capital_en_amm ?? 0),
    yield_cetes_acumulado: BigInt(proyecto.yield_cetes_acumulado ?? 0),
    yield_amm_acumulado: BigInt(proyecto.yield_amm_acumulado ?? 0),
  };
}

function guardarCacheProyectos(proyectos) {
  try {
    storageLocal.setItem(CACHE_KEY_LISTA, JSON.stringify(proyectos.map(serializarProyecto)));
    storageLocal.setItem(CACHE_KEY_LISTA_TS, String(Date.now()));
  } catch {
    // no-op
  }
}

function leerCacheProyectos() {
  try {
    const raw = storageLocal.getItem(CACHE_KEY_LISTA);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(hidratarProyecto);
  } catch {
    return [];
  }
}

function leerCacheTimestamp() {
  const raw = storageLocal.getItem(CACHE_KEY_LISTA_TS);
  const value = Number(raw ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default function ListaProyectos({ onCrear, refrescar }) {
  const { t, i18n } = useTranslation();
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("Todos");
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [visibles, setVisibles] = useState(12);
  const [errorCarga, setErrorCarga] = useState(null);
  const [usandoCacheOffline, setUsandoCacheOffline] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState(null);
  const cargandoRef = useRef(false);

  const FILTROS = [
    { key: "Todos",        label: t("filters.all"),        dot: null            },
    { key: "EtapaInicial", label: t("filters.initial"),    dot: "var(--muted)"  },
    { key: "EnProgreso",   label: t("filters.inProgress"), dot: "var(--green)"  },
    { key: "Liberado",     label: t("filters.released"),   dot: "var(--amber)"  },
    { key: "Abandonado",   label: t("filters.abandoned"),  dot: "var(--error)"  },
  ];

  const cargar = useCallback(async () => {
    if (cargandoRef.current) return;
    cargandoRef.current = true;
    setCargando(true);
    setErrorCarga(null);
    try {
      const data = await obtenerTodosLosProyectos({ propagarError: true });
      setProyectos(data);
      setUsandoCacheOffline(false);
      setCacheTimestamp(null);
      guardarCacheProyectos(data);
    } catch (e) {
      const cache = leerCacheProyectos();
      if (cache.length > 0) {
        setProyectos(cache);
        setUsandoCacheOffline(true);
        setCacheTimestamp(leerCacheTimestamp());
      } else {
        setErrorCarga(parsearError(e));
      }
    } finally {
      setCargando(false);
      cargandoRef.current = false;
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar(); }, [cargar, refrescar]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setVisibles(12); }, [filtro]);
  useEffect(() => {
    const timer = setTimeout(() => setBusquedaDebounced(textoBusqueda), 300);
    return () => clearTimeout(timer);
  }, [textoBusqueda]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setVisibles(12); }, [busquedaDebounced]);

  useEffect(() => {
    const url = import.meta.env.VITE_INDEXER_URL;
    if (!url) return;
    const es = new EventSource(`${url}/sse`);
    const recargar = () => cargar();
    es.addEventListener('proyecto_actualizado', recargar);
    es.addEventListener('nueva_contribucion', recargar);
    es.addEventListener('yield_reclamado', recargar);
    es.onerror = () => es.close();
    return () => es.close();
  }, [cargar]);

  const proyectosPublicos = useMemo(
    () => proyectos.filter(p => !ESTADOS_OCULTOS.has(p.estado)),
    [proyectos]
  );
  const totalBloqueado = proyectosPublicos.reduce((s, p) => {
    try { return s + BigInt(p.aportado ?? 0); } catch { return s; }
  }, BigInt(0));
  const enProgreso = proyectosPublicos.filter(p => p.estado === "EnProgreso").length;
  const liberados  = proyectosPublicos.filter(p => p.estado === "Liberado").length;

  const busquedaNormalizada = busquedaDebounced.trim().toLowerCase();
  const hayBusqueda = busquedaNormalizada.length > 0;
  const proyectosFiltrados = useMemo(() => {
    const porEstado = filtro === "Todos"
      ? proyectosPublicos
      : proyectosPublicos.filter(p => p.estado === filtro);

    if (!busquedaNormalizada) return porEstado;

    return porEstado.filter(p => {
      const nombre = String(p.nombre ?? "").toLowerCase();
      const descripcion = String(p.descripcion ?? "").toLowerCase();
      return nombre.includes(busquedaNormalizada) || descripcion.includes(busquedaNormalizada);
    });
  }, [busquedaNormalizada, filtro, proyectosPublicos]);

  const cacheUltimaActualizacion = useMemo(() => {
    if (!cacheTimestamp) return null;
    try {
      return new Intl.DateTimeFormat(i18n.language === "es" ? "es-MX" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(cacheTimestamp);
    } catch {
      return null;
    }
  }, [cacheTimestamp, i18n.language]);

  const limpiarBusqueda = useCallback(() => {
    setTextoBusqueda("");
  }, []);

  const cargarMas = useCallback(() => {
    setVisibles((valorActual) => valorActual + 12);
  }, []);

  return (
    <div className="lista-contenedor" style={estilos.contenedor}>

      {/* Header */}
      <div className="lista-header" style={estilos.header}>
        <div>
          <h2 style={estilos.titulo}>{t("lista.title")}</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 4 }}>
            {t("lista.subtitle")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={cargar}
            style={{ padding: "9px 14px" }}
            title={t("lista.reload")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button className="btn btn-primary" onClick={onCrear}>{t("lista.create")}</button>
        </div>
      </div>

      {/* Stats strip */}
      {proyectosPublicos.length > 0 && (
        <div className="stats-strip-scroll lista-stats-strip" style={estilos.statsStrip}>
          <StatStrip label={t("lista.statTotal")} valor={proyectosPublicos.length} />
          <div style={estilos.statsDivider} />
          <StatStrip label={t("lista.statProgress")} valor={enProgreso} highlight />
          <div style={estilos.statsDivider} />
          <StatStrip label={t("lista.statReleased")} valor={liberados} />
          <div style={estilos.statsDivider} />
          <StatStrip label={t("lista.statLocked")} valor={stroopsAMXNe(totalBloqueado)} mono />
        </div>
      )}

      {/* Banner explicativo */}
      <div style={estilos.banner}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--navy)", flexShrink: 0, marginTop: 2 }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style={{ fontSize: "0.86rem", color: "var(--muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text2)" }}>{t("lista.howTitle")}</strong>{" "}
          {t("lista.howDesc")}
        </p>
      </div>

      {usandoCacheOffline && (
        <div role="status" aria-live="polite" style={estilos.offlineBanner}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M2 12.5A16 16 0 0 1 22 12"/>
              <path d="M5 16.5a11 11 0 0 1 14 .2"/>
              <path d="M8.5 20a6 6 0 0 1 7 0"/>
              <line x1="2" y1="2" x2="22" y2="22"/>
            </svg>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.82rem", color: "#92400E" }}>
                {t("lista.offlineTitle")}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#9A3412", lineHeight: 1.5 }}>
                {t("lista.offlineDesc")}
                {cacheUltimaActualizacion ? ` ${t("lista.offlineUpdated", { timestamp: cacheUltimaActualizacion })}` : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="filtros-row" style={estilos.filtrosRow}>
          <div style={estilos.busquedaContainer}>
            <input
              type="search"
              className="input"
              placeholder={t("lista.buscar")}
              aria-label={t("lista.buscar")}
              value={textoBusqueda}
              onChange={(e) => setTextoBusqueda(e.target.value)}
              style={estilos.busquedaInput}
            />
            {textoBusqueda && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={limpiarBusqueda}
                aria-label={t("lista.limpiarBusqueda")}
                style={estilos.busquedaClear}
              >
                ×
              </button>
            )}
          </div>
          {FILTROS.map(f => {
            const activo = filtro === f.key;
            const count = f.key === "Todos"
              ? proyectosPublicos.length
              : proyectosPublicos.filter(p => p.estado === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                aria-pressed={activo}
                style={{
                  ...estilos.filtroBtnBase,
                  background: activo ? "var(--navy)" : "var(--card)",
                  color: activo ? "#fff" : "var(--text2)",
                  border: `1px solid ${activo ? "var(--navy)" : "var(--border2)"}`,
                }}
              >
                {/* dot de estado */}
                {f.dot && (
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: activo ? "rgba(255,255,255,0.8)" : f.dot,
                    flexShrink: 0,
                  }} />
                )}
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

      {/* Error de carga */}
      {errorCarga && (
        <div className="error-mensaje" role="alert" style={{ color: "var(--error, #DC2626)", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.18)", borderRadius: "var(--radius-sm)", padding: "12px 16px", fontSize: "0.86rem", marginBottom: 20 }}>
          {errorCarga}
        </div>
      )}

      {/* Grid / estados */}
      {cargando ? (
        <div className="grid-proyectos" style={estilos.grid} role="status" aria-live="polite" aria-label={t("lista.loading")}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : proyectos.length === 0 ? (
        <div style={estilos.empty}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--border2)" }}>
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
          <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginTop: 16 }}>
            {t("lista.empty")}
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>
            {t("lista.emptyHint")}
          </p>
          <button className="btn btn-primary" onClick={onCrear} style={{ marginTop: 20 }}>
            {t("lista.create")}
          </button>
        </div>
      ) : proyectosFiltrados.length === 0 ? (
        <div style={estilos.empty}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--border2)" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginTop: 16 }}>
            {hayBusqueda ? t("lista.noSearchResults", { term: busquedaDebounced.trim() }) : t("lista.noResults")}
          </p>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setFiltro("Todos");
              setTextoBusqueda("");
            }}
            style={{ marginTop: 16 }}
          >
            {t("lista.viewAll")}
          </button>
        </div>
      ) : (
        <>
          <div className="grid-proyectos" style={estilos.grid} role="list" aria-label={t("lista.ariaList")}>
            {proyectosFiltrados.slice(0, visibles).map((p) => (
              <CardProyecto key={p.id} proyecto={p} />
            ))}
          </div>
          {proyectosFiltrados.length > visibles && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
              <button
                className="btn btn-ghost"
                onClick={cargarMas}
              >
                {t("lista.loadMore")} ({proyectosFiltrados.length - visibles} {t("lista.remaining")})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Skeleton card ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <article className="card" aria-hidden="true" style={{ ...estilos.card, pointerEvents: 'none', userSelect: 'none' }}>
      <div style={estilos.cardTop}>
        <div className="skeleton" style={{ height: 22, width: 90, borderRadius: 99 }} />
      </div>
      <div className="skeleton" style={{ height: 20, width: '70%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 18 }} />
      <div className="skeleton" style={{ height: 8, borderRadius: 4, marginBottom: 8 }} />
      <div style={estilos.statsRow}>
        <div className="skeleton" style={{ height: 14, width: 70 }} />
        <div className="skeleton" style={{ height: 14, width: 70 }} />
      </div>
      <div className="skeleton" style={{ height: 36, marginTop: 16, borderRadius: 6 }} />
    </article>
  );
}

// ── Stat strip item ──────────────────────────────────────────────────────────
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

// ── Config de estado ─────────────────────────────────────────────────────────
const ESTADO_CFG = {
  EtapaInicial: { badge: "badge-muted",  btnLabelKey: "card.contributeBtn", btnClass: "btn-secondary" },
  EnProgreso:   { badge: "badge-teal",   btnLabelKey: "card.contributeBtn", btnClass: "btn-secondary" },
  Liberado:     { badge: "badge-amber",  btnLabelKey: "card.detailBtn",     btnClass: "btn-secondary" },
  Abandonado:   { badge: "badge-red",    btnLabelKey: "card.takeControlBtn",btnClass: "btn-ghost"     },
};

// ── Card ─────────────────────────────────────────────────────────────────────
const CardProyecto = memo(function CardProyecto({ proyecto }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const meta     = Number(proyecto.meta);
  const aportado = Number(proyecto.aportado);
  const pct      = meta > 0 ? Math.min((aportado / meta) * 100, 100) : 0;
  const estado   = proyecto.estado ?? "EtapaInicial";
  const cfg      = ESTADO_CFG[estado] ?? ESTADO_CFG.EtapaInicial;
  const btnLabel = t(cfg.btnLabelKey);

  return (
    <article
      className="card"
      role="listitem"
      style={{ ...estilos.card, opacity: estado === "Abandonado" ? 0.75 : 1 }}
      onClick={() => navigate(`/proyectos/${proyecto.id}`)}
      aria-label={`${proyecto.nombre}, ${t(`status.${estado}`)}, ${pct.toFixed(0)}%`}
    >
      {/* Estado + verificado */}
      <div style={estilos.cardTop}>
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
            Verificado
          </span>
        )}
      </div>

      {/* Nombre + dueño */}
      <h3 style={estilos.nombre}>{proyecto.nombre}</h3>
      <p style={{ fontSize: "0.75rem", color: "var(--subtle)", fontFamily: "'SFMono-Regular','Consolas',monospace", marginBottom: 0 }}>
        {proyecto.dueno.slice(0, 6)}...{proyecto.dueno.slice(-4)}
      </p>

      {/* Progreso */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
            {t("lista.funding")}
          </span>
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

      {/* Stats */}
      <div style={estilos.statsRow}>
        <StatItem label={t("lista.locked")} valor={stroopsAMXNe(proyecto.aportado)} />
        <StatItem label={t("lista.goal")}   valor={stroopsAMXNe(proyecto.meta)}     muted />
      </div>

      {/* CTA */}
      <button
        className={`btn ${cfg.btnClass}`}
        style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
        onClick={(e) => { e.stopPropagation(); navigate(`/proyectos/${proyecto.id}`); }}
        aria-label={`${btnLabel} ${proyecto.nombre}`}
      >
        {btnLabel}
      </button>
    </article>
  );
});

function StatItem({ label, valor, muted }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "0.7rem", color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'SFMono-Regular','Consolas',monospace", fontSize: "0.82rem", color: muted ? "var(--muted)" : "var(--text2)", marginTop: 3, fontWeight: 600 }}>{valor}</div>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const estilos = {
  contenedor:    { maxWidth: "1140px", margin: "0 auto", padding: "40px 24px" },
  header:        { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  titulo:        { fontSize: "1.5rem", fontWeight: 700, color: "var(--text)" },
  statsStrip:    { display: "flex", alignItems: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px 24px", marginBottom: 20, boxShadow: "var(--shadow-sm)" },
  statsDivider:  { width: 1, height: 28, background: "var(--border)", flexShrink: 0 },
  banner:        { display: "flex", alignItems: "flex-start", gap: 12, background: "var(--navy-dim)", border: "1px solid rgba(30,58,95,0.12)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 24 },
  offlineBanner: { background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(217,119,6,0.28)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 20, color: "#92400E" },
  grid:          { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))", gap: 16 },
  card:          { cursor: "pointer", display: "flex", flexDirection: "column" },
  cardTop:       { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  nombre:        { fontSize: "0.98rem", fontWeight: 600, marginBottom: 4, lineHeight: 1.4, color: "var(--text)" },
  statsRow:      { display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" },
  loading:       { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 0" },
  spinner:       { width: 32, height: 32, border: "2px solid var(--border)", borderTopColor: "var(--navy)", borderRadius: "50%", animation: "spin 0.7s linear infinite" },
  empty:         { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 0", textAlign: "center" },
  filtrosRow:    { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 },
  filtroBtnBase: { padding: "6px 14px", borderRadius: "var(--radius-sm)", fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: "0.82rem", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4 },
  busquedaContainer: { display: "flex", alignItems: "center", gap: 8, width: "100%", marginBottom: 6 },
  busquedaInput: { maxWidth: 360 },
  busquedaClear: { padding: "8px 12px", lineHeight: 1, fontSize: "1rem" },
};
