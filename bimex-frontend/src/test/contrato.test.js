import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoadAccount = vi.fn();
const mockSubmitTransaction = vi.fn();
const mockSignTransaction = vi.fn();

vi.mock('@stellar/stellar-sdk', () => ({
  Contract: vi.fn(),
  Networks: { TESTNET: 'Test SDF Network ; September 2015', PUBLIC: 'Public Global Stellar Network ; September 2015' },
  rpc: {
    Server: vi.fn(),
    Api: {
      isSimulationError: vi.fn(() => false),
      isSimulationRestore: vi.fn(() => false),
      GetTransactionStatus: { SUCCESS: 'SUCCESS', FAILED: 'FAILED' },
    },
  },
  TransactionBuilder: Object.assign(
    vi.fn().mockImplementation(function TransactionBuilder() {
      return {
        addOperation: vi.fn().mockReturnThis(),
        setTimeout: vi.fn().mockReturnThis(),
        build: vi.fn(() => ({ toXDR: () => 'unsigned-xdr' })),
      };
    }),
    { fromXDR: vi.fn(() => ({ signed: true })) },
  ),
  BASE_FEE: '100',
  Address: vi.fn(),
  Keypair: { random: vi.fn(() => ({ publicKey: () => 'GABC123' })), fromSecret: vi.fn() },
  Asset: vi.fn(),
  Operation: { changeTrust: vi.fn() },
  Horizon: {
    Server: class MockHorizonServer {
      constructor() {}
      loadAccount = mockLoadAccount;
      submitTransaction = mockSubmitTransaction;
    },
  },
  nativeToScVal: vi.fn(),
  scValToNative: vi.fn(),
}));

vi.mock('@stellar/freighter-api', () => ({
  signTransaction: (...args) => mockSignTransaction(...args),
  isConnected: vi.fn(),
  isAllowed: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  setAllowed: vi.fn(),
}));

vi.mock('passkey-kit', () => ({
  PasskeyKit: class { sign = vi.fn() }
}));

import {
  stroopsAMXNe,
  mxneAStroops,
  tieneTrustlineMXNe,
  obtenerEstadoTrustlineMXNe,
  crearTrustlineMXNe,
  urlFriendbot,
} from '../stellar/contrato.js';

describe('stroopsAMXNe', () => {
  it('converts 10_000_000 stroops to a string containing "1" and "MXNe"', () => {
    const result = stroopsAMXNe(BigInt(10_000_000));
    expect(result).toContain('1');
    expect(result).toContain('MXNe');
  });

  it('converts 0 stroops to a string containing "0" and "MXNe"', () => {
    const result = stroopsAMXNe(BigInt(0));
    expect(result).toContain('0');
    expect(result).toContain('MXNe');
  });

  it('converts 15_000_000 stroops to a string containing "1.5" or "1,5" and "MXNe"', () => {
    const result = stroopsAMXNe(BigInt(15_000_000));
    expect(result).toMatch(/1[.,]5[0-9]*\s+MXNe/);
  });

  it('returns a string type', () => {
    expect(typeof stroopsAMXNe(BigInt(10_000_000))).toBe('string');
  });

  it('converts 100_000_000 stroops to contain "10" and "MXNe"', () => {
    const result = stroopsAMXNe(BigInt(100_000_000));
    expect(result).toContain('10');
    expect(result).toContain('MXNe');
  });
});

describe('mxneAStroops', () => {
  it('converts 1 MXNe to 10_000_000 stroops as BigInt', () => {
    expect(mxneAStroops(1)).toBe(BigInt(10_000_000));
  });

  it('converts 0 MXNe to 0 stroops as BigInt', () => {
    expect(mxneAStroops(0)).toBe(BigInt(0));
  });

  it('converts 1.5 MXNe to 15_000_000 stroops as BigInt', () => {
    expect(mxneAStroops(1.5)).toBe(BigInt(15_000_000));
  });

  it('converts 100 MXNe to 1_000_000_000 stroops as BigInt', () => {
    expect(mxneAStroops(100)).toBe(BigInt(1_000_000_000));
  });

  it('returns a BigInt type', () => {
    expect(typeof mxneAStroops(1)).toBe('bigint');
  });
});

describe('trustline MXNe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tieneTrustlineMXNe devuelve true para smart wallets C...', async () => {
    await expect(tieneTrustlineMXNe('CABC1234567890WXYZ')).resolves.toBe(true);
    expect(mockLoadAccount).not.toHaveBeenCalled();
  });

  it('tieneTrustlineMXNe detecta trustline existente', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      subentry_count: 1,
      balances: [
        { asset_type: 'native', balance: '10' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'MXNE',
          asset_issuer: 'GC6IME5MGROG3EYQL6I6DYH2V4GUFQNJAYAMWO2XBC4BREMTZB42JJWK',
        },
      ],
    });

    await expect(tieneTrustlineMXNe('GABC1234567890WXYZ')).resolves.toBe(true);
  });

  it('tieneTrustlineMXNe devuelve false sin trustline', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      subentry_count: 0,
      balances: [{ asset_type: 'native', balance: '10' }],
    });

    await expect(tieneTrustlineMXNe('GABC1234567890WXYZ')).resolves.toBe(false);
  });

  it('obtenerEstadoTrustlineMXNe marca cuenta inexistente', async () => {
    mockLoadAccount.mockRejectedValueOnce({ response: { status: 404 } });

    const estado = await obtenerEstadoTrustlineMXNe('GABC1234567890WXYZ');
    expect(estado.cuentaExiste).toBe(false);
    expect(estado.tieneTrustline).toBe(false);
    expect(estado.xlmSuficiente).toBe(false);
  });

  it('obtenerEstadoTrustlineMXNe detecta XLM insuficiente', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      subentry_count: 0,
      balances: [{ asset_type: 'native', balance: '0.5' }],
    });

    const estado = await obtenerEstadoTrustlineMXNe('GABC1234567890WXYZ');
    expect(estado.xlmSuficiente).toBe(false);
    expect(estado.tieneTrustline).toBe(false);
  });

  it('crearTrustlineMXNe lanza op_underfunded sin XLM', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      subentry_count: 0,
      balances: [{ asset_type: 'native', balance: '0.1' }],
    });

    await expect(crearTrustlineMXNe('GABC1234567890WXYZ')).rejects.toThrow('op_underfunded');
  });

  it('crearTrustlineMXNe firma y envía changeTrust', async () => {
    mockLoadAccount
      .mockResolvedValueOnce({
        subentry_count: 0,
        balances: [{ asset_type: 'native', balance: '10' }],
      })
      .mockResolvedValueOnce({
        accountId: () => 'GABC1234567890WXYZ',
        sequenceNumber: () => '1',
      });

    mockSignTransaction.mockResolvedValueOnce({
      signedTxXdr: 'signed-xdr',
      error: null,
    });
    mockSubmitTransaction.mockResolvedValueOnce({ hash: 'trust-hash' });

    const resultado = await crearTrustlineMXNe('GABC1234567890WXYZ');
    expect(resultado.hash).toBe('trust-hash');
    expect(mockSignTransaction).toHaveBeenCalled();
    expect(mockSubmitTransaction).toHaveBeenCalled();
  });

  it('urlFriendbot genera enlace con dirección', () => {
    expect(urlFriendbot('GABC123')).toContain('GABC123');
    expect(urlFriendbot('GABC123')).toContain('friendbot.stellar.org');
  });
});
