import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { crearThrottle } from "../utils/throttle.js";
import { parsearError } from "../utils/errores.js";
import { QRCodeSVG } from "qrcode.react";
import {
  contribuir as contribuirContrato,
  retirarPrincipal as retirarPrincipalContrato,
  retiroAnticipado as retiroAnticipadoContrato,
  reclamarYield as reclamarYieldContrato,
  abandonarProyecto as abandonarProyectoContrato,
  solicitarContinuar as solicitarContinuarContrato,
  obtenerAportacion,
  calcularYield,
  obtenerProyecto,
  obtenerBalanceMXNe,
  mxneAStroops,
  stroopsAMXNe,
  CONFIG,
} from "../stellar/contrato";
import { aplicarMeta, crearMetaProyecto, DEFAULT_META } from "../utils/metaTags.js";
import { calcProyeccion, TASAS } from "../utils/rendimiento.js";
import { parsearDocHash } from "../utils/ipfs.js";
import SelloVerificado from "./SelloVerificado.jsx";

function calcMonthlyProjectLoss(aportacionStroops, modo = "inversor") {
  const mxne = Number(stroopsAMXNe(aportacionStroops)) || 0;
  const modoKey = String(modo ?? "inversor").toLowerCase();
  const tasa = (TASAS[modoKey] ?? TASAS.inversor).proyecto;
  const perdidaMensual = (mxne * tasa) / 12;
  return perdidaMensual.toFixed(2);
}

const RAMP_URL = import.meta.env.VITE_ETHERFUSE_RAMP_URL || "https://app.etherfuse.com/ramp";
const MIN_MXNE_THRESHOLD = BigInt(1_000_000_000); // 100 MXNe in Stroops

const ESTADO_CONFIG = {
  EtapaInicial: { labelKey: "status.EtapaInicial", clase: "badge-muted" },
  EnProgreso:   { labelKey: "status.EnProgreso",   clase: "badge-teal" },
  Abandonado:   { labelKey: "status.Abandonado",   clase: "badge-red" },
  Liberado:     { labelKey: "status.Liberado",     clase: "badge-amber" },
};

function estimarYieldDueno(proyecto) {
  if (!proyecto?.timestamp_inicio || !proyecto?.aportado) return BigInt(0);
  const ahora = Math.floor(Date.now() / 1000);
  const segundos = Math.max(0, ahora - proyecto.timestamp_inicio);
  const minutos = BigInt(Math.floor(segundos / 60));
  const cetesCap = BigInt(proyecto.capital_en_cetes ?? 0);
  const ammCap   = BigInt(proyecto.capital_en_amm   ?? 0);
  const cetesBps = BigInt(CONFIG.YIELD_CETES_BPS);
  const ammBps   = BigInt(CONFIG.YIELD_AMM_BPS);
  const MINUTOS_ANO = BigInt(525_600);
  const yieldCetes = (cetesCap * cetesBps * minutos) / BigInt(10_000) / MINUTOS_ANO;
  const yieldAmm   = (ammCap   * ammBps   * minutos) / BigInt(10_000) / MINUTOS_ANO;
  return yieldCetes + yieldAmm;
}

function fmt(n) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// SVG icons
const IconArrowLeft = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);
const IconFile = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// ── Skeleton components ───────────────────────────────────────────────────────
function SkeletonDetailLeft() {
  return (
    <div className="detail-main" aria-hidden="true" style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <div className="detail-header">
        <div className="skeleton" style={{ height: 22, width: 100, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 28, width: '65%' }} />
      </div>
      <div className="detail-section" style={{ marginTop: 28 }}>
        <div className="skeleton" style={{ height: 14, width: 120, marginBottom: 14 }} />
        <div className="info-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="info-cell" style={{ background: 'var(--card)' }}>
              <div className="skeleton" style={{ height: 12, width: '50%', marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 18, width: '40%' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonInvestPanel() {
  return (
    <div className="invest-panel" aria-hidden="true" style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <div className="invest-panel-head">
        <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 8, background: 'linear-gradient(90deg, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.08) 75%)', backgroundSize: '200% 100%' }} />
        <div className="skeleton" style={{ height: 18, width: '60%', background: 'linear-gradient(90deg, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.08) 75%)', backgroundSize: '200% 100%' }} />
      </div>
      <div className="invest-body">
        <div className="skeleton" style={{ height: 14, width: '30%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 6, borderRadius: 99, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 40, borderRadius: 6, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 40, borderRadius: 6, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 44, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export default function DetalleProyecto({ direccion, onCerrar, onError, onToast }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const montadoRef = useRef(true);
  useEffect(() => () => { montadoRef.current = false; }, []);

  // Redirect invalid route params like /proyectos/abc to the project list.
  useEffect(() => {
    if (id === undefined || id === null || id === "") return;
    const proyectoIdNum = Number(id);
    if (!Number.isFinite(proyectoIdNum)) {
      navigate("/proyectos", { replace: true });
    }
  }, [id, navigate]);

  const proyectoId = Number(id);
  const proyectoBase = {
    id: proyectoId,
    nombre: "",
    estado: "EtapaInicial",
    dueno: "",
    aportado: 0n,
    meta: 0n,
    yield_entregado: 0n,
    capital_en_cetes: 0n,
    capital_en_amm: 0n,
    yield_cetes_acumulado: 0n,
    yield_amm_acumulado: 0n,
    timestamp_inicio: 0,
    timestamp_vencimiento: 0,
    tiempo_meses: 0,
    doc_hash: "",
    motivo_rechazo: "",
  };
  const [proyecto,          setProyecto]          = useState(proyectoBase);
  const [cantidad,          setCantidad]          = useState("");
  const [cargando,          setCargando]          = useState(false);
  const [cargandoInicial,   setCargandoInicial]   = useState(true);
  const [modoInversion,     setModoInversion]     = useState("inversor");
  const [vistaRetirar,      setVistaRetirar]      = useState(false);
  const [confirmarAbandonar,setConfirmarAbandonar]= useState(false);
  const [mostrarQR,         setMostrarQR]         = useState(false);
  const [toastVisible,      setToastVisible]      = useState(false);
  const [miAportacion,      setMiAportacion]      = useState(BigInt(0));
  const [miYield,           setMiYield]           = useState(BigInt(0));
  const [balanceMXNe,       setBalanceMXNe]       = useState(null);

  const throttleContribuir = useRef(crearThrottle(3000)).current;
  const throttleRetirar    = useRef(crearThrottle(3000)).current;
  const throttleReclamar   = useRef(crearThrottle(3000)).current;
  const throttleAbandonar  = useRef(crearThrottle(5000)).current;

  const estado    = proyecto.estado ?? "EtapaInicial";
  const estadoCfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG.EtapaInicial;
  const esDueno      = direccion === proyecto.dueno;
  const esAbandonado = estado === "Abandonado";
  const aceptaFondos = estado === "EtapaInicial" || estado === "EnProgreso";

  // eslint-disable-next-line react-hooks/purity
  const ahora = useMemo(() => Math.floor(Date.now() / 1000), []);
  const tsVencimiento = proyecto.timestamp_vencimiento ?? 0;
  const plazoVencido  = tsVencimiento > 0 && ahora >= tsVencimiento;
  const fechaVencimiento = tsVencimiento > 0
    ? new Date(tsVencimiento * 1000).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" })
    : null;
  const urlProyecto = window.location.href;

  const aportado   = Number(proyecto.aportado ?? 0);
  const meta       = Number(proyecto.meta ?? 0);
  const porcentaje = meta > 0 ? Math.min((aportado / meta) * 100, 100) : 0;
  const faltante   = Math.max(0, meta - aportado);
  const faltanteMXNe = stroopsAMXNe(BigInt(faltante));

  const yieldDueno = useMemo(() => (
    esDueno
      ? estimarYieldDueno(proyecto)
      : BigInt(0)
  ), [esDueno, proyecto.aportado, proyecto.capital_en_cetes, proyecto.capital_en_amm, proyecto.timestamp_inicio]);

  // Documentos IPFS: "CID1|CID2|CID3" → { cids, fallbackHash, esFallback }
  const docInfo = useMemo(() => parsearDocHash(proyecto.doc_hash), [proyecto.doc_hash]);

  useEffect(() => {
    if (!proyecto?.id) return () => aplicarMeta(DEFAULT_META);
    aplicarMeta(crearMetaProyecto(proyecto));
    return () => aplicarMeta(DEFAULT_META);
  }, [proyecto]);

  const refrescar = useCallback(async () => {
    if (!Number.isFinite(proyectoId)) {
      setCargandoInicial(false);
      return;
    }
    try {
      const proyActualizado = await obtenerProyecto(proyectoId).catch(() => null);
      const [aport, yld, bal] = direccion
        ? await Promise.all([
            obtenerAportacion(proyectoId, direccion).catch(() => BigInt(0)),
            calcularYield(proyectoId, direccion).catch(() => BigInt(0)),
            obtenerBalanceMXNe(direccion).catch(() => null),
          ])
        : [BigInt(0), BigInt(0), null];
      if (!montadoRef.current) return;
      if (!proyActualizado) {
        onError?.(new Error(t("detalle.errContract")));
        return;
      }
      setProyecto(proyActualizado);
      setMiAportacion(aport);
      setMiYield(yld);
      setBalanceMXNe(bal);
    } catch (e) {
      if (montadoRef.current) {
        onError?.(parsearError(e));
        onCerrar?.();
      }
    } finally {
      setCargandoInicial(false);
    }
  }, [proyectoId, direccion, onError, onCerrar, t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refrescar(); }, [refrescar]);

  // Escape → volver
  useEffect(() => {
    if (mostrarQR) return;
    function onKey(e) {
      if (e.key === "Escape") {
        if (onCerrar) onCerrar();
        else navigate("/proyectos");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar, navigate, mostrarQR]);

  useEffect(() => {
    if (!mostrarQR) return;
    const handler = (e) => { if (e.key === "Escape") setMostrarQR(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mostrarQR]);

  function mostrarToast() {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }

  function handleCantidadChange(e) {
    const raw = e.target.value;
    if (/[eE+-]/.test(raw)) return;
    setCantidad(raw);
  }

  const cantidadNum    = Number(cantidad);
  const cantidadValida = cantidad !== "" && !isNaN(cantidadNum) && cantidadNum > 0;
  const necesitaMXNe   = BigInt(balanceMXNe ?? 0) < MIN_MXNE_THRESHOLD;
  const superaBalance  = cantidadValida && balanceMXNe !== null && mxneAStroops(cantidadNum) > balanceMXNe;
  const errorCantidad  = !cantidadValida && cantidad !== ""
    ? t("detalle.errAmount")
    : superaBalance
    ? t("detalle.errBalance", { balance: stroopsAMXNe(balanceMXNe) })
    : null;

  const proyeccion = useMemo(() => calcProyeccion(cantidadNum, 12, modoInversion), [cantidadNum, modoInversion]);

  const manejarContribuir = useCallback(async () => {
    if (!direccion || !cantidadValida || superaBalance) return;
    try {
      await throttleContribuir.ejecutar(async () => {
        setCargando(true);
        await contribuirContrato(direccion, proyecto.id, mxneAStroops(Number(cantidad)));
        onToast?.(t("detalle.toastContributed", { amount: cantidad }));
        setCantidad("");
        await refrescar();
      });
    } catch (err) {
      if (String(err?.message ?? "").toLowerCase().includes("espera")) {
        onToast?.(err.message, "info");
      } else {
        onError?.(err);
      }
    }
    setCargando(false);
  }, [balanceMXNe, cantidad, direccion, onError, onToast, proyecto.id, refrescar, t, throttleContribuir]);

  const manejarRetirar = useCallback(async () => {
    if (!direccion) return;
    try {
      await throttleRetirar.ejecutar(async () => {
        setCargando(true);
        await retirarPrincipalContrato(direccion, proyecto.id);
        onToast?.(t("detalle.toastWithdrawn", { amount: stroopsAMXNe(miAportacion) }));
        setMiAportacion(BigInt(0));
        setMiYield(BigInt(0));
        setVistaRetirar(false);
        await refrescar();
      });
    } catch (err) {
      if (String(err?.message ?? "").toLowerCase().includes("espera")) {
        onToast?.(err.message, "info");
      } else {
        onError?.(err);
      }
    }
    setCargando(false);
  }, [direccion, miAportacion, onError, onToast, proyecto.id, refrescar, t, throttleRetirar]);

  const manejarReclamarYield = useCallback(async () => {
    if (!direccion) return;
    if (estado !== "Liberado") { onError?.(t("detalle.errYieldOnly")); return; }
    if (miYield === BigInt(0)) { onError?.(t("detalle.errNoYield")); return; }
    try {
      await throttleReclamar.ejecutar(async () => {
        setCargando(true);
        await reclamarYieldContrato(direccion, proyecto.id);
        onToast?.(t("detalle.toastYield"));
        await refrescar();
      });
    } catch (err) {
      if (String(err?.message ?? "").toLowerCase().includes("espera")) {
        onToast?.(err.message, "info");
      } else {
        onError?.(err);
      }
    }
    setCargando(false);
  }, [direccion, estado, miYield, onError, onToast, proyecto.id, refrescar, t, throttleReclamar]);

  const manejarAbandonar = useCallback(async () => {
    if (!direccion) return;
    setConfirmarAbandonar(false);
    try {
      await throttleAbandonar.ejecutar(async () => {
        setCargando(true);
        await abandonarProyectoContrato(direccion, proyecto.id);
        onToast?.(t("detalle.toastAbandoned"));
        await refrescar();
      });
    } catch (err) {
      if (String(err?.message ?? "").toLowerCase().includes("espera")) {
        onToast?.(err.message, "info");
      } else {
        onError?.(err);
      }
    }
    setCargando(false);
  }, [direccion, onError, onToast, proyecto.id, refrescar, t, throttleAbandonar]);

  const manejarRetiroAnticipado = useCallback(async () => {
    if (!direccion) return;
    try {
      await throttleRetirar.ejecutar(async () => {
        setCargando(true);
        await retiroAnticipadoContrato(direccion, proyecto.id);
        onToast?.(t("detalle.toastWithdrawn", { amount: stroopsAMXNe(miAportacion) }));
        setMiAportacion(BigInt(0));
        setMiYield(BigInt(0));
        setVistaRetirar(false);
        await refrescar();
      });
    } catch (err) {
      if (String(err?.message ?? "").toLowerCase().includes("espera")) {
        onToast?.(err.message, "info");
      } else {
        onError?.(err);
      }
    }
    setCargando(false);
  }, [direccion, miAportacion, onError, onToast, proyecto.id, refrescar, t, throttleRetirar]);

  const manejarSolicitarContinuar = useCallback(async () => {
    if (!direccion) return;
    setCargando(true);
    try {
      await solicitarContinuarContrato(direccion, proyecto.id);
      onToast?.(t("detalle.toastContinued"));
      await refrescar();
    } catch (err) {
      onError?.(err);
    }
    setCargando(false);
  }, [direccion, onError, onToast, proyecto.id, refrescar, t]);

  return (
    <>
      <div className="detail-page">

        {/* Back link */}
        <button className="back-link" onClick={() => navigate("/proyectos")}>
          <IconArrowLeft />
          {t("detalle.backToProjects")}
        </button>

        {/* 2-column grid */}
        <div className="detail-grid">

          {cargandoInicial ? (
            <>
              <SkeletonDetailLeft />
              <SkeletonInvestPanel />
            </>
          ) : (
            <>

          {/* ── LEFT: Project info ── */}
          <div className="detail-main">

            {/* Header */}
            <div className="detail-header">
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <span className={`badge ${estadoCfg.clase}`}>
                  <span className="badge-dot" />
                  {t(estadoCfg.labelKey)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ margin: 0 }}>{proyecto.nombre}</h1>
                  <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: "0.95rem" }}>
                    🔥 {stroopsAMXNe(proyecto.aportado ?? 0)} recaudados · faltan {faltanteMXNe}
                  </p>
                </div>
                <button
                  onClick={() => setMostrarQR(true)}
                  className="btn btn-outline btn-sm"
                  aria-label={t("detalle.compartir.abrir")}
                  type="button"
                  style={{ fontSize: "0.82rem", padding: "8px 14px" }}
                >
                  ↗ {t("detalle.compartir.boton")}
                </button>
              </div>
            </div>

            {/* Banners de estado */}
            {esAbandonado && (
              <div className="detail-banner detail-banner--red">
                <IconShield />
                <span>{t("detalle.abandonedBanner")}</span>
              </div>
            )}
            {estado === "Liberado" && (
              <div className="detail-banner detail-banner--amber">
                <IconShield />
                <span>{t("detalle.releasedBanner")}</span>
              </div>
            )}

            {/* Info grid */}
            <div className="detail-section">
              <h3>{t("detalle.projectInfo")}</h3>
              <div className="info-grid">
                <div className="info-cell">
                  <label>{t("detalle.goal")}</label>
                  <span>{stroopsAMXNe(proyecto.meta ?? 0)}</span>
                </div>
                <div className="info-cell">
                  <label>{t("detalle.raised")}</label>
                  <span className="green">{stroopsAMXNe(proyecto.aportado ?? 0)}</span>
                </div>
                <div className="info-cell">
                  <label>{t("detalle.yieldDelivered")}</label>
                  <span>{stroopsAMXNe(proyecto.yield_entregado ?? 0)}</span>
                </div>
                <div className="info-cell">
                  <label>{t("detalle.owner")}</label>
                  <span style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>
                    {proyecto.dueno ? `${proyecto.dueno.slice(0, 6)}…${proyecto.dueno.slice(-4)}` : "—"}
                  </span>
                </div>
                {esDueno && BigInt(proyecto.aportado ?? 0) > BigInt(0) && (
                  <div className="info-cell" style={{ gridColumn: "1 / -1" }}>
                    <label>{t("detalle.yieldAvailable")}</label>
                    <span className="green" style={{ fontFamily: "monospace", fontSize: "1.1rem" }}>
                      {stroopsAMXNe(yieldDueno)}
                    </span>
                  </div>
                )}
                {fechaVencimiento && (
                  <div className="info-cell" style={{ gridColumn: "1 / -1" }}>
                    <label>{t("detalle.deadline")}</label>
                    <span style={{ fontFamily: "monospace", fontSize: "0.9rem", color: plazoVencido ? "var(--error)" : "var(--text)" }}>
                      {fechaVencimiento}
                      {plazoVencido && <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "var(--error)", fontWeight: 600 }}>{t("detalle.expired")}</span>}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Distribución del rendimiento */}
            <div className="detail-section">
              <h3>{t("detalle.yieldSplit")}</h3>
              <div className="split-table">
                <div className="split-row">
                  <span className="split-name" style={{ color: "var(--green)", fontWeight: 600 }}>{t("detalle.splitProject")}</span>
                  <div className="split-bar-wrap" role="progressbar" aria-valuenow={45} aria-valuemin={0} aria-valuemax={100} aria-valuetext="6.00%"><div className="split-bar" style={{ width: "44.6%", background: "var(--green)" }} /></div>
                  <span className="split-pct" style={{ color: "var(--green)" }}>6.00%</span>
                </div>
                <div className="split-row">
                  <span className="split-name" style={{ color: "var(--navy)", fontWeight: 600 }}>{t("detalle.splitInvestor")}</span>
                  <div className="split-bar-wrap" role="progressbar" aria-valuenow={37} aria-valuemin={0} aria-valuemax={100} aria-valuetext="5.00%"><div className="split-bar" style={{ width: "37.2%", background: "var(--navy)" }} /></div>
                  <span className="split-pct" style={{ color: "var(--navy)" }}>5.00%</span>
                </div>
                <div className="split-row" style={{ background: "var(--bg)" }}>
                  <span className="split-name" style={{ color: "var(--muted)" }}>{t("detalle.splitPlatform")}</span>
                  <div className="split-bar-wrap" role="progressbar" aria-valuenow={18} aria-valuemin={0} aria-valuemax={100} aria-valuetext="2.45%"><div className="split-bar" style={{ width: "18.2%", background: "var(--subtle)" }} /></div>
                  <span className="split-pct" style={{ color: "var(--muted)" }}>2.45%</span>
                </div>
                <div style={{ padding: "12px 18px", background: "var(--bg)", borderTop: "2px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                  <span style={{ color: "var(--muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("detalle.totalYield")}</span>
                  <strong style={{ color: "var(--text)" }}>13.45% {t("detalle.perYear")}</strong>
                </div>
              </div>
            </div>

            {/* Sello de documentación verificada */}
            {(docInfo.cids.length > 0 || docInfo.esFallback) && (
              <div className="detail-section">
                <h3>{t("detalle.verifiedDocs")}</h3>
                <SelloVerificado
                  cids={docInfo.cids}
                  fallbackHash={docInfo.fallbackHash}
                  esFallback={docInfo.esFallback}
                />
              </div>
            )}

            {/* Acciones del dueño (izquierda, secundarias) */}
            {esDueno && aceptaFondos && (
              <div className="detail-section">
                {!confirmarAbandonar ? (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: "0.82rem", color: "var(--muted)" }}
                    onClick={() => setConfirmarAbandonar(true)}
                    disabled={cargando}
                  >
                    {t("detalle.abandon")}
                  </button>
                ) : (
                  <div className="confirm-box confirm-box--red">
                    <p style={{ fontSize: "0.85rem", color: "#B91C1C", fontWeight: 600, marginBottom: 12 }}>
                      {t("detalle.abandonConfirm")}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmarAbandonar(false)}>
                        {t("detalle.cancel")}
                      </button>
                      <button
                        className="btn"
                        style={{ flex: 1, justifyContent: "center", background: "#DC2626", color: "#fff" }}
                        onClick={manejarAbandonar}
                        disabled={cargando}
                      >
                        {cargando ? t("detalle.processing") : t("detalle.confirmAbandon")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Invest panel ── */}
          <div>
            <div className="invest-panel">
              <div className="invest-panel-head">
                <p>{t("detalle.investIn")}</p>
                <h3>{proyecto.nombre}</h3>
              </div>
              <div style={{ margin: "14px 0 10px", color: "var(--muted)", fontSize: "0.95rem", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <span>🔥 Ya se recaudó {stroopsAMXNe(proyecto.aportado ?? 0)}</span>
                <strong style={{ color: "var(--text)", whiteSpace: "nowrap" }}>Faltan {faltanteMXNe}</strong>
              </div>

              <div className="invest-body">

                {/* Barra de progreso */}
                <div className="progress-section">
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                    <span style={{ color: "var(--muted)" }}>{t("detalle.raised")}</span>
                    <span>
                      <strong style={{ color: "var(--text)" }}>{stroopsAMXNe(proyecto.aportado ?? 0)}</strong>
                      {" / "}
                      {stroopsAMXNe(proyecto.meta ?? 0)}
                    </span>
                  </div>
                  <div
                    className="progress-section__bar"
                    role="progressbar"
                    aria-valuenow={Math.round(porcentaje)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuetext={`${porcentaje.toFixed(0)}%`}
                  >
                    <div className="progress-section__fill" style={{ width: `${porcentaje}%` }} />
                  </div>
                  <div className="progress-meta">
                    <span>{porcentaje.toFixed(0)}% {t("detalle.completed")}</span>
                  </div>
                </div>

                {/* Mi posición (si ya contribuí) */}
                {miAportacion > BigInt(0) && (
                  <div className="my-position">
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 10 }}>
                      {t("detalle.myPosition")}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{t("detalle.myCapital")}</div>
                        <div style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--navy)", fontSize: "1rem" }}>
                          {stroopsAMXNe(miAportacion)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{t("detalle.myYield")}</div>
                        <div style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--green)", fontSize: "1rem" }}>
                          +{stroopsAMXNe(miYield)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Forma de contribuir */}
                {aceptaFondos && (
                  <>
                    {necesitaMXNe && (
                      <div className="mxne-ramp-card" role="region" aria-labelledby="mxne-ramp-title">
                        <div className="mxne-ramp-card__eyebrow">{t("detalle.ramp.eyebrow")}</div>
                        <h4 id="mxne-ramp-title" className="mxne-ramp-card__title">
                          {t("detalle.ramp.title")}
                        </h4>
                        <p className="mxne-ramp-card__desc">
                          {t("detalle.ramp.description")}
                        </p>
                        <ol className="mxne-ramp-card__steps" aria-label={t("detalle.ramp.stepsAria")}>
                          <li>{t("detalle.ramp.stepKyc")}</li>
                          <li>{t("detalle.ramp.stepSpei")}</li>
                          <li>{t("detalle.ramp.stepWallet")}</li>
                          <li>{t("detalle.ramp.stepBimex")}</li>
                        </ol>
                        <a
                          className="btn btn-primary mxne-ramp-card__button"
                          href={RAMP_URL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("detalle.ramp.cta")}
                        </a>
                        <p className="mxne-ramp-card__note">
                          {t("detalle.ramp.note")}
                        </p>
                      </div>
                    )}

                    <div style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 8 }}>
                      {t("detalle.mode")}
                    </div>
                    <div className="mode-selector">
                      <button
                        className={`mode-btn${modoInversion === "inversor" ? " active" : ""}`}
                        onClick={() => setModoInversion("inversor")}
                        aria-pressed={modoInversion === "inversor"}
                      >
                        <h4>{t("detalle.modeInversor")}</h4>
                        <p>{t("detalle.modeInversorDesc")}</p>
                      </button>
                      <button
                        className={`mode-btn${modoInversion === "mecenas" ? " active" : ""}`}
                        onClick={() => setModoInversion("mecenas")}
                        aria-pressed={modoInversion === "mecenas"}
                      >
                        <h4>{t("detalle.modeMecenas")}</h4>
                        <p>{t("detalle.modeMecenasDesc")}</p>
                      </button>
                    </div>

                    <div className="input-group">
                      <label>{t("detalle.contributeLabel")}</label>
                      <div className={`input-wrap${errorCantidad ? " input-wrap--error" : ""}`}>
                        <span className="input-prefix">MXNe</span>
                        <input
                          type="number"
                          value={cantidad}
                          onChange={handleCantidadChange}
                          onKeyDown={(e) => { if (["e","E","+","-"].includes(e.key)) e.preventDefault(); }}
                          placeholder={t("detalle.contributePlaceholder")}
                          min="1"
                          step="1"
                        />
                      </div>
                      {errorCantidad && (
                        <p style={{ fontSize: "0.78rem", color: "var(--error)", marginTop: 6, fontWeight: 600 }}>
                          {errorCantidad}
                        </p>
                      )}
                      {cantidadValida && !superaBalance && balanceMXNe !== null && (
                        <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 5 }}>
                          {t("detalle.available")}: {stroopsAMXNe(balanceMXNe)}
                        </p>
                      )}
                    </div>

                    {/* Calculadora */}
                    <div className="calc-result">
                      <div className="calc-row">
                        <span>{t("detalle.calcCapital")}</span>
                        <strong>${fmt(cantidadNum || 0)} MXN</strong>
                      </div>
                      <div className="calc-row">
                        <span>{t("detalle.calcYield", { pct: modoInversion === "inversor" ? "5%" : "0%" })}</span>
                        <strong style={{ color: "var(--navy)" }}>
                          ${fmt(proyeccion.tuYield)} MXN
                        </strong>
                      </div>
                      <div className="calc-row">
                        <span>{t("detalle.calcProject")}</span>
                        <strong style={{ color: "var(--green)" }}>
                          ${fmt(proyeccion.proyectoRecibe)} MXN
                        </strong>
                      </div>
                      <div className="calc-row total" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                        <span>{t("detalle.calcTotal")}</span>
                        <strong>${fmt(proyeccion.totalRetiras)} MXN</strong>
                      </div>
                    </div>

                    <button
                      className="invest-btn"
                      onClick={manejarContribuir}
                      disabled={cargando || !direccion || !cantidadValida || !!errorCantidad}
                    >
                      {cargando ? t("detalle.processing") : t("detalle.confirmContribute")}
                    </button>
                    <div className="invest-note">
                      {t("detalle.safetyMsg")}
                    </div>
                  </>
                )}

                {/* Capital bloqueado o retiro anticipado disponible */}
                {miAportacion > BigInt(0) && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
                    <div className="detail-banner detail-banner--green" style={{ background: "rgba(22,163,74,0.08)", color: "var(--green)", border: "1px solid rgba(22,163,74,0.22)", marginBottom: 10 }}>
                      <IconShield />
                      <span>{t("detalle.liquidityGuarantee", "Tu dinero no está bloqueado — puedes retirarlo cuando quieras")}</span>
                    </div>

                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--navy)", marginBottom: 8, textAlign: "center" }}>
                      {t("detalle.canWithdrawStatus", "Puedes retirar {{amount}} MXNe ahora", { amount: stroopsAMXNe(miAportacion) })}
                    </div>

                    {!vistaRetirar ? (
                      <button
                        className="btn btn-amber"
                        style={{ width: "100%", justifyContent: "center" }}
                        onClick={() => setVistaRetirar(true)}
                        disabled={cargando || !direccion}
                      >
                        {t("detalle.withdraw", "Retirar capital")}
                      </button>
                    ) : (
                      <div className="withdraw-confirm">
                        <div style={{ textAlign: "center", marginBottom: 14 }}>
                          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 4 }}>{t("detalle.youWillReceive")}</div>
                          <div style={{ fontFamily: "monospace", fontSize: "1.5rem", fontWeight: 700, color: "var(--navy)" }}>
                            {stroopsAMXNe(miAportacion)} MXNe
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4 }}>{t("detalle.exactAmount")}</div>
                          {(estado === "EtapaInicial" || estado === "EnProgreso") && !plazoVencido && (
                            <div style={{ fontSize: "0.75rem", color: "var(--amber, #D97706)", background: "rgba(217,119,6,0.1)", padding: "8px 10px", borderRadius: 6, marginTop: 8, lineHeight: 1.4, textAlign: "left" }}>
                              {t("detalle.earlyWithdrawTransparency", "Si retiras hoy, el proyecto dejará de recibir ~${{monthlyLoss}} MXNe/mes provenientes de tu aportación.", { monthlyLoss: calcMonthlyProjectLoss(miAportacion, proyecto.modo) })}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setVistaRetirar(false)}>
                            {t("detalle.cancel")}
                          </button>
                          <button
                            className="btn btn-amber"
                            style={{ flex: 2, justifyContent: "center" }}
                            onClick={estado === "EtapaInicial" || estado === "EnProgreso" ? manejarRetiroAnticipado : manejarRetirar}
                            disabled={cargando || !direccion}
                          >
                            {cargando ? t("detalle.processing") : t("detalle.confirmWithdraw")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reclamar yield (dueño, solo cuando proyecto liberado) */}
                {esDueno && estado === "Liberado" && BigInt(proyecto.aportado ?? 0) > BigInt(0) && (
                  <button
                    className="btn btn-secondary"
                    style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
                    onClick={manejarReclamarYield}
                    disabled={cargando || !direccion || miYield === BigInt(0)}
                    title={miYield === BigInt(0) ? t("detalle.waitYield") : ""}
                  >
                    {cargando ? t("detalle.processing") : t("detalle.claimYield")}
                  </button>
                )}

                {/* Tomar control (proyecto abandonado, no eres dueño) */}
                {esAbandonado && !esDueno && (
                  <button
                    className="invest-btn"
                    style={{ marginTop: 8 }}
                    onClick={manejarSolicitarContinuar}
                    disabled={cargando || !direccion}
                  >
                    {cargando ? t("detalle.processing") : t("detalle.takeControl")}
                  </button>
                )}

              </div>
            </div>
          </div>

            </>
          )}

        </div>
      </div>

      {mostrarQR && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-compartir-titulo"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setMostrarQR(false); }}
        >
          <div style={{
            background: "var(--card)", borderRadius: "var(--radius)",
            padding: 32, maxWidth: 400, width: "90%",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 20
          }}>
            <h3 id="modal-compartir-titulo" style={{ margin: 0 }}>
              {t("detalle.compartir.titulo")}
            </h3>

            <QRCodeSVG value={urlProyecto} size={200} />

            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <input
                readOnly
                value={urlProyecto}
                style={{
                  flex: 1, padding: "8px 12px",
                  border: "1.5px solid var(--border2)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.82rem", color: "var(--muted)",
                  fontFamily: "monospace"
                }}
              />
              <button
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(urlProyecto);
                  mostrarToast();
                }}
                type="button"
              >
                📋 {t("detalle.compartir.copiar")}
              </button>
            </div>

            {toastVisible && (
              <p style={{ color: "var(--green)", fontSize: "0.85rem", margin: 0 }}>
                {t("detalle.compartir.copiado")}
              </p>
            )}

            {navigator.share && (
              <button
                className="btn btn-secondary"
                style={{ width: "100%" }}
                onClick={() => navigator.share({
                  title: proyecto.nombre,
                  url: urlProyecto
                })}
                type="button"
              >
                {t("detalle.compartir.nativo")}
              </button>
            )}

            <button
              className="btn btn-outline"
              style={{ width: "100%" }}
              onClick={() => setMostrarQR(false)}
              type="button"
            >
              {t("detalle.compartir.cerrar")}
            </button>
          </div>
        </div>
      )}

    </>
  );
}
