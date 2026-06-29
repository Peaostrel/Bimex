import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "../i18n/index.js";
import DetalleProyecto from "../components/DetalleProyecto.jsx";
import {
  calcularYield,
  obtenerAportacion,
  obtenerBalanceMXNe,
  obtenerProyecto,
} from "../stellar/contrato";

vi.mock("../stellar/contrato", () => ({
  CONFIG: {
    YIELD_CETES_BPS: 5000000,
    YIELD_AMM_BPS: 2000000,
  },
  contribuir: vi.fn(),
  retirarPrincipal: vi.fn(),
  retiroAnticipado: vi.fn(),
  reclamarYield: vi.fn(),
  abandonarProyecto: vi.fn(),
  solicitarContinuar: vi.fn(),
  obtenerAportacion: vi.fn(),
  calcularYield: vi.fn(),
  obtenerProyecto: vi.fn(),
  obtenerBalanceMXNe: vi.fn(),
  mxneAStroops: vi.fn((mxne) => BigInt(Math.round(Number(mxne) * 10_000_000))),
  stroopsAMXNe: vi.fn((stroops) => {
    const value = Number(stroops ?? 0) / 10_000_000;
    return `${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXNe`;
  }),
}));

const DIRECCION = "GBACKER000000000000000000000000000000000000000000000";

function proyecto(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    nombre: overrides.nombre ?? "Huerto Comunitario",
    descripcion: "Alimentos para familias",
    estado: overrides.estado ?? "EnProgreso",
    dueno: overrides.dueno ?? "GOWNER0000000000000000000000000000000000000000000000",
    meta: overrides.meta ?? 1_000_000_000n,
    aportado: overrides.aportado ?? 250_000_000n,
    yield_entregado: 0n,
    timestamp_inicio: 0,
    timestamp_vencimiento: 0,
    tiempo_meses: 12,
    capital_en_cetes: 0n,
    capital_en_amm: 0n,
    doc_hash: "cid1|cid2|cid3",
    ...overrides,
  };
}

function renderDetalle() {
  return render(
    <MemoryRouter initialEntries={["/proyectos/1"]}>
      <I18nextProvider i18n={i18n}>
        <Routes>
          <Route
            path="/proyectos/:id"
            element={
              <DetalleProyecto
                direccion={DIRECCION}
                onCerrar={vi.fn()}
                onError={vi.fn()}
                onToast={vi.fn()}
              />
            }
          />
        </Routes>
      </I18nextProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("es");
  obtenerAportacion.mockResolvedValue(0n);
  calcularYield.mockResolvedValue(0n);
  obtenerBalanceMXNe.mockResolvedValue(10_000_000_000n);
});

afterEach(() => {
  cleanup();
});

describe("DetalleProyecto", () => {
  it("muestra el nombre del proyecto y la meta", async () => {
    obtenerProyecto.mockResolvedValueOnce(proyecto());

    renderDetalle();

    expect(
      await screen.findByRole("heading", { name: "Huerto Comunitario", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("100.00 MXNe").length).toBeGreaterThan(0);
  });

  it("calcula y muestra la proyección de rendimiento para el inversor", async () => {
    obtenerProyecto.mockResolvedValueOnce(proyecto());

    renderDetalle();

    await screen.findByRole("heading", { name: "Huerto Comunitario", level: 1 });
    await userEvent.type(screen.getByPlaceholderText("Ej. 10,000"), "1200");

    expect(screen.getByText("$1,200 MXN")).toBeInTheDocument();
    expect(screen.getByText("$60 MXN")).toBeInTheDocument();
    expect(screen.getByText("$72 MXN")).toBeInTheDocument();
    expect(screen.getByText("$1,260 MXN")).toBeInTheDocument();
  });

  it("muestra el ramp y tutorial de SPEI cuando el balance es menor a 100 MXNe", async () => {
    obtenerProyecto.mockResolvedValueOnce(proyecto());
    obtenerBalanceMXNe.mockResolvedValueOnce(0n);

    renderDetalle();

    await screen.findByRole("heading", { name: "Huerto Comunitario", level: 1 });

    expect(screen.getByText("¿No tienes MXNe? Consíguelos aquí")).toBeInTheDocument();
    expect(screen.getByText("Completa el KYC directamente con Etherfuse.")).toBeInTheDocument();
    expect(screen.getByText("Deposita MXN desde tu banco vía SPEI a la CLABE indicada.")).toBeInTheDocument();
    expect(screen.getByText("Etherfuse envía MXNe directamente a tu wallet Stellar.")).toBeInTheDocument();
    expect(screen.getByText("Regresa a Bimex y aporta MXNe al proyecto.")).toBeInTheDocument();
    expect(screen.getByText(/Banco → SPEI → MXNe → Bimex/)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /obtener aquí/i });
    expect(link).toHaveAttribute("href", "https://app.etherfuse.com/ramp");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("usa fallback seguro si el balance MXNe viene null", async () => {
    obtenerProyecto.mockResolvedValueOnce(proyecto());
    obtenerBalanceMXNe.mockResolvedValueOnce(null);

    renderDetalle();

    await screen.findByRole("heading", { name: "Huerto Comunitario", level: 1 });

    expect(screen.getByText("¿No tienes MXNe? Consíguelos aquí")).toBeInTheDocument();
  });

  it("no permite contribuir cuando el proyecto ya está liberado", async () => {
    obtenerProyecto.mockResolvedValueOnce(proyecto({ estado: "Liberado" }));

    renderDetalle();

    await screen.findByRole("heading", { name: "Huerto Comunitario", level: 1 });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /confirmar inversión/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText("Ej. 10,000")).not.toBeInTheDocument();
  });
});
