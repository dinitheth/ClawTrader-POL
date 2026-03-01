import sql from '@/lib/db';
import { createPublicClient, http, formatUnits } from 'viem';
import { CONTRACTS, AGENT_VAULT_ABI } from '@/lib/contracts';

import { polygonAmoy } from 'viem/chains';

// Create a standalone viem client (works without wallet connection)
const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http('https://polygon-amoy.drpc.org'),
});

/** Convert UUID string to bytes32 hex (same logic as trading server) */
function uuidToBytes32(uuid: string): `0x${string}` {
    const hex = uuid.replace(/-/g, '');
    return `0x${hex.padEnd(64, '0')}` as `0x${string}`;
}

export interface OnChainAgentData {
    id: string;
    name: string;
    avatar: string;
    generation: number;
    personality: string;
    created_at: string;
    vaultBalanceUSDC: number;
    startingBalance: number;
    pnlPercent: number;
    sharpeScore: number;
    totalTrades: number;
}

/**
 * Fetch all agents from Neon DB, then read their on-chain vault balances
 * directly from the AgentVault contract using getAgentTotalBalance(bytes32).
 */
export async function fetchOnChainLeaderboard(): Promise<OnChainAgentData[]> {
    // Get all agents from DB
    const agents = await sql`
        SELECT id, name, avatar, generation, personality, created_at, balance, total_matches
        FROM agents
        ORDER BY created_at ASC
    `;

    if (!agents || agents.length === 0) return [];

    // Step 2: Batch-read on-chain balances for all agents
    const results: OnChainAgentData[] = await Promise.all(
        agents.map(async (agent: any) => {
            let vaultBalanceUSDC = 0;

            try {
                const agentIdBytes32 = uuidToBytes32(agent.id);
                const rawBalance = await publicClient.readContract({
                    address: CONTRACTS.AGENT_VAULT.address,
                    abi: AGENT_VAULT_ABI,
                    functionName: 'getAgentTotalBalance',
                    args: [agentIdBytes32],
                });
                // USDC has 6 decimals
                vaultBalanceUSDC = parseFloat(formatUnits(rawBalance as bigint, 6));
            } catch (err) {
                console.warn(`Failed to read vault balance for ${agent.name}:`, err);
            }

            const totalTrades = agent.total_matches || 0;
            // Use DB balance as the initial deposit assumption for metrics. Fallback to 100 if 0 to avoid Infinity.
            const startingBalance = parseFloat(agent.balance) || 100;

            // Calculate metrics
            let pnlPercent = 0;
            if (startingBalance > 0) {
                pnlPercent = ((vaultBalanceUSDC - startingBalance) / startingBalance) * 100;
            }

            // Pseudo-Sharpe Ratio: (PnL% / Volatility)
            // Since we don't have true trade-by-trade volatility, we proxy it.
            // A higher trade count typically implies lower volatility if PnL is positive (consistent), 
            // or higher penalty if PnL is negative.
            // Base volatility proxy = max(5, 20 - totalTrades) i.e. fewer trades = higher proxy volatility (less confident).
            const volatilityProxy = Math.max(5, 20 - totalTrades);
            // Risk-free rate assumed 0 for simplicity.
            const sharpeScore = pnlPercent / volatilityProxy;

            return {
                id: agent.id,
                name: agent.name,
                avatar: agent.avatar,
                generation: agent.generation,
                personality: agent.personality,
                created_at: agent.created_at,
                vaultBalanceUSDC,
                startingBalance,
                pnlPercent,
                sharpeScore,
                totalTrades,
            };
        })
    );

    // Sort by vault balance (highest first) as default
    return results.sort((a, b) => b.vaultBalanceUSDC - a.vaultBalanceUSDC);
}
