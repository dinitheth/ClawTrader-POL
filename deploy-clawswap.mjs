import { ethers } from 'ethers';
import fs from 'fs';

const RPC_URL = process.env.VITE_RPC_URL || 'https://rpc-amoy.polygon.technology';
const PRIVATE_KEY = process.env.TRADING_WALLET_PRIVATE_KEY;
const EXPECTED_USDC = '0xb045a5a95b592d701ce39100f4866a1168abd331';
const EXPECTED_CLAW = '0x9b5e9a452617ac8e9c280edf0a50cb089a456981';

async function deployAndFund() {
    if (!PRIVATE_KEY) {
        console.error('TRADING_WALLET_PRIVATE_KEY not passed in env');
        return;
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // 1. Load ClawSwap artifact
    const artifactPath = './out/ClawSwap.sol/ClawSwap.json';
    if (!fs.existsSync(artifactPath)) {
        console.error('Artifact not found at', artifactPath);
        return;
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const abi = artifact.abi;
    const bytecode = artifact.bytecode.object;

    console.log(`Deploying ClawSwap from ${wallet.address}...`);

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    // Deploy with max gas fees for Amoy
    const contract = await factory.deploy(EXPECTED_USDC, EXPECTED_CLAW, {
        maxPriorityFeePerGas: ethers.parseUnits('40', 'gwei'),
        maxFeePerGas: ethers.parseUnits('80', 'gwei')
    });

    await contract.waitForDeployment();
    const address = await contract.getAddress();

    console.log(`✅ ClawSwap deployed to: ${address}`);

    // 2. Fund with 50M CLAW
    const clawAbi = [
        'function transfer(address to, uint256 amount) returns (bool)',
        'function decimals() view returns (uint8)'
    ];
    const claw = new ethers.Contract(EXPECTED_CLAW, clawAbi, wallet);
    const decimals = await claw.decimals();
    const fundAmount = ethers.parseUnits('50000000', decimals);

    console.log(`Funding new ClawSwap with 50,000,000 CLAW...`);
    const tx = await claw.transfer(address, fundAmount, {
        maxPriorityFeePerGas: ethers.parseUnits('40', 'gwei'),
        maxFeePerGas: ethers.parseUnits('80', 'gwei')
    });

    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log(`✅ Liquidity provision complete. You can now swap!`);
}

deployAndFund();
