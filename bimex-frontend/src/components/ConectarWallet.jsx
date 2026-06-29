import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { parsearError } from "../utils/errores.js";
import {
  passkeyKit,
  CONFIG,
  obtenerEstadoTrustlineMXNe,
  crearTrustlineMXNe,
  urlFriendbot,
} from "../stellar/contrato.js";
import { getConnectedAddress, openWalletModal } from "../stellar/walletKit.js";
import { Fingerprint, Wallet } from "lucide-react";

const RESERVA_XLM_POR_TRUSTLINE = 0.5;

const estilosBanner = {
  banner: {
    padding: "12px 14px",
    background: "var(--card)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    maxWidth: 360,
  },
  titulo: {
    margin: "0 0 6px",
    fontSize: "0.88rem",
    fontWeight: 700,
    color: "var(--amber)",
  },
  desc: {
    margin: "0 0 10px",
    fontSize: "0.8rem",
    color: "var(--text-muted, var(--text))",
    lineHeight: 1.45,
  },
  error: {
    margin: "8px 0 0",
    fontSize: "0.78rem",
    color: "var(--error, #DC2626)",
  },
  link: {
    color: "var(--navy)",
    fontWeight: 600,
  },
};

export default function ConectarWallet({ onConectado, autoConectar = true, inNavbar = false }) {
  const { t } = useTranslation();
  const [estado, setEstado] = useState("inactivo");
  const [direccion, setDireccion] = useState(null);
  const [error, setError] = useState("");
  const [nuevaPasskey, setNuevaPasskey] = useState(false);
  const [trustlineFalta, setTrustlineFalta] = useState(false);
  const [trustlineVerificando, setTrustlineVerificando] = useState(false);
  const [trustlineCreando, setTrustlineCreando] = useState(false);
  const [trustlineError, setTrustlineError] = useState("");
  const [sinXlm, setSinXlm] = useState(false);
  const [cuentaInexistente, setCuentaInexistente] = useState(false);

  const verificarTrustline = useCallback(async (address) => {
    if (!address?.startsWith("G")) {
      setTrustlineFalta(false);
      setSinXlm(false);
      setCuentaInexistente(false);
      return;
    }

    setTrustlineVerificando(true);
    setTrustlineError("");
    try {
      const estadoTrustline = await obtenerEstadoTrustlineMXNe(address);
      setTrustlineFalta(estadoTrustline.aplica && !estadoTrustline.tieneTrustline);
      setSinXlm(estadoTrustline.aplica && !estadoTrustline.tieneTrustline && !estadoTrustline.xlmSuficiente);
      setCuentaInexistente(estadoTrustline.aplica && !estadoTrustline.cuentaExiste);
    } catch (err) {
      console.warn("No se pudo verificar trustline MXNe:", err);
      setTrustlineFalta(false);
    } finally {
      setTrustlineVerificando(false);
    }
  }, []);

  const conectarDireccion = useCallback((address) => {
    setDireccion(address);
    setEstado("conectado");
    onConectado?.(address);
    verificarTrustline(address);
  }, [onConectado, verificarTrustline]);

  useEffect(() => {
    if (!autoConectar) return;
    (async () => {
      try {
        const address = await getConnectedAddress();
        if (address) conectarDireccion(address);
      } catch (err) {
        console.warn("No se pudo restaurar la sesión:", err);
      }
    })();
  }, [autoConectar, conectarDireccion]);

  async function conectarConPasskey() {
    setEstado("verificando"); setError("");
    try {
      const rpId = window.location.hostname === "localhost" ? "localhost" : window.location.hostname;
      let res;
      try {
        res = await passkeyKit.connectWallet({ rpId });
      } catch (err) {
        if (err.name === "NotAllowedError" || err.message?.includes("no credential")) {
          res = await passkeyKit.createWallet("Bimex", "usuario-bimex", { rpId });
          setNuevaPasskey(true);
        } else {
          throw err;
        }
      }
      conectarDireccion(res.contractId);
    } catch (e) {
      setError(e.message || "Error al autenticar con biometría");
      setEstado("error");
    }
  }

  async function conectar() {
    setEstado("verificando");
    setError("");
    try {
      const address = await openWalletModal();
      if (!address) {
        setEstado("inactivo");
        return;
      }

      if (address.length < 10) {
        setError("No se pudo obtener la dirección de la wallet. Intenta de nuevo.");
        setEstado("error");
        return;
      }

      conectarDireccion(address);
    } catch (e) {
      setError(parsearError(e));
      setEstado("error");
    }
  }

  async function habilitarTrustlineMXNe() {
    if (!direccion) return;
    setTrustlineCreando(true);
    setTrustlineError("");
    try {
      await crearTrustlineMXNe(direccion);
      setTrustlineFalta(false);
      setSinXlm(false);
      setCuentaInexistente(false);
    } catch (e) {
      const mensaje = parsearError(e);
      setTrustlineError(mensaje);
      if (e?.message?.includes("op_underfunded") || mensaje.toLowerCase().includes("insuficiente")) {
        setSinXlm(true);
      }
    } finally {
      setTrustlineCreando(false);
    }
  }

  const bannerTrustline = trustlineFalta && !inNavbar && (
    <div style={estilosBanner.banner} role="region" aria-labelledby="trustline-banner-title">
      <p id="trustline-banner-title" style={estilosBanner.titulo}>
        {t("wallet.trustlineMissing")}
      </p>
      <p style={estilosBanner.desc}>
        {t("wallet.trustlineDesc", { reserve: RESERVA_XLM_POR_TRUSTLINE })}
      </p>

      {cuentaInexistente ? (
        <p style={estilosBanner.desc}>
          {t("wallet.trustlineNoAccount")}
          {CONFIG.NETWORK !== "mainnet" && (
            <>
              {" "}
              <a
                href={urlFriendbot(direccion)}
                target="_blank"
                rel="noreferrer"
                style={estilosBanner.link}
              >
                {t("wallet.trustlineFriendbot")}
              </a>
            </>
          )}
        </p>
      ) : sinXlm ? (
        <p style={estilosBanner.desc}>
          {CONFIG.NETWORK === "mainnet"
            ? t("wallet.trustlineNoXlmMainnet")
            : t("wallet.trustlineNoXlmTestnet")}
        </p>
      ) : (
        <button
          type="button"
          onClick={habilitarTrustlineMXNe}
          disabled={trustlineCreando || trustlineVerificando}
          className="btn btn-primary"
          style={{ padding: "8px 16px", fontSize: "0.84rem", opacity: trustlineCreando ? 0.7 : 1 }}
        >
          {trustlineCreando ? t("wallet.trustlineAdding") : t("wallet.trustlineAdd")}
        </button>
      )}

      {trustlineError && <p style={estilosBanner.error}>{trustlineError}</p>}
    </div>
  );

  if (estado === "conectado") return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--navy-dim)",
        border: "1.5px solid rgba(30,58,95,0.20)",
        padding: inNavbar ? "6px 14px" : "10px 18px",
        borderRadius: 99,
        width: "fit-content"
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: trustlineFalta ? "var(--amber)" : "var(--green)", flexShrink: 0,
        }} />
        <span style={{ fontFamily: "monospace", fontSize: inNavbar ? 12 : 14, color: "var(--navy)", fontWeight: 600 }}>
          {direccion && direccion.length >= 8 ? `${direccion.slice(0, 4)}…${direccion.slice(-4)}` : direccion}
        </span>
      </div>
      {nuevaPasskey && !inNavbar && (
        <p style={{ color: "var(--amber)", fontSize: "0.82rem", margin: 0, padding: "10px", background: "var(--card)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", maxWidth: 320 }}>
          <strong>{t("wallet.passkeyNoteLabel")}</strong> {t("wallet.passkeyNote")}
        </p>
      )}
      {bannerTrustline}
    </div>
  );

  const verificando = estado === "verificando";

  if (inNavbar) {
    return (
      <button
        onClick={conectar}
        disabled={verificando}
        className="btn btn-primary"
        style={{ padding: "8px 20px", fontSize: "0.84rem", opacity: verificando ? 0.65 : 1 }}
      >
        {verificando ? t("wallet.connecting") : t("wallet.connect")}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", width: "100%" }}>
        <button
          onClick={conectarConPasskey}
          disabled={verificando}
          className="btn btn-primary"
          style={{ flex: 1, padding: "14px 20px", fontSize: "0.95rem", opacity: verificando ? 0.65 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--navy)" }}
        >
          <Fingerprint size={18} />
          {verificando ? t("wallet.connecting") : t("wallet.passkey")}
        </button>
        <button
          onClick={conectar}
          disabled={verificando}
          className="btn btn-primary"
          style={{ flex: 1, padding: "14px 20px", fontSize: "0.95rem", opacity: verificando ? 0.65 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Wallet size={18} />
          {verificando ? t("wallet.connecting") : t("wallet.connect")}
        </button>
      </div>

      {estado === "error" && (
        <p style={{ color: "var(--error, #DC2626)", fontSize: "0.82rem", margin: 0 }}>{error}</p>
      )}
    </div>
  );
}
