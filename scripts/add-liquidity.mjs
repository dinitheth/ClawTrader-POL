import { ethers } from 'ethers';

const RPC  = 'https://rpc-amoy.polygon.technology';
const PK   = process.env.TRADING_WALLET_PRIVATE_KEY;

const ADDRS = {
    DEX:  '0xe531866c621248dc7c098cedbdb1977562f96bf5',
    tBTC: '0xebb1df177e9ceb8e95dbd775cf7a1fce51fe7fdd',
    tETH: '0x7f3997ec44746e81acbe4a764e49b4d23fbf8fd5',
    tSOL: '0x7bb46e04138aa7b97a731b86899c9b04a5fc964c',
};

const ERC20 = [
    'function balanceOf(address) view returns (uint256)',
    'function approve(address,uint256) external returns (bool)',
    'function faucet() external',
];
const DEX_ABI = [
    'function addLiquidity(address token, uint256 amount) external',
    'function getPoolBalance(address token) external view returns (uint256)',
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(PK, provider);
const dex      = new ethers.Contract(ADDRS.DEX, DEX_ABI, wallet);
const GAS = { maxPriorityFeePerGas: BigInt(30_000_000_000), maxFeePerGas: BigInt(60_000_000_000) };

console.log('Wallet:', wallet.address);

const tokens = [
    { name: 'tBTC', addr: ADDRS.tBTC, decimals: 8,  addAmount: ethers.parseUnits('10000000', 8)  },
    { name: 'tETH', addr: ADDRS.tETH, decimals: 18, addAmount: ethers.parseUnits('10000000', 18) },
    { name: 'tSOL', addr: ADDRS.tSOL, decimals: 9,  addAmount: ethers.parseUnits('10000000', 9)  },
];

for (const tok of tokens) {
    const contract = new ethers.Contract(tok.addr, ERC20, wallet);

    const poolBal   = await dex.getPoolBalance(tok.addr);
    const walletBal = await contract.balanceOf(wallet.address);
    console.log(`\n${tok.name}: pool=${ethers.formatUnits(poolBal, tok.decimals)}, wallet=${ethers.formatUnits(walletBal, tok.decimals)}`);

    if (walletBal < tok.addAmount) {
        console.log(`  📥 Getting ${tok.name} from faucet...`);
        try { const tx = await contract.faucet(GAS); await tx.wait(); console.log('  ✅ Faucet done'); }
        catch(e) { console.log(`  ⚠️  Faucet: ${e.reason || e.message?.slice(0,60)}`); }
    }

    const bal  = await contract.balanceOf(wallet.address);
    const toAdd = bal >= tok.addAmount ? tok.addAmount : bal;
    if (toAdd === 0n) { console.log(`  ⚠️  No ${tok.name} in wallet`); continue; }

    console.log(`  💧 Approving ${ethers.formatUnits(toAdd, tok.decimals)} ${tok.name}...`);
    await (await contract.approve(ADDRS.DEX, toAdd, GAS)).wait();

    console.log(`  💧 Adding to pool...`);
    const tx = await dex.addLiquidity(tok.addr, toAdd, GAS);
    await tx.wait();

    const after = await dex.getPoolBalance(tok.addr);
    console.log(`  ✅ Done! Pool ${tok.name}: ${ethers.formatUnits(after, tok.decimals)} | Tx: ${tx.hash}`);
}

console.log('\n🎉 Pool topped up with 10M of each token!');
