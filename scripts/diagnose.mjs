// check-wallet.mjs — check wallet USDC balance and DEX pool status
import { ethers } from 'ethers';

const RPC   = 'https://polygon-amoy.drpc.org';
const USDC  = '0xb045a5a95b592d701ce39100f4866a1168abd331';
const DEX   = '0xe531866c621248dc7c098cedbdb1977562f96bf5';
const tBTC  = '0xebb1df177e9ceb8e95dbd775cf7a1fce51fe7fdd';
const WALLET = '0x1a1adAf0d507b1dd5D8edBc6782f953CaB63152B';

const ERC20 = ['function balanceOf(address) view returns (uint256)', 'function faucet() external'];
const DEX_ABI = [
    'function getPoolBalance(address) view returns (uint256)',
    'function tokenPrices(address) view returns (uint256)',
    'function isTokenSupported(address) view returns (bool)',
    'function getBuyQuote(address tokenOut, uint256 amountIn) view returns (uint256 amountOut, uint256 fee)',
];

const provider = new ethers.JsonRpcProvider(RPC);
const usdc = new ethers.Contract(USDC, ERC20, provider);
const dex  = new ethers.Contract(DEX,  DEX_ABI, provider);

const [walletUSDC, dexUSDC, dextBTC, isBTCSupported, btcPrice] = await Promise.all([
    usdc.balanceOf(WALLET),
    usdc.balanceOf(DEX),
    usdc.balanceOf(tBTC).catch(() => 0n),
    dex.isTokenSupported(tBTC),
    dex.tokenPrices(tBTC),
]);

console.log('=== Wallet Status ===');
console.log('Wallet USDC :', ethers.formatUnits(walletUSDC, 6));

console.log('\n=== SimpleDEX Pool Status ===');
console.log('DEX USDC pool  :', ethers.formatUnits(dexUSDC, 6));
console.log('tBTC supported :', isBTCSupported);
console.log('tBTC price     : $', ethers.formatUnits(btcPrice, 6));

// Try a $100 buy quote
if (isBTCSupported && btcPrice > 0n) {
    try {
        const [out, fee] = await dex.getBuyQuote(tBTC, 100_000_000n); // $100 USDC
        console.log('\n$100 USDC buy quote:');
        console.log('  tBTC out:', ethers.formatUnits(out, 8));
        console.log('  fee     : $', ethers.formatUnits(fee, 6));
    } catch(e) { console.log('Quote failed:', e.shortMessage); }
}

if (walletUSDC < 100_000_000n) {
    console.log('\n⚠️  Wallet USDC < $100. Call faucet to get USDC for the trading wallet.');
}
