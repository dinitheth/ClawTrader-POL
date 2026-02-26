import { http, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { polygonAmoy } from 'wagmi/chains';

// Re-export as the chain the app uses everywhere
export { polygonAmoy };

// Wagmi configuration — Polygon Amoy testnet only
export const config = createConfig({
  chains: [polygonAmoy],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [polygonAmoy.id]: http('https://polygon-amoy.drpc.org'),
  },
});

// Contract ABIs
export const CLAW_TOKEN_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'faucet',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

// Arena Escrow Contract
export const ARENA_ESCROW_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export const ARENA_ESCROW_ABI = [
  {
    name: 'createMatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agent1Id', type: 'bytes32' },
      { name: 'agent2Id', type: 'bytes32' },
      { name: 'wagerAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'matchId', type: 'bytes32' }],
  },
  {
    name: 'settleMatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'matchId', type: 'bytes32' },
      { name: 'winnerId', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;
