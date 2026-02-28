import { ethers } from 'ethers';

const RPC = 'https://polygon-amoy.drpc.org';
const VAULT = '0xec5945e2d22659fecc4c23269e478fbceb7814ce';
const TARGET_OP = '0x1a1adAf0d507b1dd5D8edBc6782f953CaB63152B';
const KEY = process.env.TRADING_WALLET_PRIVATE_KEY;

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(KEY, provider);

const abi = [
  'function operator() view returns (address)',
  'function owner() view returns (address)',
  'function setOperator(address) external',
];
const vault = new ethers.Contract(VAULT, abi, wallet);

const op = await vault.operator();
const owner = await vault.owner();
const bal = await provider.getBalance(wallet.address);

console.log('Wallet:', wallet.address);
console.log('MATIC :', ethers.formatEther(bal));
console.log('Owner :', owner);
console.log('Op now:', op);

if (op.toLowerCase() === TARGET_OP.toLowerCase()) {
  console.log('✅ Operator already correct!');
  process.exit(0);
}

if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
  console.error('❌ This wallet is NOT the owner - cannot call setOperator');
  console.error('   Owner is:', owner);
  process.exit(1);
}

console.log('⚡ Calling setOperator...');
const tx = await vault.setOperator(TARGET_OP, {
  maxPriorityFeePerGas: 30_000_000_000n,
  maxFeePerGas: 60_000_000_000n,
});
console.log('Tx:', tx.hash);
const receipt = await tx.wait();
console.log('✅ Confirmed block:', receipt.blockNumber);
console.log('New operator:', await vault.operator());
