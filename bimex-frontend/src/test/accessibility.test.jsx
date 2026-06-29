import { describe, it, expect, vi } from 'vitest';

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
  TransactionBuilder: vi.fn(),
  BASE_FEE: '100',
  Address: vi.fn(),
  Keypair: { random: vi.fn(() => ({ publicKey: () => 'GDUMMY' })), fromSecret: vi.fn() },
  nativeToScVal: vi.fn(),
  scValToNative: vi.fn(),
}));

vi.mock('@stellar/freighter-api', () => ({
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

import { render, waitFor } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import i18n from '../i18n/index.js';
import { getStorage } from '../utils/storage.js';

const storageLocal = getStorage('local');

describe('Accessibility', () => {
  it('updates html lang when the active language changes', async () => {
    storageLocal.removeItem('i18nextLng');
    await act(async () => {
      await i18n.changeLanguage('es');
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(document.documentElement.lang).toBe('es');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en');
    });
  });
});
