import { ethers } from 'ethers';

const VAULT_V2 = '0x4Dff05F148Ab7DaB7547a81AF78edC1da7603b43';
const SIMPLE_DEX = '0xe531866c621248dc7c098cedbdb1977562f96bf5';
const TEST_BTC = '0xebb1df177e9ceb8e95dbd775cf7a1fce51fe7fdd';
const USDC = '0xb045a5a95b592d701ce39100f4866a1168abd331';
const TRADING_WALLET = '0x1a1adAf0d507b1dd5D8edBc6782f953CaB63152B';
const USER_ADDRESS = process.argv[2] || TRADING_WALLET;
const AGENT_ID = process.argv[3] || null;

const VAULT_ABI = [
    'function getUserAgentBalance(address user, bytes32 agentId) view returns (uint256)',
    'function operator() view returns (address)',
    'function getTokenPosition(address user, bytes32 agentId, address token) view returns (uint256)',
];
const DEX_ABI = ['function getPoolBalance(address token) view returns (uint256)'];
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

function uuidToBytes32(uuid) {
    return '0x' + uuid.replace(/-/g, '').padEnd(64, '0');
}

const provider = new ethers.JsonRpcProvider(
    'https://polygon-amoy.drpc.org',
    { chainId: 80002, name: 'polygon-amoy' },
    { staticNetwork: true }
);
const vault = new ethers.Contract(VAULT_V2, VAULT_ABI, provider);
const dex = new ethers.Contract(SIMPLE_DEX, DEX_ABI, provider);
const usdc = new ethers.Contract(USDC, ERC20_ABI, provider);

async function main() {
    console.log('\n=== CLAWTRADER TRADING DIAGNOSTICS ===\n');

    const operator = await vault.operator();
    const isOp = operator.toLowerCase() === TRADING_WALLET.toLowerCase();
    console.log('VAULT OPERATOR:', operator);
    console.log('TRADING WALLET:', TRADING_WALLET);
    console.log('IS OPERATOR:   ', isOp ? '✅ YES' : '❌ NO — operatorBuy WILL FAIL!');

    const btcPool = await dex.getPoolBalance(TEST_BTC);
    const dexUSDC = await usdc.balanceOf(SIMPLE_DEX);
    const vaultUSDC = await usdc.balanceOf(VAULT_V2);
    const maticBal = await provider.getBalance(TRADING_WALLET);

    console.log('\nDEX tBTC POOL: ', ethers.formatUnits(btcPool, 8), 'tBTC', btcPool > 0n ? '✅' : '❌ EMPTY');
    console.log('DEX USDC BAL:  ', ethers.formatUnits(dexUSDC, 6), 'USDC');
    console.log('VAULT USDC:    ', ethers.formatUnits(vaultUSDC, 6), 'USDC (all agents)');
    console.log('MATIC GAS:     ', ethers.formatEther(maticBal), 'MATIC', maticBal > 0n ? '✅' : '❌ NO GAS!');

    if (AGENT_ID) {
        const b32 = uuidToBytes32(AGENT_ID);
        const bal = await vault.getUserAgentBalance(USER_ADDRESS, b32);
        const pos = await vault.getTokenPosition(USER_ADDRESS, b32, TEST_BTC);
        console.log(`\nAGENT ${AGENT_ID}`);
        console.log('bytes32:        ', b32);
        console.log('USDC IN VAULT:  ', ethers.formatUnits(bal, 6), 'USDC', bal > 0n ? '✅' : '❌ ZERO — BUY WILL BE SKIPPED!');
        console.log('tBTC POSITION:  ', ethers.formatUnits(pos, 8), 'tBTC');
    }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
