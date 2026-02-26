import { useEffect } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { polygonAmoy } from '@/lib/wagmi';

/**
 * Automatically switches the wallet to Polygon Amoy when:
 * 1. The wallet is connected
 * 2. The current chain is NOT Polygon Amoy
 */
export function useAutoSwitchNetwork() {
    const { isConnected, chainId } = useAccount();
    const { switchChain } = useSwitchChain();

    useEffect(() => {
        if (isConnected && chainId !== polygonAmoy.id) {
            switchChain({ chainId: polygonAmoy.id });
        }
    }, [isConnected, chainId, switchChain]);
}
