import { ethers } from 'ethers';

const RPC_URL = process.env.VITE_RPC_URL || 'https://rpc-amoy.polygon.technology';
const PRIVATE_KEY = process.env.TRADING_WALLET_PRIVATE_KEY;
const CLAW_SWAP_ADDRESS = '0xc4370E1f7BD49B37F75495020e820c2bdDC46FED';
const CLAW_TOKEN_ADDRESS = '0x9b5e9a452617ac8e9c280edf0a50cb089a456981';

async function fund() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const clawAbi = [
        'function transfer(address to, uint256 amount) returns (bool)',
        'function decimals() view returns (uint8)'
    ];
    const claw = new ethers.Contract(CLAW_TOKEN_ADDRESS, clawAbi, wallet);
    const decimals = await claw.decimals();
    // We only have ~39M left, sending 30M
    const fundAmount = ethers.parseUnits('30000000', decimals);

    console.log(`Funding new ClawSwap ${CLAW_SWAP_ADDRESS} with 30,000,000 CLAW...`);
    const tx = await claw.transfer(CLAW_SWAP_ADDRESS, fundAmount, {
        maxPriorityFeePerGas: ethers.parseUnits('40', 'gwei'),
        maxFeePerGas: ethers.parseUnits('80', 'gwei')
    });

    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log(`✅ Liquidity provision complete. You can now swap!`);
}

fund();
