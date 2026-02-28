// deploy-vault-v2.mjs — deploy AgentVaultV2 with real bytecode
import { readFileSync } from 'fs';
import { ethers } from 'ethers';

const RPC = process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy.drpc.org';
const PK = process.env.TRADING_WALLET_PRIVATE_KEY;
const USDC = '0xb045a5a95b592d701ce39100f4866a1168abd331';
const DEX = '0xe531866c621248dc7c098cedbdb1977562f96bf5';

if (!PK) { console.error('No TRADING_WALLET_PRIVATE_KEY in .env'); process.exit(1); }

const bytecode = readFileSync('scripts/AgentVaultV2.bytecode', 'utf8').trim();
const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);

console.log('Deployer:', wallet.address);
const bal = await provider.getBalance(wallet.address);
console.log('MATIC balance:', ethers.formatEther(bal));

// ABI for constructor only
const ABI = ['constructor(address _usdc, address _dex)'];
const factory = new ethers.ContractFactory(ABI, bytecode, wallet);

console.log('\n🚀 Deploying AgentVaultV2...');
const contract = await factory.deploy(USDC, DEX, {
    maxPriorityFeePerGas: BigInt(30_000_000_000),
    maxFeePerGas: BigInt(60_000_000_000),
});
console.log('Tx hash:', contract.deploymentTransaction().hash);
console.log('Waiting for confirmation...');
await contract.waitForDeployment();
const addr = await contract.getAddress();
console.log('\n✅ AgentVaultV2 deployed at:', addr);
console.log('\nUpdate these files:');
console.log('  server/trading-server.js  → AGENT_VAULT_V2:', addr);
console.log('  src/lib/contracts.ts      → AGENT_VAULT.address:', addr);
