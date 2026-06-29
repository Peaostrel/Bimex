import { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { setAllowed } from "@stellar/freighter-api";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import ConectarWallet   from "./components/ConectarWallet";
import ListaProyectos   from "./components/ListaProyectos";
import DetalleProyecto  from "./components/DetalleProyecto";
import CasosDeExito     from "./components/CasosDeExito";
import MiCuenta         from "./components/MiCuenta";
import Changelog        from "./components/Changelog";
import Terminos         from "./components/Terminos";
import Privacidad       from "./components/Privacidad";
import OnboardingTour from "./components/OnboardingTour";
import SimuladorImpacto from "./components/SimuladorImpacto";
import AuditoriaBadge from "./components/AuditoriaBadge";
import { shouldShowTour } from "./utils/onboardingUtils";
import { getStorage }   from "./utils/storage";
import { parsearError } from "./utils/errores";
import { useCetesRate } from "./hooks/useCetesRate";
import "./i18n/index.js";
import "./index.css";

const KEY_SESION_WALLET = "bimex.wallet.session";
const IS_STAGING = import.meta.env.MODE === "staging";
const KEY_PWA_BANNER_CERRADO = "bimex.pwa.banner.dismissed";
const storageSesion     = getStorage("session");
const storageLocal      = getStorage("local");
const ADMIN_ADDRESS     = import.meta.env.VITE_ADMIN_ADDRESS ?? "GD2FLYXZMEGSSYZGC4LKFGCH6SOZR57UB64ECPEEJ4IEKAT6VZU3SLGS";

const AdminPanel = lazy(() => import("./components/AdminPanel"));
const CrearProyecto = lazy(() => import("./components/CrearProyecto"));
const Transparencia = lazy(() => import("./components/Transparencia"));
const Recompensas = lazy(() => import("./components/Recompensas"));

let contratoFnsPromise = null;

function cargarContratoFns() {
  if (!contratoFnsPromise) {
    contratoFnsPromise = import("./stellar/contrato").then((mod) => ({
      obtenerTodosLosProyectos: mod.obtenerTodosLosProyectos,
      stroopsAMXNe: mod.stroopsAMXNe,
      mintearMXNePrueba: mod.mintearMXNePrueba,
    }));
  }
  return contratoFnsPromise;
}

function leerAutoConectarInicial() {
  return storageSesion.getItem(KEY_SESION_WALLET) === "1";
}

function Cargando({ inline = false }) {
  return (
    <div className={inline ? "spinner-inline-wrapper" : "spinner-global"} aria-live="polite" aria-busy="true">
      <span className="spinner-global-dot" aria-hidden="true" />
      <span>Cargando...</span>
    </div>
  );
}

function leerBannerPwaInicial() {
  return storageLocal.getItem(KEY_PWA_BANNER_CERRADO) === "1";
}

function PwaInstallBanner({ visible, onInstall, onClose, onInstalled, installReady, message }) {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <div style={st.installBannerWrap}>
      <div role="status" aria-live="polite" style={st.installBanner}>
        <div>
          <p style={st.installBannerTitle}>{t("pwa.title")}</p>
          <p style={st.installBannerText}>{message ?? t("pwa.subtitle")}</p>
        </div>
        <div style={st.installBannerActions}>
          {installReady ? (
            <button className="btn btn-primary" onClick={onInstall}>
              {t("pwa.install")}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onInstalled}>
              {t("pwa.installedAction")}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            {t("pwa.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Logo SVG ────────────────────────────────────────────────────────────────
function LogoSVG({ size = 36, light = false }) {
  const c1 = light ? "rgba(255,255,255,0.85)" : "#1E3A5F";
  const c2 = light ? "rgba(255,255,255,0.60)" : "#16A34A";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="8" cy="11" r="3.5" stroke={c1} strokeWidth="1.8"/>
      <circle cx="8" cy="20" r="3.5" stroke={c1} strokeWidth="1.8"/>
      <circle cx="8" cy="29" r="3.5" stroke={c1} strokeWidth="1.8"/>
      <line x1="11.5" y1="11" x2="18" y2="11" stroke={c1} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="11.5" y1="20" x2="18" y2="15" stroke={c2} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="11.5" y1="29" x2="18" y2="29" stroke={c2} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

// ── Datos estáticos de landing ──────────────────────────────────────────────
const FEATURES = [
  {
    titulo: "Tu dinero no está bloqueado — puedes retirarlo cuando quieras",
    desc: "Tu MXNe entra al smart contract y permanece disponible para ti. Puedes retirar el 100% de tu dinero en cualquier momento que lo desees, sin plazos forzosos ni penalizaciones.",
    color: "#1E3A5F", bg: "rgba(30,58,95,0.05)", border: "rgba(30,58,95,0.12)",
  },
  {
    titulo: "Doble rendimiento: CETES + AMM Stellar",
    desc: "Tu capital genera rendimiento en dos capas: CETES vía Etherfuse (deuda soberana mexicana) y fees del AMM de Stellar. El proyecto recibe ese rendimiento mientras tu capital permanece intacto.",
    color: "#16A34A", bg: "rgba(22,163,74,0.05)", border: "rgba(22,163,74,0.15)",
  },
  {
    titulo: "100% on-chain, sin intermediarios",
    desc: "Cada proyecto requiere documentos verificados almacenados en IPFS con referencia en blockchain. El código es público, auditable y autónomo.",
    color: "#D97706", bg: "rgba(217,119,6,0.05)", border: "rgba(217,119,6,0.15)",
  },
];

const PASOS = [
  { num: "01", titulo: "Conecta tu wallet", desc: "Abre Freighter en Stellar Testnet y conecta con un clic. Sin registro, sin KYC." },
  { num: "02", titulo: "Deposita MXNe en un proyecto", desc: "Tu capital entra al smart contract. Si el proyecto no alcanza su meta, se devuelve automáticamente." },
  { num: "03", titulo: "El rendimiento financia el proyecto", desc: "El yield (CETES + AMM) financia el proyecto mensualmente. Tu capital lo recuperas íntegro al finalizar." },
  { num: "04", titulo: "Recuperas todo más tu ganancia", desc: "Al cierre retiras tu capital original más el 5% de rendimiento acumulado. Recibes un certificado de impacto." },
];

// ── Hook: estadísticas en vivo ─────────────────────────────────────────────
let _statsCache = null;
let _statsCacheTs = 0;

function useLiveStats() {
  const [stats, setStats] = useState(() => _statsCache ?? { totalProyectos: "—", totalBloqueado: "—", enProgreso: "—" });
  useEffect(() => {
    if (_statsCache && Date.now() - _statsCacheTs < 15_000) {
      return;
    }
    cargarContratoFns()
      .then(({ obtenerTodosLosProyectos, stroopsAMXNe }) => obtenerTodosLosProyectos().then((proyectos) => ({ proyectos, stroopsAMXNe })))
      .then(({ proyectos, stroopsAMXNe }) => {
        const totalBloqueado = proyectos.reduce((s, p) => {
          try { return s + BigInt(p.aportado ?? 0); } catch { return s; }
        }, BigInt(0));
        const enProgreso = proyectos.filter(p => p.estado === "EnProgreso").length;
        const next = {
          totalProyectos: proyectos.length.toString(),
          totalBloqueado: stroopsAMXNe(totalBloqueado),
          enProgreso: enProgreso.toString(),
        };
        _statsCache = next;
        _statsCacheTs = Date.now();
        setStats(next);
      })
      .catch(() => {});
  }, []);
  return stats;
}

// ── Botón faucet ────────────────────────────────────────────────────────────
function BtnFaucet({ direccion }) {
  const [estado, setEstado] = useState("idle");

  async function pedir() {
    setEstado("loading");
    try {
      const { mintearMXNePrueba } = await cargarContratoFns();
      await mintearMXNePrueba(direccion);
      setEstado("ok");
      setTimeout(() => setEstado("idle"), 4000);
    } catch {
      setEstado("error");
      setTimeout(() => setEstado("idle"), 3000);
    }
  }

  const labels = { idle: "100 MXNe", loading: "...", ok: "Listo", error: "Error" };

  return (
    <button
      onClick={pedir}
      disabled={estado === "loading"}
      title="Obtener 100 MXNe de prueba (solo testnet)"
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border2)",
        color: estado === "ok" ? "var(--green)" : estado === "error" ? "var(--error)" : "var(--text2)",
        padding: "6px 14px", borderRadius: "var(--radius-sm)",
        fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: "0.78rem",
        cursor: estado === "loading" ? "not-allowed" : "pointer",
        transition: "all 0.15s", whiteSpace: "nowrap",
      }}
    >
      {labels[estado]}
    </button>
  );
}

// ── Toast Container ──────────────────────────────────────────────────────────
function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "fixed", top: 16, right: 16, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 10,
        maxWidth: 380, width: "calc(100vw - 32px)",
      }}
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.tipo === "error" ? "alert" : "status"}
          aria-live={t.tipo === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          style={{
            background: t.tipo === "error" ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${t.tipo === "error" ? "rgba(220,38,38,0.20)" : "rgba(22,163,74,0.20)"}`,
            borderLeft: `4px solid ${t.tipo === "error" ? "#DC2626" : "var(--green)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            boxShadow: "var(--shadow-md)",
            display: "flex", alignItems: "flex-start", gap: 10,
            animation: "slideInRight 0.22s ease",
          }}>
          {/* Icono */}
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            {t.tipo === "error" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            )}
          </div>
          {/* Texto */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: "0.78rem", fontWeight: 700, margin: 0,
              color: t.tipo === "error" ? "#991B1B" : "#166534",
            }}>
              {t.tipo === "error" ? "Error" : "Éxito"}
            </p>
            <p style={{
              fontSize: "0.79rem", margin: "3px 0 0", lineHeight: 1.5,
              color: t.tipo === "error" ? "#7F1D1D" : "#14532D",
              wordBreak: "break-word",
            }}>
              {t.msg}
            </p>
          </div>
          {/* Botón cerrar */}
          <button
            onClick={() => onRemove(t.id)}
            aria-label="Cerrar notificación"
            style={{
              flexShrink: 0, background: "none", border: "none", cursor: "pointer",
              color: t.tipo === "error" ? "#DC2626" : "var(--green)",
              padding: "1px 3px", lineHeight: 1, fontSize: "0.85rem",
              opacity: 0.7, marginTop: -1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [refrescar,      setRefrescar]      = useState(0);
  const [direccion,      setDireccion]      = useState(null);
  const [modalCrear,     setModalCrear]     = useState(false);
  const [autoConectar,   setAutoConectar]   = useState(leerAutoConectarInicial);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [totalInvertido, setTotalInvertido] = useState(null);
  const [tema,           setTema]           = useState(() => storageLocal.getItem("tema") || "auto");
  const [tourActivo,     setTourActivo]     = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [mostrarMensajeInstalada, setMostrarMensajeInstalada] = useState(false);
  const [bannerPwaCerrado, setBannerPwaCerrado] = useState(leerBannerPwaInicial);

  useEffect(() => {
    const docEl = document.documentElement;
    if (tema === "auto") {
      docEl.setAttribute("data-theme", "");
      storageLocal.removeItem("tema");
    } else {
      docEl.setAttribute("data-theme", tema);
      storageLocal.setItem("tema", tema);
    }
  }, [tema]);

  useEffect(() => {
    document.documentElement.lang = i18n.language || "es";
  }, [i18n.language]);

  // ── Toast system ───────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const quitarToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const agregarToast = useCallback((msg, tipo = "error") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, tipo }]);
    setTimeout(() => quitarToast(id), 7000);
  }, [quitarToast]);

  const mostrarError = useCallback((err) => {
    agregarToast(parsearError(err), "error");
  }, [agregarToast]);

  const esAdmin = direccion === ADMIN_ADDRESS;
  const pathname = location.pathname;
  const esRutaProyectos = pathname === "/" || pathname === "/proyectos" || pathname.startsWith("/proyectos/");
  const esRutaCuenta = pathname === "/cuenta";
  const esRutaTransparencia = pathname === "/transparencia";
  const esRutaImpacto = pathname === "/impacto";

  function formatearDir(dir) {
    if (!dir) return "";
    return `${dir.slice(0, 5)}...${dir.slice(-4)}`;
  }

  const desconectarLocal = useCallback(() => {
    storageSesion.removeItem(KEY_SESION_WALLET);
    setAutoConectar(false);
    setDireccion(null);
    setModalCrear(false);
    navigate("/", { replace: true });
  }, [navigate]);

  async function cerrarSesionWallet() {
    setCerrandoSesion(true);
    try {
      await Promise.race([
        setAllowed(false),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
      ]);
    } catch (err) {
      void err;
    }
    finally { desconectarLocal(); setCerrandoSesion(false); }
  }

  const manejarConectado = useCallback((addr) => {
    if (addr) {
      storageSesion.setItem(KEY_SESION_WALLET, "1");
      setDireccion(addr);
      setAutoConectar(true);
      navigate("/proyectos", { replace: true });
      if (shouldShowTour()) setTimeout(() => setTourActivo(true), 800);
    } else {
      desconectarLocal();
    }
  }, [navigate, desconectarLocal]);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPromptEvent(event);
      setBannerPwaCerrado(false);
      storageLocal.removeItem(KEY_PWA_BANNER_CERRADO);
    }

    function onAppInstalled() {
      setInstallPromptEvent(null);
      setMostrarMensajeInstalada(true);
      setBannerPwaCerrado(false);
      storageLocal.removeItem(KEY_PWA_BANNER_CERRADO);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const cerrarBannerPwa = useCallback(() => {
    setMostrarMensajeInstalada(false);
    setBannerPwaCerrado(true);
    storageLocal.setItem(KEY_PWA_BANNER_CERRADO, "1");
  }, []);

  const instalarPwa = useCallback(async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    try {
      await installPromptEvent.userChoice;
    } catch {
      // no-op
    }
    setInstallPromptEvent(null);
  }, [installPromptEvent]);

  const activarVistaInstalada = useCallback(() => {
    setMostrarMensajeInstalada(false);
    setBannerPwaCerrado(false);
    storageLocal.removeItem(KEY_PWA_BANNER_CERRADO);
  }, []);

  const mostrarBannerPwa = !bannerPwaCerrado && (Boolean(installPromptEvent) || mostrarMensajeInstalada);
  const mensajeBannerPwa = mostrarMensajeInstalada
    ? t("pwa.installed")
    : t("pwa.subtitle");

  const refrescarLista = useCallback(() => { setRefrescar(r => r + 1); }, []);
  const cerrarDetalle  = useCallback(() => navigate("/proyectos"), [navigate]);

  return (
    <div>
      <ToastContainer toasts={toasts} onRemove={quitarToast} />
      <OnboardingTour isActive={tourActivo} onComplete={() => setTourActivo(false)} />
      <PwaInstallBanner
        visible={mostrarBannerPwa}
        onInstall={instalarPwa}
        onClose={cerrarBannerPwa}
        onInstalled={activarVistaInstalada}
        installReady={Boolean(installPromptEvent)}
        message={mensajeBannerPwa}
      />
      {pathname !== "/" && (
        <nav className="navbar" aria-label="Navegación principal">
          {/* Logo + Nav tabs agrupados a la izquierda */}
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginRight: 24 }}>
              <LogoSVG size={22} />
              <span className="navbar-logo">Bimex</span>
              {IS_STAGING && <span style={st.stagingBadge}>STAGING</span>}
            </div>

            <div style={{ display: "flex", gap: 2, height: "100%", alignItems: "stretch" }}>
              <button
                type="button"
                onClick={() => navigate("/proyectos")}
                style={{
                  ...st.navTab,
                  color: esRutaProyectos ? "var(--navy)" : "var(--muted)",
                  borderBottom: esRutaProyectos ? "2px solid var(--navy)" : "2px solid transparent",
                }}
                aria-current={esRutaProyectos ? "page" : undefined}
              >
                {t("nav.projects")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/cuenta")}
                style={{
                  ...st.navTab,
                  color: esRutaCuenta ? "var(--navy)" : "var(--muted)",
                  borderBottom: esRutaCuenta ? "2px solid var(--navy)" : "2px solid transparent",
                }}
                aria-current={esRutaCuenta ? "page" : undefined}
              >
                {t("nav.myAccount")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/transparencia")}
                style={{
                  ...st.navTab,
                  color: esRutaTransparencia ? "var(--navy)" : "var(--muted)",
                  borderBottom: esRutaTransparencia ? "2px solid var(--navy)" : "2px solid transparent",
                }}
                aria-current={esRutaTransparencia ? "page" : undefined}
              >
                {t("nav.transparency")}
              </button>
              <button
                type="button"
                onClick={() => navigate("/impacto")}
                style={{
                  ...st.navTab,
                  color: esRutaImpacto ? "var(--navy)" : "var(--muted)",
                  borderBottom: esRutaImpacto ? "2px solid var(--navy)" : "2px solid transparent",
                }}
                aria-current={esRutaImpacto ? "page" : undefined}
              >
                {t("nav.impact")}
              </button>
            </div>
          </div>

          {direccion && (
            <div className="navbar-actions">
              <span className="navbar-hide-tablet" style={st.testnetBadge}>Testnet</span>

              <button
                type="button"
                onClick={() => setTema(t => t === 'dark' ? 'light' : 'dark')}
                style={st.langBtn}
                aria-label={t(tema === 'dark' ? "tema.claro" : "tema.oscuro")}
              >
                {tema === 'dark' ? '☀️' : '🌙'}
              </button>

              <BtnFaucet direccion={direccion} />

              <button
                type="button"
                onClick={() => i18n.changeLanguage(i18n.language === "es" ? "en" : "es")}
                style={st.langBtn}
                aria-label={t("lang.toggleAria")}
              >
                {t("lang.toggle")}
              </button>

              {esAdmin && (
                <button type="button" className="navbar-btn-admin" onClick={() => navigate("/admin") }>
                  {t("nav.admin")}
                </button>
              )}

              <Suspense fallback={<Cargando inline />}>
                <Recompensas direccion={direccion} refrescar={refrescar} totalInvertido={totalInvertido} />
              </Suspense>

              <div className="wallet-chip">
                <span className="wallet-dot" aria-hidden="true" />
                <span aria-label={`Wallet: ${direccion}`}>{formatearDir(direccion)}</span>
              </div>

              <button type="button" className="navbar-btn-salir" onClick={cerrarSesionWallet} disabled={cerrandoSesion}>
                {cerrandoSesion ? t("nav.loggingOut") : t("nav.logout")}
              </button>
            </div>
          )}
        </nav>
      )}

      <main id="contenido-principal">
        <Routes>
          <Route
            path="/"
            element={
              direccion ? (
                <Navigate to="/proyectos" replace />
              ) : (
                <Landing
                  autoConectar={autoConectar}
                  onConectado={manejarConectado}
                  onTransparencia={() => navigate("/transparencia")}
                  onChangelog={() => navigate("/novedades")}
                  onTerminos={() => navigate("/terminos")}
                  onPrivacidad={() => navigate("/privacidad")}
                  tema={tema}
                  setTema={setTema}
                  onInstallPwa={instalarPwa}
                  installReady={Boolean(installPromptEvent)}
                />
              )
            }
          />
          <Route
            path="/proyectos"
            element={
              <ListaProyectos
                onCrear={() => setModalCrear(true)}
                refrescar={refrescar}
                onError={mostrarError}
              />
            }
          />
          <Route
            path="/proyectos/:id"
            element={
              <DetalleProyecto
                direccion={direccion}
                onCerrar={cerrarDetalle}
                onError={mostrarError}
                onToast={(msg) => agregarToast(msg, "success")}
              />
            }
          />
          <Route
            path="/cuenta"
            element={
              direccion ? (
                <MiCuenta
                  direccion={direccion}
                  onVerProyecto={(proyecto) => navigate(`/proyectos/${proyecto.id}`)}
                  onTotalInvertido={setTotalInvertido}
                  onError={mostrarError}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/transparencia"
            element={
              <Suspense fallback={<Cargando />}>
                <Transparencia onVolver={() => navigate(direccion ? "/proyectos" : "/")} />
              </Suspense>
            }
          />
          <Route path="/impacto" element={<CasosDeExito />} />
          <Route path="/novedades" element={<div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}><button type="button" className="btn btn-ghost" onClick={() => navigate(direccion ? "/proyectos" : "/")} style={{ fontSize: "0.84rem" }}>← Volver</button><Changelog /></div>} />
          <Route path="/terminos" element={<Terminos onVolver={() => navigate(direccion ? "/proyectos" : "/")} />} />
          <Route path="/privacidad" element={<Privacidad onVolver={() => navigate(direccion ? "/proyectos" : "/")} />} />
          <Route
            path="/admin"
            element={
              direccion && esAdmin ? (
                <Suspense fallback={<Cargando />}>
                  <AdminPanel
                    direccion={direccion}
                    adminAddress={ADMIN_ADDRESS}
                    onCerrar={cerrarDetalle}
                    onError={mostrarError}
                  />
                </Suspense>
              ) : (
                <Navigate to={direccion ? "/proyectos" : "/"} replace />
              )
            }
          />
          <Route path="*" element={<Navigate to={direccion ? "/proyectos" : "/"} replace />} />
        </Routes>

        {modalCrear && esRutaProyectos && (
          <Suspense fallback={<Cargando />}>
            <CrearProyecto
              direccion={direccion}
              onCerrar={() => setModalCrear(false)}
              onCreado={() => { setModalCrear(false); refrescarLista(); }}
              onError={mostrarError}
            />
          </Suspense>
        )}
      </main>
      {pathname !== "/" && (
        <footer style={{ ...st.footer, padding: "16px 40px" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => navigate("/novedades")}
              style={st.footerLink}>
              Novedades
            </button>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.78rem" }}>·</span>
            <button type="button" onClick={() => navigate("/terminos")}
              style={st.footerLink}>
              {t("footer.terms")}
            </button>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.78rem" }}>·</span>
            <button type="button" onClick={() => navigate("/privacidad")}
              style={st.footerLink}>
              {t("footer.privacy")}
            </button>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.78rem" }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem" }}>Bimex · Stellar Testnet</span>
          </div>
        </footer>
      )}
    </div>
  );
}

// ── Landing ──────────────────────────────────────────────────────────────────
function Landing({ autoConectar, onConectado, onTransparencia, onChangelog, onTerminos, onPrivacidad, tema, setTema, onInstallPwa, installReady }) {
  const { t } = useTranslation();
  const liveStats = useLiveStats();
  const { rate: cetesRate, error: cetesError } = useCetesRate();

  const STATS_LIVE = [
    { valor: liveStats.totalProyectos, label: "Proyectos activos" },
    { valor: liveStats.totalBloqueado, label: "MXNe invertidos" },
    { valor: cetesRate ? `${cetesRate}%` : "9.45%", label: cetesError ? "APY CETES (ref.)" : "APY CETES hoy" },
  ];

  return (
    <div style={{ overflowX: "hidden", background: "var(--bg)" }}>
      <a href="#contenido-principal" className="skip-link">Saltar al contenido</a>

      {/* Navbar landing */}
      <nav aria-label="Navegación principal" className="navbar" style={{ position: "fixed", top: 0, left: 0, right: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <LogoSVG size={22} />
          <span className="navbar-logo">Bimex</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="navbar-hide-tablet" style={st.testnetBadge}>Testnet</span>
          
          <button
            onClick={() => setTema(t => t === 'dark' ? 'light' : 'dark')}
            style={st.langBtn}
            aria-label={t(tema === 'dark' ? "tema.claro" : "tema.oscuro")}
          >
            {tema === 'dark' ? '☀️' : '🌙'}
          </button>

          <button
            type="button"
            onClick={onTransparencia}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.84rem", fontWeight: 500, color: "var(--navy)", padding: "8px 12px" }}
          >
            Transparencia
          </button>
          <ConectarWallet autoConectar={autoConectar} onConectado={onConectado} inNavbar />
        </div>
      </nav>

      {/* Hero */}
      <section
        id="contenido-principal"
        className="landing-hero-section"
        aria-labelledby="hero-titulo"
        style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", paddingTop: 60 }}
      >
        <div className="landing-hero-inner" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 40px 72px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div>
            <div style={st.heroBadge}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
              Tu dinero no está bloqueado — puedes retirarlo cuando quieras
            </div>
            <div style={{ marginTop: 10 }}>
              <AuditoriaBadge variant="compact" />
            </div>
            <h1 id="hero-titulo" style={st.heroH1}>
              Invierte. Impacta.<br />
              <span style={{ color: "var(--navy)" }}>Recupera todo.</span>
            </h1>
            <p style={st.heroDesc}>
              Tu capital genera rendimiento que financia proyectos sociales verificados.
              Al finalizar, recuperas el 100% de lo que depositaste — más tu ganancia.
            </p>
            <div style={st.heroActions}>
              <ConectarWallet autoConectar={autoConectar} onConectado={onConectado} />
              {installReady && (
                <button className="btn btn-ghost" onClick={onInstallPwa} style={st.installHeroBtn}>
                  {t("pwa.install")}
                </button>
              )}
            </div>
            <p style={st.heroNote}>
              Requiere{" "}
              <a href="https://freighter.app" target="_blank" rel="noreferrer" style={{ color: "var(--navy)", fontWeight: 600 }}>
                Freighter Wallet
              </a>
              {" "}en Stellar Testnet
            </p>
          </div>

          {/* Yield card */}
          <div className="landing-yield-card" style={st.yieldCard}>
            <div style={st.yieldCardHead}>
              <p style={{ fontSize: "0.78rem", opacity: 0.7, marginBottom: 4 }}>Distribución del rendimiento</p>
              <p style={{ fontWeight: 600, fontSize: "0.98rem" }}>Yield total: ~13.45% anual</p>
            </div>
            {[
              { label: "Proyecto social", sub: "Financiamiento mensual", pct: "6.00%", color: "var(--green)" },
              { label: "Tu rendimiento",  sub: "Acumulado hasta el cierre", pct: "5.00%", color: "var(--navy)" },
              { label: "Plataforma Bimex", sub: "Operación y seguridad", pct: "2.45%", color: "var(--subtle)" },
            ].map(r => (
              <div key={r.label} style={st.yieldRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.color, flexShrink: 0, display: "inline-block" }} />
                  <div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 500, color: "var(--text)" }}>{r.label}</div>
                    <div style={{ fontSize: "0.74rem", color: "var(--muted)" }}>{r.sub}</div>
                  </div>
                </div>
                <span style={{ fontWeight: 700, fontSize: "0.95rem", color: r.color }}>{r.pct}</span>
              </div>
            ))}
            <div style={st.yieldTotal}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total distribuido</span>
              <strong style={{ fontSize: "1rem", color: "var(--navy)" }}>13.45%</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section aria-label="Estadísticas de la plataforma" className="landing-stats-bar landing-section">
        <div className="landing-stats-inner">
          {STATS_LIVE.map((s, i) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center" }}>
              <div className="landing-stats-item">
                <div style={{ fontWeight: 700, fontSize: "1.5rem", color: "#fff", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{s.valor}</div>
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.55)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 5 }}>{s.label}</div>
              </div>
              {i < STATS_LIVE.length - 1 && (
                <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>

        {cetesRate && (
          <div className="landing-cetes-row">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.7rem", background: "rgba(22,163,74,0.25)", color: "#86EFAC", fontWeight: 700, padding: "3px 10px", borderRadius: 99, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                CETES hoy
              </span>
              <span style={{ fontWeight: 700, fontSize: "1rem", color: "#86EFAC" }}>{cetesRate}%</span>
              <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.7)" }}>vía Etherfuse</span>
            </div>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.7rem", background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)", fontWeight: 700, padding: "3px 10px", borderRadius: 99, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                AMM Stellar
              </span>
              <span style={{ fontWeight: 700, fontSize: "1rem", color: "rgba(255,255,255,0.85)" }}>~4%</span>
            </div>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>
              = ~{(cetesRate + 4).toFixed(2)}% APY total disponible
            </span>
          </div>
        )}
      </section>

      {/* Simulador de impacto */}
      <section aria-labelledby="simulador-titulo" className="landing-section" style={{ padding: "64px 40px", background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ marginBottom: 32 }}>
            <div style={st.sectionLabel}>{t("simulador.sectionLabel")}</div>
            <h2 id="simulador-titulo" style={st.sectionH2}>{t("simulador.title")}</h2>
            <p style={st.sectionSub}>{t("simulador.subtitle")}</p>
          </div>
          <SimuladorImpacto />
        </div>
      </section>

      {/* Features */}
      <section aria-labelledby="features-titulo" className="landing-section" style={{ padding: "64px 40px", background: "var(--bg)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ marginBottom: 40 }}>
            <div style={st.sectionLabel}>Por que Bimex</div>
            <h2 id="features-titulo" style={st.sectionH2}>Crowdfunding sin perder tu capital</h2>
            <p style={st.sectionSub}>Lo peor que te puede pasar: salir exactamente como entraste.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.titulo} style={{ background: f.bg, border: `1px solid ${f.border}`, borderRadius: "var(--radius)", padding: "28px 24px" }}>
                <h3 style={{ fontWeight: 600, fontSize: "0.95rem", color: f.color, marginBottom: 12, lineHeight: 1.5 }}>{f.titulo}</h3>
                <p style={{ color: "var(--muted)", fontSize: "0.88rem", lineHeight: 1.75, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section aria-labelledby="como-funciona-titulo" className="landing-section" style={{ padding: "64px 40px", background: "var(--card)", borderTop: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ marginBottom: 40 }}>
            <div style={st.sectionLabel}>Como funciona</div>
            <h2 id="como-funciona-titulo" style={st.sectionH2}>Cuatro pasos, capital protegido</h2>
            <p style={st.sectionSub}>Sin registro, sin KYC, sin intermediarios.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            {PASOS.map(p => (
              <div key={p.num} style={{ background: "var(--card)", padding: "28px 22px" }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--navy-dim)", color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.82rem", marginBottom: 14 }}>
                  {p.num}
                </div>
                <h3 style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text)", marginBottom: 8, lineHeight: 1.4 }}>{p.titulo}</h3>
                <p style={{ color: "var(--muted)", fontSize: "0.84rem", lineHeight: 1.65, margin: 0 }}>{p.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 32, padding: "28px 32px", background: "var(--navy)", borderRadius: "var(--radius)", textAlign: "center" }}>
            <p style={{ fontWeight: 600, fontSize: "1.05rem", color: "#fff", marginBottom: 6, lineHeight: 1.5 }}>
              Listo para apoyar un proyecto?
            </p>
            <p style={{ color: "rgba(255,255,255,0.60)", fontSize: "0.88rem", marginBottom: 22 }}>
              Conecta tu wallet y empieza. Tu capital siempre es recuperable al finalizar.
            </p>
            <ConectarWallet autoConectar={false} onConectado={onConectado} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={st.footer}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <LogoSVG size={20} light />
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "rgba(255,255,255,0.85)" }}>Bimex</span>
        </div>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem", marginBottom: 10 }}>
          Hack+ Alebrije · Stellar · CDMX 2025 · Construido con Soroban y MXNe
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onChangelog} style={st.footerLinkLanding}>
            Novedades
          </button>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.78rem" }}>·</span>
          <button type="button" onClick={onTerminos} style={st.footerLinkLanding}>
            {t("footer.terms")}
          </button>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.78rem" }}>·</span>
          <button type="button" onClick={onPrivacidad} style={st.footerLinkLanding}>
            {t("footer.privacy")}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const st = {
  navTab: {
    padding: "6px 14px", borderRadius: 0, border: "none", borderBottom: "2px solid transparent",
    fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: "0.88rem",
    cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
    background: "transparent",
  },
  testnetBadge: {
    fontSize: "0.72rem", fontWeight: 600, color: "var(--amber)",
    textTransform: "uppercase", letterSpacing: "0.05em",
    background: "var(--amber-dim)", padding: "3px 10px",
    borderRadius: 99, border: "1px solid rgba(217,119,6,0.20)",
    whiteSpace: "nowrap",
  },
  langBtn: {
    background: "var(--bg)", border: "1px solid var(--border2)",
    color: "var(--text2)", padding: "6px 12px", borderRadius: "var(--radius-sm)",
    fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer",
  },
  heroBadge: {
    display: "inline-flex", alignItems: "center", gap: 7,
    background: "var(--green-dim)", color: "var(--green)",
    border: "1px solid rgba(22,163,74,0.20)",
    padding: "5px 14px", borderRadius: 99,
    fontSize: "0.78rem", fontWeight: 600, marginBottom: 20,
    textTransform: "uppercase", letterSpacing: "0.03em",
  },
  heroH1: {
    fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 700,
    color: "var(--text)", marginBottom: 18, lineHeight: 1.2,
  },
  heroDesc: {
    fontSize: "1rem", color: "var(--text2)",
    lineHeight: 1.75, marginBottom: 28, maxWidth: 440,
  },
  heroNote: { color: "var(--muted)", fontSize: "0.78rem", marginTop: 14 },
  heroActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  installHeroBtn: {
    minWidth: 170,
    justifyContent: "center",
  },
  installBannerWrap: {
    position: "sticky",
    top: 0,
    zIndex: 10000,
    padding: "12px 16px 0",
  },
  installBanner: {
    maxWidth: 1120,
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    background: "#0f172a",
    color: "#fff",
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow-md)",
    padding: "14px 18px",
  },
  installBannerTitle: {
    margin: 0,
    fontWeight: 700,
    fontSize: "0.95rem",
  },
  installBannerText: {
    margin: "4px 0 0",
    color: "rgba(255,255,255,0.72)",
    fontSize: "0.84rem",
    lineHeight: 1.5,
    maxWidth: 620,
  },
  installBannerActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  yieldCard: {
    background: "var(--card)", border: "1px solid var(--border)",
    borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", overflow: "hidden",
  },
  yieldCardHead: {
    background: "var(--navy)", padding: "18px 22px", color: "#fff",
  },
  yieldRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "13px 22px", borderBottom: "1px solid var(--border)",
  },
  yieldTotal: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "13px 22px", background: "var(--bg)",
    borderTop: "2px solid var(--border)",
  },
  sectionLabel: {
    fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "var(--green)", marginBottom: 10,
  },
  sectionH2: {
    fontSize: "clamp(1.3rem, 3vw, 1.7rem)", fontWeight: 700,
    color: "var(--text)", marginBottom: 8, lineHeight: 1.3,
  },
  sectionSub: { color: "var(--muted)", fontSize: "0.95rem", maxWidth: 480 },
  footer: {
    background: "var(--navy)", padding: "28px 40px", textAlign: "center",
  },
  footerLink: {
    background: "none", border: "none", cursor: "pointer",
    color: "rgba(255,255,255,0.75)", fontSize: "0.78rem",
    fontWeight: 500, padding: "4px 8px",
  },
  footerLinkLanding: {
    background: "none", border: "none", cursor: "pointer",
    color: "rgba(255,255,255,0.75)", fontSize: "0.78rem",
    fontWeight: 500, padding: 0,
  },
  stagingBadge: {
    fontSize: "0.72rem", fontWeight: 700, color: "#8B5CF6",
    textTransform: "uppercase", letterSpacing: "0.05em",
    background: "rgba(139,92,246,0.10)", padding: "3px 10px",
    borderRadius: 99, border: "1px solid rgba(139,92,246,0.25)",
    whiteSpace: "nowrap",
  },
};
