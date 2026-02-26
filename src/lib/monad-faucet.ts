// monad-faucet.ts — Faucet now deprecated (Polygon Amoy uses MATIC from official faucet)
// Kept as stub in case legacy code imports it

export interface FaucetRequest {
  walletAddress: string;
  agentId?: string;
}

export interface FaucetResponse {
  success: boolean;
  txHash?: string;
  amount?: string;
  message?: string;
  error?: string;
}

/**
 * @deprecated Use the official Polygon Amoy faucet: https://faucet.polygon.technology/
 */
export async function requestTestnetMON(
  walletAddress: string,
  agentId?: string
): Promise<FaucetResponse> {
  return {
    success: false,
    error: 'Use the official Polygon Amoy faucet: https://faucet.polygon.technology/',
  };
}

export async function checkFaucetEligibility(
  walletAddress: string
): Promise<{ eligible: boolean; nextClaimTime?: Date }> {
  return { eligible: true };
}
