import { useReadContract, useAccount } from 'wagmi';
import { CONTRACTS, AGENT_VAULT_ABI, uuidToBytes32, isContractConfigured } from '@/lib/contracts';
import { polygonAmoy } from '@/lib/wagmi';

// Old vault address (user may still have funds here)
const OLD_VAULT_ADDRESS = '0xec5945e2d22659fecc4c23269e478fbceb7814ce' as `0x${string}`;

interface UseAgentVaultBalanceOptions {
    agentId: string | null;
    refetchInterval?: number;
}

interface UseAgentVaultBalanceResult {
    balance: number;
    rawBalance: bigint | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    isContractReady: boolean;
    refetch: () => void;
    // Which vault holds the funds
    oldVaultBalance: number;
    newVaultBalance: number;
}

/**
 * Hook to read agent balance from AgentVault smart contracts.
 * Reads from BOTH old vault and new AgentVaultV2 and sums them.
 * This ensures balance shows correctly regardless of migration state.
 */
export function useAgentVaultBalance({
    agentId,
    refetchInterval = 5000
}: UseAgentVaultBalanceOptions): UseAgentVaultBalanceResult {
    const { address, isConnected } = useAccount();

    const isContractReady = isContractConfigured('AGENT_VAULT');
    const agentIdBytes32 = agentId ? uuidToBytes32(agentId) : undefined;
    const enabled = !!address && !!agentId && isConnected;

    // Read balance from NEW AgentVaultV2
    const {
        data: newRawBalance,
        isLoading: isLoadingNew,
        isError: isErrorNew,
        error: errorNew,
        refetch: refetchNew
    } = useReadContract({
        address: CONTRACTS.AGENT_VAULT.address,
        abi: AGENT_VAULT_ABI,
        functionName: 'getUserAgentBalance',
        args: address && agentIdBytes32 ? [address, agentIdBytes32] : undefined,
        chainId: polygonAmoy.id,
        query: {
            enabled,
            refetchInterval,
            refetchOnWindowFocus: true,
        },
    });

    // Also read balance from OLD vault (migration fallback)
    const {
        data: oldRawBalance,
        isLoading: isLoadingOld,
        refetch: refetchOld
    } = useReadContract({
        address: OLD_VAULT_ADDRESS,
        abi: AGENT_VAULT_ABI,
        functionName: 'getUserAgentBalance',
        args: address && agentIdBytes32 ? [address, agentIdBytes32] : undefined,
        chainId: polygonAmoy.id,
        query: {
            enabled,
            refetchInterval,
            refetchOnWindowFocus: true,
        },
    });

    const DECIMALS = CONTRACTS.USDC.decimals;
    const newVaultBalance = newRawBalance ? Number(newRawBalance) / 10 ** DECIMALS : 0;
    const oldVaultBalance = oldRawBalance ? Number(oldRawBalance) / 10 ** DECIMALS : 0;

    // Total balance = old + new vault (covers migration period)
    const balance = newVaultBalance + oldVaultBalance;
    const rawBalance = (newRawBalance ?? 0n) + (oldRawBalance ?? 0n);

    const refetch = () => {
        refetchNew();
        refetchOld();
    };

    return {
        balance,
        rawBalance: rawBalance as bigint,
        isLoading: isLoadingNew || isLoadingOld,
        isError: isErrorNew,
        error: errorNew as Error | null,
        isContractReady,
        refetch,
        oldVaultBalance,
        newVaultBalance,
    };
}
