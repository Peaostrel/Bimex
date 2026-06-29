
import {
  Contract,
  rpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  Keypair,
  Account,
  Asset,
  Operation,
  Horizon,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import { PasskeyKit } from "passkey-kit";
import { signWithWalletKit } from "./walletKit.js";
import { formatearMXNe } from "../utils/formato.js";

// ─── Configuración ────────────────────────────────────────────────────────────

const _network = import.meta.env.VITE_NETWORK ?? "testnet";
const _isMainnet = _network === "mainnet";

export const CONFIG = {
  CONTRACT_ID: (import.meta.env.VITE_CONTRACT_ID ?? "CC5WJJMGXIGJLDTAM4F5WFA6PHREJP2ARB5Y5IGZJKIWYCFJ36SDD43J").trim(),
  RPC_URL: import.meta.env.VITE_RPC_URL ?? "https://soroban-testnet.stellar.org",
  NETWORK_PASSPHRASE: _isMainnet ? Networks.PUBLIC : Networks.TESTNET,
  NETWORK: _network,
  TOKEN_MXNE: import.meta.env.VITE_TOKEN_MXNE ?? (
    _isMainnet
      ? "CAPW7JXJ6H6SGJ5MVM25356FAYOVT3ICZUIZRT4KGZHLUNMTWNMUI3RM"  // MXNe Mainnet (issuer: brale.xyz)
      : "CDDIGHPVTW4PSCQCU67NQ4NXZ4NX5GDLNL3O67WT5RQ4GT6RXIEYPC4P"  // MXNe Testnet
  ),
  MXNE_ISSUER: import.meta.env.VITE_MXNE_ISSUER ?? (
    _isMainnet
      ? "GAGNDTCBZ2UH63SYGRZU22KHVQ6AEFX26HAKWT7A5MWVLBQDQT2R46LC"
      : "GC6IME5MGROG3EYQL6I6DYH2V4GUFQNJAYAMWO2XBC4BREMTZB42JJWK"
  ),
  HORIZON_URL: import.meta.env.VITE_HORIZON_URL ?? (
    _isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org"
  ),
  // Tasas reales en producción (bps): 945 = 9.45% CETES, 400 = 4% AMM
  // Tasas demo en testnet: 5000000 / 2000000 (~10 MXNe/min por 16K)
  YIELD_CETES_BPS: _isMainnet ? 945 : 5000000,
  YIELD_AMM_BPS:   _isMainnet ? 400 : 2000000,
};

// URL pública en stellar.expert para verificar contratos, cuentas o transacciones
export function urlExplorer(tipo, valor) {
  return `https://stellar.expert/explorer/${_isMainnet ? "public" : "testnet"}/${tipo}/${valor}`;
}

// ─── Servidor RPC ─────────────────────────────────────────────────────────────

const servidor = new rpc.Server(CONFIG.RPC_URL, { allowHttp: false });
// Cuenta ficticia para simulaciones de lectura (no necesita existir en la red)
const CUENTA_DUMMY = Keypair.random().publicKey();

export const passkeyKit = new PasskeyKit({
  rpcUrl: CONFIG.RPC_URL,
  networkPassphrase: CONFIG.NETWORK_PASSPHRASE,
  walletWasmHash: import.meta.env.VITE_PASSKEY_WASM_HASH,
});

// Enviar TX vía Launchtube (gas sponsor)
async function enviarPorLaunchtube(txXdrBase64) {
  console.log("Enviando TX a Launchtube para fee sponsorship...", txXdrBase64);
  const token = import.meta.env.VITE_LAUNCHTUBE_JWT || localStorage.getItem("launchtube_jwt") || "";
  const url = import.meta.env.VITE_LAUNCHTUBE_URL || "https://testnet.launchtube.xyz";
  const res = await fetch(`${url.replace(/\/$/, "")}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ xdr: txXdrBase64 })
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error en Launchtube: ${errorText}`);
  }
  const data = await res.json();
  return { hash: data.hash || data.txHash || data.id };
}

// ─── Utilidades internas ──────────────────────────────────────────────────────

function dirAScVal(direccion) {
  return new Address(direccion).toScVal();
}

async function simularLectura(metodo, args = []) {
  const contrato = new Contract(CONFIG.CONTRACT_ID);
  let cuentaInfo;
  try {
    cuentaInfo = await servidor.getAccount(CUENTA_DUMMY);
  } catch {
    cuentaInfo = new Account(CUENTA_DUMMY, "0");
  }

  const tx = new TransactionBuilder(cuentaInfo, {
    fee: BASE_FEE,
    networkPassphrase: CONFIG.NETWORK_PASSPHRASE,
  })
    .addOperation(contrato.call(metodo, ...args))
    .setTimeout(300)
    .build();

  const resultado = await servidor.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(resultado)) {
    throw new Error(`Error en '${metodo}': ${resultado.error}`);
  }
  if (rpc.Api.isSimulationRestore(resultado)) {
    throw new Error(`El contrato requiere restauración de TTL. Contacta al administrador.`);
  }
  if (!resultado.result?.retval) {
    throw new Error(`'${metodo}' no devolvió valor`);
  }

  return scValToNative(resultado.result.retval);
}

async function construirTx(cuentaPublica, metodo, args = []) {
  const contrato = new Contract(CONFIG.CONTRACT_ID);
  
  let cuentaInfo;
  try {
    cuentaInfo = await servidor.getAccount(cuentaPublica);
  } catch {
    // Si la cuenta es un smart wallet y no está inicializada en red, simulamos
    cuentaInfo = new Account(cuentaPublica, "0");
  }

  const tx = new TransactionBuilder(cuentaInfo, {
    fee: "1000000",
    networkPassphrase: CONFIG.NETWORK_PASSPHRASE,
  })
    .addOperation(contrato.call(metodo, ...args))
    .setTimeout(300)
    .build();

  return servidor.prepareTransaction(tx);
}

async function firmarYEnviar(txPreparada, cuentaPublica) {
  let envioHash;

  if (cuentaPublica.startsWith("C")) {
    const txFirmada = await passkeyKit.sign(txPreparada);
    try {
      const res = await enviarPorLaunchtube(txFirmada.toXDR());
      envioHash = res.hash;
    } catch (err) {
      throw new Error(`Launchtube rechazó la transacción: ${err.message}`, { cause: err });
    }
  } else {
    const signedTxXdr = await signWithWalletKit(txPreparada, cuentaPublica);

    if (!signedTxXdr) {
      throw new Error("Wallet no devolvió una transacción firmada.");
    }

    const txFirmada = TransactionBuilder.fromXDR(signedTxXdr, CONFIG.NETWORK_PASSPHRASE);
    const envio = await servidor.sendTransaction(txFirmada);

    if (envio.status === "ERROR") {
      const motivo = envio.errorResult
        ? envio.errorResult.toXDR("base64")
        : "desconocido";
      throw new Error(`La transacción fue rechazada por la red. Detalle: ${motivo}`);
    }

    if (!envio.hash) {
      throw new Error(`La red no aceptó la transacción (status: ${envio.status}). Intenta de nuevo.`);
    }
    envioHash = envio.hash;
  }

  let intentos = 0;
  while (intentos < 20) {
    await new Promise((r) => setTimeout(r, 2000));
    const estado = await servidor.getTransaction(envioHash);
    if (estado.status === rpc.Api.GetTransactionStatus.SUCCESS) return estado;
    if (estado.status === rpc.Api.GetTransactionStatus.FAILED) {
      const xdrFallo = estado.resultXdr ? estado.resultXdr.toXDR("base64") : envioHash;
      throw new Error(`La transacción falló en la red. XDR: ${xdrFallo}`);
    }
    intentos++;
  }
  throw new Error(`Tiempo de espera agotado. Verifica la TX en el explorador: ${envioHash}`);
}

// ─── Funciones de LECTURA ─────────────────────────────────────────────────────

/** Devuelve el balance de MXNe del usuario en stroops (BigInt) */
export async function obtenerBalanceMXNe(direccion) {
  try {
    const tokenContrato = new Contract(CONFIG.TOKEN_MXNE);
    const cuentaDummy = {
      accountId: () => Keypair.random().publicKey(),
      sequenceNumber: () => "0",
      incrementSequenceNumber: () => {},
    };
    const tx = new TransactionBuilder(cuentaDummy, {
      fee: BASE_FEE,
      networkPassphrase: CONFIG.NETWORK_PASSPHRASE,
    })
      .addOperation(tokenContrato.call("balance", new Address(direccion).toScVal()))
      .setTimeout(300)
      .build();
    const resultado = await servidor.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(resultado)) return BigInt(0);
    if (!resultado.result?.retval) return BigInt(0);
    return BigInt(scValToNative(resultado.result.retval) ?? 0);
  } catch {
    return BigInt(0);
  }
}

export async function obtenerTotalProyectos({ propagarError = false } = {}) {
  try {
    const total = await simularLectura("total_proyectos", []);
    return Number(total);
  } catch (error) {
    if (propagarError) throw error;
    return 0;
  }
}

// Soroban codifica enums unitarios como ScvVec de un solo Symbol → scValToNative los devuelve como array ["VariantName"]
// También puede llegar como objeto { VariantName: undefined } o string directo
function decodificarEstado(rawEstado) {
  let nombre;
  if (Array.isArray(rawEstado)) {
    nombre = rawEstado[0];                          // ["EnProgreso"]
  } else if (rawEstado && typeof rawEstado === "object") {
    nombre = Object.keys(rawEstado)[0];             // { EnProgreso: undefined }
  } else if (typeof rawEstado === "string") {
    nombre = rawEstado;                             // "EnProgreso"
  }
  if (nombre === "Liberado")    return "Liberado";
  if (nombre === "Abandonado")  return "Abandonado";
  if (nombre === "EnProgreso")  return "EnProgreso";
  if (nombre === "EnRevision")  return "EnRevision";
  if (nombre === "Rechazado")   return "Rechazado";
  if (nombre === "EtapaInicial") return "EtapaInicial";
  return "EtapaInicial";
}

export async function obtenerProyecto(id) {
  const raw = await simularLectura("obtener_proyecto", [
    nativeToScVal(id, { type: "u32" }),
  ]);

  return {
    id: Number(id),
    dueno: raw.dueno?.toString() ?? "",
    nombre: raw.nombre?.toString() ?? "",
    meta: BigInt(raw.meta ?? 0),
    aportado: BigInt(raw.total_aportado ?? 0),
    yield_entregado: BigInt(raw.yield_entregado ?? 0),
    estado: decodificarEstado(raw.estado),
    timestamp_inicio: Number(raw.timestamp_inicio ?? 0),
    timestamp_vencimiento: Number(raw.timestamp_vencimiento ?? 0),
    tiempo_meses: Number(raw.tiempo_meses ?? 0),
    // Dual-yield
    capital_en_cetes: BigInt(raw.capital_en_cetes ?? 0),
    capital_en_amm: BigInt(raw.capital_en_amm ?? 0),
    yield_cetes_acumulado: BigInt(raw.yield_cetes_acumulado ?? 0),
    yield_amm_acumulado: BigInt(raw.yield_amm_acumulado ?? 0),
    // Verificación documental — CID de IPFS (string) o null si vacío
    doc_hash: raw.doc_cid?.toString() || null,
    // Admin
    motivo_rechazo: raw.motivo_rechazo?.toString() ?? "",
  };
}

export async function calcularYield(idProyecto, direccionBacker) {
  try {
    const raw = await simularLectura("calcular_yield", [
      nativeToScVal(idProyecto, { type: "u32" }),
      dirAScVal(direccionBacker),
    ]);
    return BigInt(raw ?? 0);
  } catch {
    return BigInt(0);
  }
}

export async function obtenerAportacion(idProyecto, direccionBacker) {
  try {
    const raw = await simularLectura("obtener_aportacion", [
      nativeToScVal(idProyecto, { type: "u32" }),
      dirAScVal(direccionBacker),
    ]);
    return BigInt(raw?.cantidad ?? 0);
  } catch {
    return BigInt(0);
  }
}

export async function calcularYieldDetallado(idProyecto) {
  try {
    const raw = await simularLectura("calcular_yield_detallado", [
      nativeToScVal(idProyecto, { type: "u32" }),
    ]);
    return {
      cetes: BigInt(raw?.cetes ?? 0),
      amm:   BigInt(raw?.amm   ?? 0),
      total: BigInt(raw?.total ?? 0),
    };
  } catch {
    return { cetes: BigInt(0), amm: BigInt(0), total: BigInt(0) };
  }
}

export async function obtenerEstadoCapital(idProyecto) {
  try {
    const raw = await simularLectura("estado_capital", [
      nativeToScVal(idProyecto, { type: "u32" }),
    ]);
    return {
      en_cetes: BigInt(raw?.en_cetes ?? 0),
      en_amm:   BigInt(raw?.en_amm   ?? 0),
      total:    BigInt(raw?.total    ?? 0),
    };
  } catch {
    return { en_cetes: BigInt(0), en_amm: BigInt(0), total: BigInt(0) };
  }
}

export async function obtenerTodosLosProyectos({ propagarError = false } = {}) {
  const total = await obtenerTotalProyectos({ propagarError });
  if (total === 0) return [];
  const resultados = await Promise.allSettled(
    Array.from({ length: total }, (_, i) => obtenerProyecto(i))
  );
  const proyectos = resultados
    .filter((resultado) => resultado.status === "fulfilled" && resultado.value)
    .map((resultado) => resultado.value);

  if (propagarError && proyectos.length === 0 && resultados.some((resultado) => resultado.status === "rejected")) {
    throw new Error("No se pudieron cargar los proyectos desde Stellar.");
  }

  return proyectos;
}

// ─── Funciones de ESCRITURA ───────────────────────────────────────────────────

export async function crearProyecto(direccion, nombre, metaMXNe, docCid, tiempoMeses) {
  const tx = await construirTx(direccion, "crear_proyecto", [
    dirAScVal(direccion),
    nativeToScVal(nombre, { type: "string" }),
    nativeToScVal(metaMXNe, { type: "i128" }),
    nativeToScVal(docCid, { type: "string" }),
    nativeToScVal(Number(tiempoMeses), { type: "u32" }),
  ]);
  return firmarYEnviar(tx, direccion);
}

export async function retiroAnticipado(direccion, idProyecto) {
  const tx = await construirTx(direccion, "retiro_anticipado", [
    dirAScVal(direccion),
    nativeToScVal(idProyecto, { type: "u32" }),
  ]);
  return firmarYEnviar(tx, direccion);
}

export async function contribuir(direccion, idProyecto, cantidadMXNe) {
  const tx = await construirTx(direccion, "contribuir", [
    dirAScVal(direccion),
    nativeToScVal(idProyecto, { type: "u32" }),
    nativeToScVal(cantidadMXNe, { type: "i128" }),
  ]);
  return firmarYEnviar(tx, direccion);
}

export async function abandonarProyecto(direccion, idProyecto) {
  const tx = await construirTx(direccion, "abandonar_proyecto", [
    nativeToScVal(idProyecto, { type: "u32" }),
  ]);
  return firmarYEnviar(tx, direccion);
}

export async function solicitarContinuar(direccion, idProyecto) {
  const tx = await construirTx(direccion, "solicitar_continuar", [
    dirAScVal(direccion),
    nativeToScVal(idProyecto, { type: "u32" }),
  ]);
  return firmarYEnviar(tx, direccion);
}

export async function retirarPrincipal(direccion, idProyecto) {
  const tx = await construirTx(direccion, "retirar_principal", [
    dirAScVal(direccion),
    nativeToScVal(idProyecto, { type: "u32" }),
  ]);
  return firmarYEnviar(tx, direccion);
}

export async function aprobarProyecto(direccion, idProyecto) {
  const tx = await construirTx(direccion, "admin_aprobar", [
    nativeToScVal(idProyecto, { type: "u32" }),
  ]);
  return firmarYEnviar(tx, direccion);
}

export async function rechazarProyecto(direccion, idProyecto, motivo) {
  const tx = await construirTx(direccion, "admin_rechazar", [
    nativeToScVal(idProyecto, { type: "u32" }),
    nativeToScVal(motivo, { type: "string" }),
  ]);
  return firmarYEnviar(tx, direccion);
}

export async function reclamarYield(direccion, idProyecto) {
  const tx = await construirTx(direccion, "reclamar_yield", [
    nativeToScVal(idProyecto, { type: "u32" }),
  ]);
  return firmarYEnviar(tx, direccion);
}

// ─── Faucet — TESTNET ONLY — delegates to indexer API ─────────────────────

const FAUCET_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// ─── Trustline MXNe (cuentas clásicas G...) ───────────────────────────────────

const RESERVA_XLM_POR_TRUSTLINE = 0.5;

function esCuentaClasica(direccion) {
  return typeof direccion === "string" && direccion.startsWith("G");
}

function cuentaTieneTrustlineMXNe(cuenta) {
  return cuenta.balances.some(
    (balance) =>
      balance.asset_type !== "native" &&
      balance.asset_code === "MXNE" &&
      balance.asset_issuer === CONFIG.MXNE_ISSUER
  );
}

function calcularXlmRequeridoParaTrustline(subentryCount = 0) {
  const minActual = (2 + subentryCount) * RESERVA_XLM_POR_TRUSTLINE;
  return minActual + RESERVA_XLM_POR_TRUSTLINE;
}

function obtenerBalanceNativo(cuenta) {
  const nativo = cuenta.balances.find((balance) => balance.asset_type === "native");
  return nativo ? parseFloat(nativo.balance) : 0;
}

async function cargarCuentaHorizon(direccion) {
  const horizon = new Horizon.Server(CONFIG.HORIZON_URL);
  try {
    return await horizon.loadAccount(direccion);
  } catch (err) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

/** Consulta Horizon para saber si la cuenta ya tiene trustline al asset MXNe. */
export async function tieneTrustlineMXNe(direccion) {
  if (!esCuentaClasica(direccion)) return true;

  const cuenta = await cargarCuentaHorizon(direccion);
  if (!cuenta) return false;
  return cuentaTieneTrustlineMXNe(cuenta);
}

/** Estado detallado para la UI de trustline (XLM, existencia de cuenta, etc.). */
export async function obtenerEstadoTrustlineMXNe(direccion) {
  if (!esCuentaClasica(direccion)) {
    return {
      aplica: false,
      tieneTrustline: true,
      cuentaExiste: true,
      xlmSuficiente: true,
      balanceXlm: null,
      xlmRequerido: null,
    };
  }

  const cuenta = await cargarCuentaHorizon(direccion);
  if (!cuenta) {
    return {
      aplica: true,
      tieneTrustline: false,
      cuentaExiste: false,
      xlmSuficiente: false,
      balanceXlm: 0,
      xlmRequerido: calcularXlmRequeridoParaTrustline(0),
    };
  }

  const tieneTrustline = cuentaTieneTrustlineMXNe(cuenta);
  const balanceXlm = obtenerBalanceNativo(cuenta);
  const xlmRequerido = calcularXlmRequeridoParaTrustline(cuenta.subentry_count ?? 0);

  return {
    aplica: true,
    tieneTrustline,
    cuentaExiste: true,
    xlmSuficiente: balanceXlm >= xlmRequerido,
    balanceXlm,
    xlmRequerido,
  };
}

/** Construye, firma y envía changeTrust para habilitar MXNe en la cuenta del usuario. */
export async function crearTrustlineMXNe(direccion) {
  if (!esCuentaClasica(direccion)) {
    throw new Error("Las Smart Wallets no usan trustlines clásicas.");
  }

  const estado = await obtenerEstadoTrustlineMXNe(direccion);
  if (estado.tieneTrustline) return { yaExistia: true };
  if (!estado.cuentaExiste) {
    throw new Error("op_no_account");
  }
  if (!estado.xlmSuficiente) {
    throw new Error("op_underfunded");
  }

  const horizon = new Horizon.Server(CONFIG.HORIZON_URL);
  const cuenta = await horizon.loadAccount(direccion);
  const asset = new Asset("MXNE", CONFIG.MXNE_ISSUER);

  const tx = new TransactionBuilder(cuenta, {
    fee: BASE_FEE,
    networkPassphrase: CONFIG.NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset, limit: "922337203685.4775807" }))
    .setTimeout(300)
    .build();

  const signedTxXdr = await signWithWalletKit(tx, direccion);

  if (!signedTxXdr) {
    throw new Error("Wallet no devolvió una transacción firmada.");
  }

  const txFirmada = TransactionBuilder.fromXDR(signedTxXdr, CONFIG.NETWORK_PASSPHRASE);
  const resultado = await horizon.submitTransaction(txFirmada);
  return { yaExistia: false, hash: resultado.hash };
}

export function urlFriendbot(direccion) {
  return `https://friendbot.stellar.org?addr=${encodeURIComponent(direccion)}`;
}

export async function mintearMXNePrueba(direccionDestino) {
  if (CONFIG.NETWORK_PASSPHRASE !== Networks.TESTNET) {
    throw new Error("mintearMXNePrueba solo está disponible en Testnet.");
  }

  const res = await fetch(`${FAUCET_API_URL}/faucet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destino: direccionDestino }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Faucet request falló");
  return data.cantidad;
}

// ─── Verificación documental ──────────────────────────────────────────────────

/**
 * Genera el hash bundle SHA-256 de los tres documentos requeridos.
 * Los archivos NUNCA salen del dispositivo — solo se sube el hash a la cadena.
 * @param {File} ine          - Identificación oficial (imagen o PDF)
 * @param {File} plan         - Plan del proyecto (PDF)
 * @param {File} presupuesto  - Presupuesto detallado (PDF)
 * @returns {Promise<Uint8Array>} Hash bundle de 32 bytes
 */
export async function hashearDocumentos(ine, plan, presupuesto) {
  async function sha256Archivo(archivo) {
    const buffer = await archivo.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return new Uint8Array(digest);
  }

  const [h1, h2, h3] = await Promise.all([
    sha256Archivo(ine),
    sha256Archivo(plan),
    sha256Archivo(presupuesto),
  ]);

  // Concatenar los tres hashes de 32 bytes → 96 bytes → un único hash final
  const combinado = new Uint8Array(96);
  combinado.set(h1, 0);
  combinado.set(h2, 32);
  combinado.set(h3, 64);

  const bundleDigest = await crypto.subtle.digest("SHA-256", combinado);
  return new Uint8Array(bundleDigest);
}

// ─── Helpers de formato ───────────────────────────────────────────────────────

export function stroopsAMXNe(stroops) {
  return `${formatearMXNe(stroops)} MXNe`;
}

export function mxneAStroops(mxne) {
  return BigInt(Math.round(Number(mxne) * 10_000_000));
}
