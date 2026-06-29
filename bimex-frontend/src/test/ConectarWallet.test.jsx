import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConectarWallet from "../components/ConectarWallet.jsx";
import {
  getAddress,
  getNetwork,
  isAllowed,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";
import "../i18n/index.js";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(),
  isAllowed: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
}));

vi.mock("../stellar/contrato", () => ({
  CONFIG: {
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    NETWORK: "testnet",
  },
  passkeyKit: {
    connectWallet: vi.fn(),
    createWallet: vi.fn(),
  },
  obtenerEstadoTrustlineMXNe: vi.fn(),
  crearTrustlineMXNe: vi.fn(),
  urlFriendbot: vi.fn((addr) => `https://friendbot.stellar.org?addr=${addr}`),
}));

import { obtenerEstadoTrustlineMXNe, crearTrustlineMXNe } from "../stellar/contrato";

beforeEach(() => {
  vi.clearAllMocks();
  isConnected.mockResolvedValue({ isConnected: false });
  isAllowed.mockResolvedValue({ isAllowed: false });
  requestAccess.mockResolvedValue({});
  getNetwork.mockResolvedValue({ networkPassphrase: "Test SDF Network ; September 2015" });
  getAddress.mockResolvedValue({ address: "" });
  obtenerEstadoTrustlineMXNe.mockResolvedValue({
    aplica: true,
    tieneTrustline: true,
    cuentaExiste: true,
    xlmSuficiente: true,
    balanceXlm: 10,
    xlmRequerido: 1,
  });
});

afterEach(() => {
  cleanup();
});

describe("ConectarWallet", () => {
  it("muestra el botón de conexión cuando no hay wallet conectada", () => {
    render(<ConectarWallet autoConectar={false} />);

    expect(screen.getByRole("button", { name: "Freighter" })).toBeInTheDocument();
  });

  it("muestra la dirección truncada cuando ya existe una sesión autorizada", async () => {
    const address = "GABC1234567890WXYZ";
    const onConectado = vi.fn();
    isConnected.mockResolvedValueOnce({ isConnected: true });
    isAllowed.mockResolvedValueOnce({ isAllowed: true });
    getAddress.mockResolvedValueOnce({ address });

    render(<ConectarWallet onConectado={onConectado} />);

    expect(await screen.findByText("GABC…WXYZ")).toBeInTheDocument();
    expect(onConectado).toHaveBeenCalledWith(address);
    expect(obtenerEstadoTrustlineMXNe).toHaveBeenCalledWith(address);
  });

  it("llama onConectado con la dirección al conectar manualmente", async () => {
    const address = "GDEF1234567890QRST";
    const onConectado = vi.fn();
    isConnected.mockResolvedValue({ isConnected: true });
    requestAccess.mockResolvedValue({});
    getNetwork.mockResolvedValue({ networkPassphrase: "Test SDF Network ; September 2015" });
    getAddress.mockResolvedValue({ address });

    render(<ConectarWallet autoConectar={false} onConectado={onConectado} />);

    await userEvent.click(screen.getByRole("button", { name: "Freighter" }));

    await waitFor(() => {
      expect(onConectado).toHaveBeenCalledWith(address);
    });
    expect(screen.getByText("GDEF…QRST")).toBeInTheDocument();
  });

  it("muestra banner cuando falta trustline MXNe", async () => {
    const address = "GABC1234567890WXYZ";
    isConnected.mockResolvedValueOnce({ isConnected: true });
    isAllowed.mockResolvedValueOnce({ isAllowed: true });
    getAddress.mockResolvedValueOnce({ address });
    obtenerEstadoTrustlineMXNe.mockResolvedValueOnce({
      aplica: true,
      tieneTrustline: false,
      cuentaExiste: true,
      xlmSuficiente: true,
      balanceXlm: 5,
      xlmRequerido: 1,
    });

    render(<ConectarWallet autoConectar />);

    expect(await screen.findByText(/enable MXNe on your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enable MXNe/i })).toBeInTheDocument();
  });

  it("no muestra banner cuando ya tiene trustline", async () => {
    const address = "GABC1234567890WXYZ";
    isConnected.mockResolvedValueOnce({ isConnected: true });
    isAllowed.mockResolvedValueOnce({ isAllowed: true });
    getAddress.mockResolvedValueOnce({ address });

    render(<ConectarWallet autoConectar />);

    expect(await screen.findByText("GABC…WXYZ")).toBeInTheDocument();
    expect(screen.queryByText(/enable MXNe on your account/i)).not.toBeInTheDocument();
  });

  it("muestra instrucciones de Friendbot cuando no hay XLM suficiente", async () => {
    const address = "GABC1234567890WXYZ";
    isConnected.mockResolvedValueOnce({ isConnected: true });
    isAllowed.mockResolvedValueOnce({ isAllowed: true });
    getAddress.mockResolvedValueOnce({ address });
    obtenerEstadoTrustlineMXNe.mockResolvedValueOnce({
      aplica: true,
      tieneTrustline: false,
      cuentaExiste: true,
      xlmSuficiente: false,
      balanceXlm: 0.1,
      xlmRequerido: 1,
    });

    render(<ConectarWallet autoConectar />);

    expect(await screen.findByText(/enough XLM/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enable MXNe/i })).not.toBeInTheDocument();
  });

  it("crea trustline al hacer clic en habilitar", async () => {
    const address = "GABC1234567890WXYZ";
    isConnected.mockResolvedValueOnce({ isConnected: true });
    isAllowed.mockResolvedValueOnce({ isAllowed: true });
    getAddress.mockResolvedValueOnce({ address });
    obtenerEstadoTrustlineMXNe.mockResolvedValueOnce({
      aplica: true,
      tieneTrustline: false,
      cuentaExiste: true,
      xlmSuficiente: true,
      balanceXlm: 5,
      xlmRequerido: 1,
    });
    crearTrustlineMXNe.mockResolvedValueOnce({ yaExistia: false, hash: "abc123" });

    render(<ConectarWallet autoConectar />);

    await userEvent.click(await screen.findByRole("button", { name: /Enable MXNe/i }));

    await waitFor(() => {
      expect(crearTrustlineMXNe).toHaveBeenCalledWith(address);
    });
    expect(screen.queryByText(/enable MXNe on your account/i)).not.toBeInTheDocument();
  });
});
