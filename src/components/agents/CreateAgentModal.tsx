import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bot, Shuffle, Sparkles, Loader2, Lock, CheckCircle, XCircle, Flame } from 'lucide-react';
import sql from '@/lib/db';
import { agentService } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { CONTRACTS, AGENT_FACTORY_ABI } from '@/lib/contracts';
import { keccak256, encodePacked } from 'viem';

interface CreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  onAgentCreated?: () => void;
}

const AVATARS = ['🦞', '🦈', '🐙', '🐺', '🦇', '🐂', '🧠', '⚡', '🦾', '👁️', '🔥', '💀', '🌀', '🎯', '⚔️'];

const NAME_PREFIXES = ['ALPHA', 'OMEGA', 'VOID', 'NEON', 'CYBER', 'DARK', 'QUANTUM', 'APEX', 'STORM', 'IRON'];
const NAME_SUFFIXES = ['HUNTER', 'CLAW', 'TRADER', 'WOLF', 'BULL', 'SHARK', 'NET', 'GRIP', 'STRIKE', 'BLADE'];

// Default DNA values for all new agents
const DEFAULT_DNA = {
  personality: 'adaptive',
  riskTolerance: 50,
  aggression: 50,
  patternRecognition: 50,
  timingSensitivity: 50,
  contrarianBias: 50,
  deceptionSkill: 15,
  allianceTendency: 50,
  betrayalThreshold: 30,
  canSelfModify: false,
};

const FACTORY_ADDRESS = CONTRACTS.AGENT_FACTORY.address;

// Personality index mapping (matches on-chain contract)
const PERSONALITY_INDEX: Record<string, number> = {
  aggressive: 0, cautious: 1, deceptive: 2, adaptive: 3, chaotic: 4, calculating: 5,
};

const CreateAgentModal = ({ isOpen, onClose, profileId, onAgentCreated }: CreateAgentModalProps) => {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [isLoading, setIsLoading] = useState(false);
  const [txStep, setTxStep] = useState<'idle' | 'signing' | 'confirming' | 'saving'>('idle');

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🦞');
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);

  // Debounced unique name check
  useEffect(() => {
    const upperName = name.trim().toUpperCase();
    if (!upperName || upperName.length < 2) {
      setNameAvailable(null);
      return;
    }
    setIsCheckingName(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await sql`SELECT id FROM agents WHERE LOWER(name) = LOWER(${upperName}) LIMIT 1`;
        setNameAvailable(rows.length === 0);
      } catch {
        setNameAvailable(null);
      } finally {
        setIsCheckingName(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [name]);

  const generateRandomName = () => {
    const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
    const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
    setName(`${prefix} ${suffix}`);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Please enter an agent name', variant: 'destructive' });
      return;
    }
    if (nameAvailable === false) {
      toast({ title: 'Name Taken', description: 'This agent name is already in use. Choose a unique name.', variant: 'destructive' });
      return;
    }

    if (!isConnected || !address) {
      toast({ title: 'Wallet Required', description: 'Please connect your wallet to create an agent on-chain', variant: 'destructive' });
      return;
    }

    const personalityIndex = PERSONALITY_INDEX[DEFAULT_DNA.personality];

    // Generate a deterministic bytes32 ID from agent name + timestamp + address
    const agentId = keccak256(
      encodePacked(
        ['string', 'address', 'uint256'],
        [name.toUpperCase(), address, BigInt(Date.now())]
      )
    );

    setIsLoading(true);
    setTxStep('signing');

    try {
      // ═══ Step 1: On-chain transaction via AgentFactory ═══
      const txHash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: AGENT_FACTORY_ABI,
        functionName: 'createAgent',
        args: [
          agentId,
          name.toUpperCase(),
          avatar,
          personalityIndex,
          BigInt(DEFAULT_DNA.riskTolerance),
          BigInt(DEFAULT_DNA.aggression),
          BigInt(DEFAULT_DNA.patternRecognition),
          BigInt(DEFAULT_DNA.timingSensitivity),
          BigInt(DEFAULT_DNA.contrarianBias),
        ],
        // Polygon Amoy requires minimum 30 gwei priority fee
        maxPriorityFeePerGas: BigInt(30_000_000_000), // 30 gwei
        maxFeePerGas: BigInt(60_000_000_000),          // 60 gwei
      });

      setTxStep('confirming');

      // Wait for on-chain confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      // ═══ Step 2: Save to Supabase (off-chain DB) ═══
      setTxStep('saving');

      await agentService.create({
        owner_id: profileId,
        name: name.toUpperCase(),
        avatar,
        personality: DEFAULT_DNA.personality as any,
        dna_risk_tolerance: DEFAULT_DNA.riskTolerance / 100,
        dna_aggression: DEFAULT_DNA.aggression / 100,
        dna_pattern_recognition: DEFAULT_DNA.patternRecognition / 100,
        dna_timing_sensitivity: DEFAULT_DNA.timingSensitivity / 100,
        dna_contrarian_bias: DEFAULT_DNA.contrarianBias / 100,
        deception_skill: DEFAULT_DNA.deceptionSkill / 100,
        alliance_tendency: DEFAULT_DNA.allianceTendency / 100,
        betrayal_threshold: DEFAULT_DNA.betrayalThreshold / 100,
        can_self_modify: DEFAULT_DNA.canSelfModify,
        balance: 500,
      });

      toast({
        title: '🎉 Agent Created On-Chain!',
        description: `${name} is live! Hit Upgrade to evolve traits with $CLAW.`,
      });
      onAgentCreated?.();
      onClose();
    } catch (error: any) {
      console.error('Error creating agent:', error);

      let errorMsg = 'Failed to create agent';
      if (error?.message?.includes('User rejected')) {
        errorMsg = 'Transaction was rejected by wallet';
      } else if (error?.message?.includes('already exists')) {
        errorMsg = 'An agent with this name already exists on-chain';
      } else if (error?.message?.includes('insufficient funds')) {
        errorMsg = 'Insufficient MATIC for gas fees';
      }

      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
      setTxStep('idle');
    }
  };

  const getButtonLabel = () => {
    switch (txStep) {
      case 'signing': return 'Sign Transaction...';
      case 'confirming': return 'Confirming On-Chain...';
      case 'saving': return 'Saving Agent Data...';
      default: return 'Create Agent On-Chain';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[420px] bg-card border-border p-0">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 font-display text-base">
              <Bot className="w-5 h-5 text-primary" />
              Create AI Trading Agent
            </DialogTitle>
            <DialogDescription className="text-xs">
              Choose a name and avatar. Your agent starts with default traits.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Identity Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">Identity</h3>
              <button onClick={generateRandomName} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                <Shuffle className="w-3 h-3" /> Random
              </button>
            </div>

            {/* Avatar picker */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Avatar</Label>
              <div className="grid grid-cols-8 gap-1">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAvatar(a)}
                    className={`w-8 h-8 rounded-md text-lg flex items-center justify-center transition-all ${avatar === a
                      ? 'bg-primary/20 ring-2 ring-primary shadow-lg shadow-primary/20'
                      : 'bg-muted/40 hover:bg-muted/70'
                      }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Name input */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Agent Name (must be unique)</Label>
              <div className="relative">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="APEX HUNTER"
                  className={`font-display text-sm uppercase h-9 pr-8 ${nameAvailable === false ? 'border-destructive focus-visible:ring-destructive' :
                    nameAvailable === true ? 'border-accent focus-visible:ring-accent' : ''
                    }`}
                />
                {name.trim().length >= 2 && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {isCheckingName ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    ) : nameAvailable === true ? (
                      <CheckCircle className="w-3.5 h-3.5 text-accent" />
                    ) : nameAvailable === false ? (
                      <XCircle className="w-3.5 h-3.5 text-destructive" />
                    ) : null}
                  </div>
                )}
              </div>
              {nameAvailable === false && (
                <p className="text-[9px] text-destructive">This name is already taken. Choose a unique name.</p>
              )}
            </div>
          </div>

          {/* Default Traits Info */}
          <div className="space-y-2">
            <h3 className="font-display font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">Default Traits</h3>
            <div className="p-3 rounded-lg bg-muted/20 border border-border/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Personality</span>
                <span className="font-display font-semibold">Adaptive</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Strategy DNA</span>
                <span className="font-display font-semibold">Balanced (50%)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Experimental</span>
                <span className="font-display font-semibold">Off</span>
              </div>
            </div>

            {/* CLAW upgrade hint */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
              </div>
              <p className="text-[10px] text-orange-300/90 leading-tight">
                <span className="font-semibold">Want custom traits?</span> Burn $CLAW to upgrade your agent's Personality, Strategy DNA & Experimental traits — no token launch needed.
              </p>
            </div>
          </div>

          {/* On-chain indicator */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <p className="text-[10px] text-muted-foreground">
              {isConnected
                ? `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)} — Agent will be registered on Polygon Amoy`
                : 'Connect wallet to register agent on-chain'}
            </p>
          </div>

          {/* Create Button */}
          <Button
            onClick={handleCreate}
            disabled={isLoading || !name.trim() || !isConnected || nameAvailable === false || isCheckingName}
            className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 font-display font-semibold h-10 text-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {getButtonLabel()}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Create Agent On-Chain
              </>
            )}
          </Button>
          {!isConnected && (
            <p className="text-[9px] text-destructive text-center">Wallet connection required</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAgentModal;
