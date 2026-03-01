import { ethers } from 'ethers';

const RPC_URL = 'https://rpc-amoy.polygon.technology';
const CLAW_SWAP_ADDRESS = '0xd9362A0d7420ff8cDb6Cb93a23B224B4e95671c5';
const EXPECTED_USDC = '0xb045a5a95b592d701ce39100f4866a1168abd331';
const EXPECTED_CLAW = '0x9b5e9a452617ac8e9c280edf0a50cb089a456981';

const CLAW_SWAP_ABI = [
    'function usdc() view returns (address)',
    'function claw() view returns (address)',
    'function owner() view returns (address)',
    'function CLAW_PER_USDC_UNIT() view returns (uint256)'
];

async function checkSwapConfig() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const swap = new ethers.Contract(CLAW_SWAP_ADDRESS, CLAW_SWAP_ABI, provider);

    try {
        const usdc = await swap.usdc();
        const claw = await swap.claw();
        const owner = await swap.owner();
        const rate = await swap.CLAW_PER_USDC_UNIT();

        console.log(`ClawSwap Contract: ${CLAW_SWAP_ADDRESS}`);
        console.log(`Configured USDC: ${usdc} (Expected: ${EXPECTED_USDC} -> Match: ${usdc.toLowerCase() === EXPECTED_USDC.toLowerCase()})`);
        console.log(`Configured CLAW: ${claw} (Expected: ${EXPECTED_CLAW} -> Match: ${claw.toLowerCase() === EXPECTED_CLAW.toLowerCase()})`);
        console.log(`Owner: ${owner}`);
        console.log(`Rate multiplier: ${rate.toString()}`);
    } catch (error) {
        console.error('Error checking swap config:', error);
    }
}

checkSwapConfig();
