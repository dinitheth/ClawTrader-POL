import { ethers } from 'ethers';

const RPC_URL = 'https://rpc-amoy.polygon.technology';
const CLAW_SWAP_ADDRESS = '0xd9362A0d7420ff8cDb6Cb93a23B224B4e95671c5';
const CLAW_TOKEN_ADDRESS = '0x9b5e9a452617ac8e9c280edf0a50cb089a456981';

const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
];

async function checkBalances() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const claw = new ethers.Contract(CLAW_TOKEN_ADDRESS, ERC20_ABI, provider);

    try {
        const balance = await claw.balanceOf(CLAW_SWAP_ADDRESS);
        const decimals = await claw.decimals();
        const formatted = ethers.formatUnits(balance, decimals);

        console.log(`ClawSwap Contract: ${CLAW_SWAP_ADDRESS}`);
        console.log(`CLAW Token Balance: ${formatted} CLAW`);

        if (balance === 0n) {
            console.log('WARNING: The swap contract has 0 CLAW tokens. Users cannot swap USDC for CLAW.');
        }
    } catch (error) {
        console.error('Error checking balance:', error);
    }
}

checkBalances();
