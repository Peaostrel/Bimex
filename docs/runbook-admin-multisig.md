# Runbook: Admin Multi-Sig

## Arquitectura

```
Cuenta multi-sig (master weight = 0)
  ├── Signer 1 (weight 1) — Custodio 1 (hardware wallet)
  ├── Signer 2 (weight 1) — Custodio 2 (hardware wallet)
  └── Signer 3 (weight 1) — Custodio 3 (hardware wallet)
Threshold: 2-of-3
```

## 1. Crear cuenta multi-sig en Testnet

```bash
# Opcion A: automatico (genera keys + funde + configura setOptions)
bash scripts/setup-multisig-admin.sh testnet --fund S...ADMIN_SECRET

# Opcion B: solo generar keys (dry-run)
bash scripts/setup-multisig-admin.sh testnet
```

Esto genera un JSON con:
- `multisig_address` — direccion de la cuenta multi-sig
- `multisig_secret` — secreto de la cuenta (master key, weight=0, no usable solo)
- `signers[].secret` — 3 secrets para distribuir a custodios

**Distribuir los 3 secrets de signer a custodios** (cada uno en su hardware wallet / offline).

## 2. Verificar cuenta multi-sig

```bash
curl https://horizon-testnet.stellar.org/accounts/<multisig_address>
```

Buscar:
- `thresholds.low_threshold` = 2
- `thresholds.med_threshold` = 2
- `thresholds.high_threshold` = 2
- `signers` con 3 entries, weight 1 cada una
- `master_weight` = 0

## 3. Migrar admin del contrato

```bash
export CONTRACT_ID=C...           # Contract ID actual
export ADMIN_SECRET=S...          # Secret del admin actual (clave unica)
export MULTISIG_ADDRESS=G...      # Direccion multi-sig del paso 1

bash scripts/migrate-to-multisig.sh --network testnet
```

## 4. Probar flujo multi-sig (2-of-3)

### 4.1 admin_pausar con multi-sig

Usando `@stellar/stellar-sdk` (Node.js):

```javascript
import { Keypair, TransactionBuilder, Operation, Networks, BASE_FEE, rpc, nativeToScVal, Address } from '@stellar/stellar-sdk';

const server = new rpc.Server('https://soroban-testnet.stellar.org');
const signer1 = Keypair.fromSecret('S...CUSTODIO_1');
const signer2 = Keypair.fromSecret('S...CUSTODIO_2');
const multisig = 'G...MULTISIG_ADDRESS';
const contractId = 'C...';

// build + simulate
const acc = await server.getAccount(multisig);
const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.invokeContractFunction({
    contract: contractId,
    function: 'admin_pausar',
    args: [new Address(multisig).toScVal()],
  }))
  .setTimeout(30)
  .build();

// simulate to get footprint + soroban data
const sim = await server.simulateTransaction(tx);
const prepped = rpc.assembleTransaction(tx, sim);

// sign with 2-of-3 signers
prepped.sign(signer1, signer2);

// submit
const result = await server.sendTransaction(prepped);
console.log('Status:', result.status);
```

### 4.2 Verificar pausa

```bash
stellar contract invoke --id $CONTRACT_ID --source <key> --network testnet -- obtener_proyecto --id 1
# Si pausado, las contribuciones deben fallar
```

### 4.3 admin_reanudar

Mismo flujo que `admin_pausar`, cambiando función a `admin_reanudar`.

## 5. Migrar a Mainnet

Repetir pasos 1-4 en Mainnet:

```bash
bash scripts/setup-multisig-admin.sh mainnet --fund S...ADMIN_SECRET
# verificar
# migrar
bash scripts/migrate-to-multisig.sh --network mainnet
```

## 6. admin_upgrade con multi-sig

Requiere firmas 2-of-3. Mismo flujo que `admin_pausar` pero con `admin_upgrade`:

```javascript
Operation.invokeContractFunction({
  contract: contractId,
  function: 'admin_upgrade',
  args: [
    new Address(multisig).toScVal(),
    new BytesN(32, newWasmHash).toScVal(),
  ],
})
```

> **Importante:** `admin_upgrade` debe coordinarse con auditoría externa. Ver issue #136.

## Seguridad

| Riesgo | Mitigación |
|---|---|
| Key de custodio comprometida | 2-of-3: 1 sola no basta |
| Perder 2 custodios | Backup offline de cada signer |
| admin_pausar lento | Evaluar cuenta separada 1-of-3 solo para pausar |
| Upgrade malicioso | Requiere 2 firmas + auditoría externa |

## Referencias

- [Stellar Multi-Sig Docs](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/multisig)
- [Soroban require_auth](https://developers.stellar.org/docs/soroban/authorization)
- Scripts en `scripts/setup-multisig-admin.sh`, `scripts/migrate-to-multisig.sh`
- Issue #136: Auditoría externa antes de Mainnet
