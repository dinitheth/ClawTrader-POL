import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config({ path: './server/.env' });

const RPC_URL = process.env.VITE_RPC_URL || 'https://rpc-amoy.polygon.technology';
const PRIVATE_KEY = process.env.TRADING_WALLET_PRIVATE_KEY;
const CLAW_SWAP_ADDRESS = '0xd9362A0d7420ff8cDb6Cb93a23B224B4e95671c5';
const CLAW_TOKEN_ADDRESS = '0x9b5e9a452617ac8e9c280edf0a50cb089a456981';

const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

async function fundContract() {
    if (!PRIVATE_KEY) {
        console.error('TRADING_WALLET_PRIVATE_KEY not found in server/.env');
        return;
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const claw = new ethers.Contract(CLAW_TOKEN_ADDRESS, ERC20_ABI, wallet);

    console.log(`Wallet address: ${wallet.address}`);

    try {
        const decimals = await claw.decimals();
        const balance = await claw.balanceOf(wallet.address);
        console.log(`Wallet CLAW Balance: ${ethers.formatUnits(balance, decimals)} CLAW`);

        // Fund with 50 Million CLAW
        const fundAmount = ethers.parseUnits('50000000', decimals);

        if (balance < fundAmount) {
            console.error(`Insufficient balance to fund. Have ${ethers.formatUnits(balance, decimals)}, need 50,000,000`);
            return;
        }

        console.log(`Funding ClawSwap contract ${CLAW_SWAP_ADDRESS} with 50,000,000 CLAW...`);

        const tx = await claw.transfer(CLAW_SWAP_ADDRESS, fundAmount, {
            maxPriorityFeePerGas: ethers.parseUnits('40', 'gwei'),
            maxFeePerGas: ethers.parseUnits('80', 'gwei')
        });

        console.log(`Transaction sent: ${tx.hash}`);
        console.log('Waiting for confirmation...');

        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

        const newBalance = await claw.balanceOf(CLAW_SWAP_ADDRESS);
        console.log(`New ClawSwap CLAW Balance: ${ethers.formatUnits(newBalance, decimals)} CLAW`);

    } catch (error) {
        console.error('Error funding contract:', error);
    }
}

fundContract();
