import { StellarWalletsKit, FreighterModule, WalletNetwork } from "@creit.tech/stellar-wallets-kit";
import { CONFIG } from "./contrato.js";

const _isMainnet = CONFIG.NETWORK === "mainnet";

let kit = null;

function initializeKit() {
  if (kit) return kit;

  const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
  const modules = [new FreighterModule()];

  if (wcProjectId) {
    import("@creit.tech/stellar-wallets-kit/modules/walletconnect.module").then(({ WalletConnectModule }) => {
      kit.setWallet && modules.push(new WalletConnectModule({ projectId: wcProjectId, name: "Bimex" }));
    }).catch(() => {});
  }

  kit = new StellarWalletsKit({
    network: _isMainnet ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET,
    selectedWalletId: "freighter",
    modules,
  });

  return kit;
}

export function getWalletKit() {
  return initializeKit();
}

export async function openWalletModal() {
  const walletKit = getWalletKit();

  return new Promise((resolve) => {
    walletKit.openModal({
      onWalletSelected: async (option) => {
        walletKit.setWallet(option.id);
        localStorage.setItem("lastWallet", option.id);
        try {
          const { address } = await walletKit.getAddress();
          resolve(address || null);
        } catch {
          resolve(null);
        }
      },
      onClosed: () => resolve(null),
    });
  });
}

export async function getConnectedAddress() {
  const walletKit = getWalletKit();
  const lastWalletId = localStorage.getItem("lastWallet");
  if (!lastWalletId) return null;

  walletKit.setWallet(lastWalletId);
  try {
    const { address } = await walletKit.getAddress({ skipRequestAccess: true });
    return address || null;
  } catch {
    localStorage.removeItem("lastWallet");
    return null;
  }
}

export async function signWithWalletKit(tx, address) {
  const walletKit = getWalletKit();
  const lastWalletId = localStorage.getItem("lastWallet");
  if (lastWalletId) walletKit.setWallet(lastWalletId);

  const { signedTxXdr } = await walletKit.signTransaction(tx.toXDR(), {
    networkPassphrase: CONFIG.NETWORK_PASSPHRASE,
    address,
  });

  return signedTxXdr;
}
