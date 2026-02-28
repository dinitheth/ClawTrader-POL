// find-add-liquidity.mjs — probe for the actual deposit function on SimpleDEX
import { ethers } from 'ethers';

const RPC = process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy.drpc.org';
const DEX = '0xe531866c621248dc7c098cedbdb1977562f96bf5';
const USDC = '0xb045a5a95b592d701ce39100f4866a1168abd331';
const tBTC = '0xebb1df177e9ceb8e95dbd775cf7a1fce51fe7fdd';
const provider = new ethers.JsonRpcProvider(RPC);

// Try all plausible function signatures as static calls (won't send tx)
const funcs = [
    'function depositLiquidity(address token, uint256 amount) external',
    'function addToken(address token, uint256 initialAmount) external',
    'function seedLiquidity(address token, uint256 amount) external',
    'function setTokenPrice(address token, uint256 price) external',
    'function supportToken(address token, uint256 price) external',
    'function addPoolLiquidity(address token, uint256 amount) external',
    'function injectLiquidity(address token, uint256 amount) external',
    'function fundPool(address token, uint256 amount) external',
];

const WALLET = '0x1a1adAf0d507b1dd5D8edBc6782f953CaB63152B';

for (const fn of funcs) {
    const iface = new ethers.Interface([fn]);
    const name = fn.split('(')[0].replace('function ', '');
    try {
        const data = iface.encodeFunctionData(name, [USDC, 1n]);
        await provider.estimateGas({ from: WALLET, to: DEX, data });
        console.log(`✅ FOUND: ${name}()`);
    } catch (e) {
        const msg = e.message || '';
        if (msg.includes('require') || msg.includes('revert') || msg.includes('0x')) {
            console.log(`✅ EXISTS (reverted - need approval): ${name}()`);
        } else {
            console.log(`❌ not found: ${name}`);
        }
    }
}
