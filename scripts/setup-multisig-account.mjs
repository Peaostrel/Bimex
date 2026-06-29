#!/usr/bin/env node
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Networks,
  BASE_FEE,
  Account,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";

async function main() {
  const [network, rpcUrl, fundSecret] = process.argv.slice(2);
  if (!network || (network !== "testnet" && network !== "mainnet")) {
    console.error("Uso: node setup-multisig-account.mjs <testnet|mainnet> [rpc_url] [fund_secret]");
    process.exit(1);
  }
  const passphrase = network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
  const defaultRpc = network === "mainnet"
    ? "https://soroban-rpc.mainnet.stellar.org"
    : "https://soroban-testnet.stellar.org";

  const signers = Array.from({ length: 3 }, () => Keypair.random());
  const multisigKp = Keypair.random();

  const out = {
    multisig_address: multisigKp.publicKey(),
    multisig_secret: multisigKp.secret(),
    signers: signers.map((s, i) => ({
      label: `custodio_${i + 1}`,
      public: s.publicKey(),
      secret: s.secret(),
    })),
    threshold: 2,
    network,
  };
  console.log(JSON.stringify(out, null, 2));

  if (fundSecret) {
    const server = new SorobanRpc.Server(rpcUrl || defaultRpc);
    const funderKp = Keypair.fromSecret(fundSecret);
    const funderAcc = await server.getAccount(funderKp.publicKey());

    const fundTx = new TransactionBuilder(funderAcc, {
      fee: BASE_FEE, networkPassphrase: passphrase,
    })
      .addOperation(Operation.createAccount({
        destination: multisigKp.publicKey(),
        startingBalance: network === "mainnet" ? "10" : "100",
      }))
      .setTimeout(30)
      .build();
    fundTx.sign(funderKp);
    const fundResult = await server.sendTransaction(fundTx);
    if (fundResult.status === "ERROR") {
      console.error("Funding failed:", JSON.stringify(fundResult));
      process.exit(1);
    }

    // wait for the tx to complete
    let txStatus;
    for (let i = 0; i < 30; i++) {
      const tx = await server.getTransaction(fundResult.hash);
      if (tx.status === "SUCCESS") { txStatus = tx; break; }
      if (tx.status === "FAILED") { console.error("Funding tx failed"); process.exit(1); }
      await sleep(1000);
    }
    if (!txStatus) { console.error("Funding tx timeout"); process.exit(1); }

    // get the multisig account to read its seq num
    let multisigAcc;
    for (let i = 0; i < 30; i++) {
      try { multisigAcc = await server.getAccount(multisigKp.publicKey()); break; }
      catch { await sleep(1000); }
    }
    if (!multisigAcc) { console.error("Cannot read multisig account"); process.exit(1); }

    // build setOptions: add 3 signers, set thresholds to 2, disable master
    let setupTx = new TransactionBuilder(multisigAcc, {
      fee: BASE_FEE, networkPassphrase: passphrase,
    });
    for (const s of signers) {
      setupTx = setupTx.addOperation(Operation.setOptions({
        signer: { ed25519PublicKey: s.publicKey(), weight: 1 },
      }));
    }
    setupTx = setupTx
      .addOperation(Operation.setOptions({
        lowThreshold: 2, medThreshold: 2, highThreshold: 2,
      }))
      .addOperation(Operation.setOptions({ masterWeight: 0 }))
      .setTimeout(30)
      .build();

    // master key signs (weight 1 >= threshold 1 at pre-tx state)
    setupTx.sign(multisigKp);

    const setupResult = await server.sendTransaction(setupTx);
    console.error(JSON.stringify({ status: setupResult.status, hash: setupResult.hash }));
    if (setupResult.status === "ERROR") {
      console.error("setOptions failed:", setupResult);
      process.exit(1);
    }
    console.error("✓ Multi-sig account configured");
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
main().catch(e => { console.error(e); process.exit(1); });
