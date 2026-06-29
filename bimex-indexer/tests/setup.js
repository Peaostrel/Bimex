// This file runs before ALL tests. It patches env vars for the test environment.
// The key issue: api.js runs `import 'dotenv/config'` which can overwrite our mocked env vars.
// By setting them here (in a setupFile), they exist for all module initializations.
process.env.SUPABASE_URL    = 'https://mock.supabase.co';
process.env.SUPABASE_KEY    = 'mock-anon-key';
process.env.STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.TOKEN_MXNE      = 'CA7QYNF7SOWQ3GLR2BGMZEHXR2YW6GKQJ6LMBSEPAMQ';
// Valid-format Stellar secret key (fake data, passes Keypair.fromSecret format check)
process.env.FAUCET_SECRET   = 'SCZANGBA5IOZSBA4K5NKMQ6MBWCQELZUYFQ3HMVH7VLEP6HWLDM3NAR';
process.env.API_PORT        = '3009';
process.env.FRONTEND_URL    = 'http://localhost:5173';
