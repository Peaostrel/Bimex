import { Keypair } from '@stellar/stellar-sdk';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_WALLET = Keypair.random().publicKey(); // Genera una wallet G... válida fresca en cada test

async function runTest() {
  console.log(`Starting Rate Limit Integration Test for wallet: ${TEST_WALLET}`);

  for (let i = 1; i <= 4; i++) {
    console.log(`\n--- Request ${i} ---`);
    const res = await fetch(`${API_URL}/faucet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destino: TEST_WALLET })
    });

    const body = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Body:`, body);

    if (i <= 3) {
      if (res.status === 429) {
        console.error(`❌ Request ${i} should NOT be rate limited.`);
        process.exit(1);
      } else {
        console.log(`✅ Request ${i} passed rate limiter.`);
      }
    } else if (i === 4) {
      if (res.status === 429) {
        console.log(`✅ Request 4 correctly returned 429.`);
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) {
          console.log(`✅ Retry-After header present: ${retryAfter}`);
        } else {
          console.error(`❌ Missing Retry-After header.`);
          process.exit(1);
        }
      } else {
        console.error(`❌ Request 4 should have been rate limited (returned ${res.status}).`);
        process.exit(1);
      }
    }
  }

  console.log('\n✅ All tests passed.');
}

runTest().catch(console.error);
