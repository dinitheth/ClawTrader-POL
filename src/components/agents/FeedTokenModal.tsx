import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
    Dna,
    Loader2,
    ArrowRight,
    Flame,
    Zap,
    Brain,
    Shield,
    Skull,
    Shuffle,
    Target,
    Lock,
    Coins,
} from 'lucide-react';
import { agentService, evolutionService } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { CONTRACTS, AGENT_FACTORY_ABI, uuidToBytes32 } from '@/lib/contracts';
import { formatUnits, parseAbi } from 'viem';

// ═══ Constants ═══

const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD' as `0x${string}`;

// CLAW token costs for upgrades
const UPGRADE_COSTS = {
    DNA_PER_10_PERCENT: 100,          // 100 CLAW per +10% on any DNA slider
    PERSONALITY_CHANGE: 500,           // 500 CLAW to change personality
    EXPERIMENTAL_PER_10_PERCENT: 250,  // 250 CLAW per +10% on experimental traits
    SELF_MODIFY_UNLOCK: 1000,          // 1000 CLAW to unlock self-modification
};

const CLAW_ADDRESS = CONTRACTS.CLAW_TOKEN.address;
const CLAW_DECIMALS = CONTRACTS.CLAW_TOKEN.decimals; // 18
const CLAW_SYMBOL = CONTRACTS.CLAW_TOKEN.symbol;
const POLYGON_AMOY_CHAIN_ID = 80002;

const PERSONALITIES = [
    { value: 'aggressive', label: 'Aggressive', icon: Zap, description: 'Bold, high-risk', index: 0 },
    { value: 'cautious', label: 'Cautious', icon: Shield, description: 'Patient, safe', index: 1 },
    { value: 'deceptive', label: 'Deceptive', icon: Skull, description: 'Bluffs & tricks', index: 2 },
    { value: 'adaptive', label: 'Adaptive', icon: Brain, description: 'Evolves live', index: 3 },
    { value: 'chaotic', label: 'Chaotic', icon: Shuffle, description: 'Pure entropy', index: 4 },
    { value: 'calculating', label: 'Calculating', icon: Target, description: 'Pure logic', index: 5 },
];

type DNAKey = 'dna_risk_tolerance' | 'dna_aggression' | 'dna_pattern_recognition' | 'dna_timing_sensitivity' | 'dna_contrarian_bias';

const DNA_LABELS: Record<DNAKey, { label: string; low: string; high: string }> = {
    dna_risk_tolerance: { label: 'Risk Tolerance', low: 'Conservative', high: 'Degen' },
    dna_aggression: { label: 'Aggression', low: 'Passive', high: 'Attack Mode' },
    dna_pattern_recognition: { label: 'Pattern Recognition', low: 'Intuitive', high: 'Pattern God' },
    dna_timing_sensitivity: { label: 'Timing Sensitivity', low: 'YOLO', high: 'Perfect Entry' },
    dna_contrarian_bias: { label: 'Contrarian Bias', low: 'Follow Crowd', high: 'Always Fade' },
};

// Minimal ERC-20 ABI for balance + transfer
const CLAW_ABI = parseAbi([
    'function balanceOf(address account) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
]);

// ═══ Interfaces ═══

interface Agent {
    id: string;
    name: string;
    avatar: string;
    personality: string;
    dna_risk_tolerance: number;
    dna_aggression: number;
    dna_pattern_recognition: number;
    dna_timing_sensitivity: number;
    dna_contrarian_bias: number;
    deception_skill?: number;
    alliance_tendency?: number;
    betrayal_threshold?: number;
    can_self_modify?: boolean;
    mutation_count?: number;
    generation?: number;
}

interface FeedTokenModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agent: Agent;
    onSuccess: () => void;
}

// ═══ Component ═══

export function FeedTokenModal({ open, onOpenChange, agent, onSuccess }: FeedTokenModalProps) {
    const { toast } = useToast();
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const { writeContractAsync } = useWriteContract();

    const [isUpgrading, setIsUpgrading] = useState(false);
    const [txStep, setTxStep] = useState<'idle' | 'burning' | 'confirming' | 'evolving' | 'saving'>('idle');
    const [activeTab, setActiveTab] = useState<'dna' | 'personality' | 'experimental'>('dna');

    // CLAW balance state
    const [clawBalance, setClawBalance] = useState<bigint>(BigInt(0));
    const [isLoadingBalance, setIsLoadingBalance] = useState(false);

    // Upgrade state — track desired new values
    const [newDNA, setNewDNA] = useState<Record<DNAKey, number>>({
        dna_risk_tolerance: agent.dna_risk_tolerance,
        dna_aggression: agent.dna_aggression,
        dna_pattern_recognition: agent.dna_pattern_recognition,
        dna_timing_sensitivity: agent.dna_timing_sensitivity,
        dna_contrarian_bias: agent.dna_contrarian_bias,
    });
    const [newPersonality, setNewPersonality] = useState(agent.personality);
    const [newDeception, setNewDeception] = useState(agent.deception_skill ?? 0.15);
    const [newAlliance, setNewAlliance] = useState(agent.alliance_tendency ?? 0.5);
    const [newBetrayal, setNewBetrayal] = useState(agent.betrayal_threshold ?? 0.3);
    const [newSelfModify, setNewSelfModify] = useState(agent.can_self_modify ?? false);

    // Fetch CLAW balance on Polygon Amoy
    useEffect(() => {
        if (!address || !open || !publicClient) return;

        const fetchBalance = async () => {
            setIsLoadingBalance(true);
            try {
                const balance = await publicClient.readContract({
                    address: CLAW_ADDRESS,
                    abi: CLAW_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                });
                setClawBalance(balance as bigint);
            } catch (err) {
                console.error('Failed to fetch CLAW balance:', err);
                setClawBalance(BigInt(0));
            } finally {
                setIsLoadingBalance(false);
            }
        };

        fetchBalance();
    }, [address, open, publicClient]);

    // ═══ Cost Calculation ═══

    const calculateDNACost = (): number => {
        let totalCost = 0;
        for (const key of Object.keys(DNA_LABELS) as DNAKey[]) {
            const diff = Math.abs(newDNA[key] - agent[key]);
            const steps = diff * 100;
            totalCost += Math.ceil(steps / 10) * UPGRADE_COSTS.DNA_PER_10_PERCENT;
        }
        return totalCost;
    };

    const calculatePersonalityCost = (): number =>
        newPersonality !== agent.personality ? UPGRADE_COSTS.PERSONALITY_CHANGE : 0;

    const calculateExperimentalCost = (): number => {
        let cost = 0;
        const deceptionDiff = Math.abs(newDeception - (agent.deception_skill ?? 0.15));
        const allianceDiff = Math.abs(newAlliance - (agent.alliance_tendency ?? 0.5));
        const betrayalDiff = Math.abs(newBetrayal - (agent.betrayal_threshold ?? 0.3));
        cost += Math.ceil((deceptionDiff * 100) / 10) * UPGRADE_COSTS.EXPERIMENTAL_PER_10_PERCENT;
        cost += Math.ceil((allianceDiff * 100) / 10) * UPGRADE_COSTS.EXPERIMENTAL_PER_10_PERCENT;
        cost += Math.ceil((betrayalDiff * 100) / 10) * UPGRADE_COSTS.EXPERIMENTAL_PER_10_PERCENT;
        if (newSelfModify && !(agent.can_self_modify)) cost += UPGRADE_COSTS.SELF_MODIFY_UNLOCK;
        return cost;
    };

    const totalCost = calculateDNACost() + calculatePersonalityCost() + calculateExperimentalCost();
    const formattedBalance = formatUnits(clawBalance, CLAW_DECIMALS);
    // Convert totalCost (whole CLAW) to wei for comparison
    const burnAmount = BigInt(totalCost) * BigInt(10 ** CLAW_DECIMALS);
    const hasEnoughTokens = clawBalance >= burnAmount;
    const hasChanges = totalCost > 0;

    // ═══ Upgrade Handler ═══

    const handleUpgrade = async () => {
        if (!isConnected || !address) return;
        if (!hasChanges) {
            toast({ title: 'No changes', description: 'Adjust trait sliders to upgrade', variant: 'destructive' });
            return;
        }
        if (!hasEnoughTokens) {
            toast({ title: 'Insufficient CLAW', description: `You need ${totalCost} $CLAW to upgrade`, variant: 'destructive' });
            return;
        }

        setIsUpgrading(true);

        try {
            // ═══ Step 1: Burn CLAW tokens (send to dead address) on Polygon Amoy ═══
            setTxStep('burning');
            const burnTxHash = await writeContractAsync({
                address: CLAW_ADDRESS,
                abi: CLAW_ABI,
                functionName: 'transfer',
                args: [BURN_ADDRESS, burnAmount],
                chainId: POLYGON_AMOY_CHAIN_ID,
            });

            setTxStep('confirming');
            if (publicClient) {
                await publicClient.waitForTransactionReceipt({ hash: burnTxHash });
            }
            console.log('CLAW burned! TX:', burnTxHash);

            // ═══ Step 2: Evolve agent on-chain (AgentFactory on Polygon Amoy) ═══
            setTxStep('evolving');
            const agentIdBytes32 = uuidToBytes32(agent.id);

            const evolveTxHash = await writeContractAsync({
                address: CONTRACTS.AGENT_FACTORY.address,
                abi: AGENT_FACTORY_ABI,
                functionName: 'evolveAgent',
                args: [
                    agentIdBytes32,
                    BigInt(Math.round(newDNA.dna_risk_tolerance * 100)),
                    BigInt(Math.round(newDNA.dna_aggression * 100)),
                    BigInt(Math.round(newDNA.dna_pattern_recognition * 100)),
                    BigInt(Math.round(newDNA.dna_timing_sensitivity * 100)),
                    BigInt(Math.round(newDNA.dna_contrarian_bias * 100)),
                ],
                chainId: POLYGON_AMOY_CHAIN_ID,
            });

            if (publicClient) {
                await publicClient.waitForTransactionReceipt({ hash: evolveTxHash });
            }

            // ═══ Step 3: Update DB (Neon) ═══
            setTxStep('saving');
            await agentService.update(agent.id, {
                personality: newPersonality,
                dna_risk_tolerance: newDNA.dna_risk_tolerance,
                dna_aggression: newDNA.dna_aggression,
                dna_pattern_recognition: newDNA.dna_pattern_recognition,
                dna_timing_sensitivity: newDNA.dna_timing_sensitivity,
                dna_contrarian_bias: newDNA.dna_contrarian_bias,
                deception_skill: newDeception,
                alliance_tendency: newAlliance,
                betrayal_threshold: newBetrayal,
                can_self_modify: newSelfModify,
                mutation_count: (agent.mutation_count || 0) + 1,
            });

            // Log evolution
            await evolutionService.log({
                agent_id: agent.id,
                match_id: null,
                evolution_type: 'claw_feed',
                trigger_reason: `Burned ${totalCost} $CLAW tokens`,
                dna_before: {
                    risk: agent.dna_risk_tolerance,
                    aggression: agent.dna_aggression,
                    pattern: agent.dna_pattern_recognition,
                    timing: agent.dna_timing_sensitivity,
                    contrarian: agent.dna_contrarian_bias,
                },
                dna_after: {
                    risk: newDNA.dna_risk_tolerance,
                    aggression: newDNA.dna_aggression,
                    pattern: newDNA.dna_pattern_recognition,
                    timing: newDNA.dna_timing_sensitivity,
                    contrarian: newDNA.dna_contrarian_bias,
                },
                modification_code: null,
            });

            toast({
                title: '🔥 Agent Upgraded!',
                description: `Burned ${totalCost} $CLAW to evolve ${agent.name}`,
            });

            onSuccess();
            onOpenChange(false);

        } catch (error: any) {
            console.error('Upgrade error:', error);
            const msg = error?.message?.includes('User rejected') || error?.message?.includes('denied')
                ? 'Transaction rejected by wallet'
                : error?.message?.includes('insufficient')
                    ? `Insufficient $CLAW balance`
                    : error?.message?.includes('Not owner')
                        ? 'Only the agent owner can upgrade'
                        : error?.message || 'Upgrade failed';
            toast({ title: 'Upgrade Failed', description: msg, variant: 'destructive' });
        } finally {
            setIsUpgrading(false);
            setTxStep('idle');
        }
    };

    const getStepLabel = () => {
        switch (txStep) {
            case 'burning': return `Burning ${totalCost} $CLAW...`;
            case 'confirming': return 'Confirming burn on Polygon Amoy...';
            case 'evolving': return 'Evolving on-chain...';
            case 'saving': return 'Saving...';
            default: return '';
        }
    };

    // ═══ Render ═══

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[520px] max-h-[85vh] overflow-y-auto bg-card border-border p-0">
                {/* Header */}
                <div className="px-5 pt-5 pb-3 border-b border-border/50">
                    <DialogHeader className="space-y-1">
                        <DialogTitle className="flex items-center gap-2 font-display text-base">
                            <Flame className="w-5 h-5 text-orange-500" />
                            Evolve {agent.avatar} {agent.name}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Burn <span className="text-primary font-semibold">$CLAW</span> to upgrade your agent's traits on Polygon Amoy
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="px-5 py-4 space-y-4">

                    {/* CLAW Balance */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30">
                        <div className="flex items-center gap-2">
                            <Coins className="w-4 h-4 text-orange-400" />
                            <div>
                                <span className="text-xs text-muted-foreground">$CLAW Balance</span>
                                <p className="text-[9px] text-muted-foreground">Polygon Amoy</p>
                            </div>
                        </div>
                        <div className="text-right">
                            {isLoadingBalance ? (
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : (
                                <span className="font-display font-bold text-sm">
                                    {Number(formattedBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-orange-400">$CLAW</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex gap-1 p-0.5 rounded-lg bg-muted/30">
                        {(['dna', 'personality', 'experimental'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-display font-semibold transition-all ${activeTab === tab
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {tab === 'dna' ? '⚡ Strategy DNA' : tab === 'personality' ? '🧠 Personality' : '✨ Experimental'}
                            </button>
                        ))}
                    </div>

                    {/* ═══ Tab Content ═══ */}

                    {/* Strategy DNA Tab */}
                    {activeTab === 'dna' && (
                        <div className="space-y-3">
                            <p className="text-[10px] text-muted-foreground">
                                Cost: <span className="text-primary font-semibold">{UPGRADE_COSTS.DNA_PER_10_PERCENT} $CLAW</span> per +10% change
                            </p>
                            {(Object.keys(DNA_LABELS) as DNAKey[]).map((key) => (
                                <div key={key} className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-medium">{DNA_LABELS[key].label}</span>
                                        <div className="flex items-center gap-1.5">
                                            <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0">
                                                {Math.round(agent[key] * 100)}%
                                            </Badge>
                                            {Math.round(newDNA[key] * 100) !== Math.round(agent[key] * 100) && (
                                                <>
                                                    <ArrowRight className="w-3 h-3 text-orange-400" />
                                                    <Badge className="font-mono text-[9px] px-1.5 py-0 bg-orange-500">
                                                        {Math.round(newDNA[key] * 100)}%
                                                    </Badge>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <Slider
                                        value={[newDNA[key] * 100]}
                                        onValueChange={([val]) => setNewDNA(prev => ({ ...prev, [key]: val / 100 }))}
                                        max={100}
                                        step={1}
                                        className="h-1.5"
                                    />
                                    <div className="flex justify-between text-[8px] text-muted-foreground">
                                        <span>{DNA_LABELS[key].low}</span>
                                        <span>{DNA_LABELS[key].high}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Personality Tab */}
                    {activeTab === 'personality' && (
                        <div className="space-y-3">
                            <p className="text-[10px] text-muted-foreground">
                                Cost: <span className="text-primary font-semibold">{UPGRADE_COSTS.PERSONALITY_CHANGE} $CLAW</span> to change personality
                            </p>
                            <div className="grid grid-cols-3 gap-1.5">
                                {PERSONALITIES.map((p) => (
                                    <button
                                        key={p.value}
                                        onClick={() => setNewPersonality(p.value)}
                                        className={`px-2 py-2 rounded-md border transition-all text-left ${newPersonality === p.value
                                            ? p.value === agent.personality
                                                ? 'bg-primary/15 border-primary/60 ring-1 ring-primary/20'
                                                : 'bg-orange-500/15 border-orange-500/60 ring-1 ring-orange-500/20'
                                            : 'bg-muted/20 border-border/50 hover:bg-muted/40'
                                            }`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <p.icon className="w-3 h-3 flex-shrink-0" />
                                            <span className="font-display text-[11px] font-semibold truncate">{p.label}</span>
                                        </div>
                                        <p className="text-[9px] text-muted-foreground mt-0.5 pl-[18px]">{p.description}</p>
                                        {p.value === agent.personality && (
                                            <Badge variant="outline" className="text-[7px] mt-1 px-1 py-0">Current</Badge>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Experimental Tab */}
                    {activeTab === 'experimental' && (
                        <div className="space-y-3">
                            <p className="text-[10px] text-muted-foreground">
                                Cost: <span className="text-primary font-semibold">{UPGRADE_COSTS.EXPERIMENTAL_PER_10_PERCENT} $CLAW</span> per +10% change
                            </p>

                            {/* Deception */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium">Deception</span>
                                    <div className="flex items-center gap-1.5">
                                        <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0">
                                            {Math.round((agent.deception_skill ?? 0.15) * 100)}%
                                        </Badge>
                                        {Math.round(newDeception * 100) !== Math.round((agent.deception_skill ?? 0.15) * 100) && (
                                            <>
                                                <ArrowRight className="w-3 h-3 text-orange-400" />
                                                <Badge className="font-mono text-[9px] px-1.5 py-0 bg-orange-500">
                                                    {Math.round(newDeception * 100)}%
                                                </Badge>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <Slider value={[newDeception * 100]} onValueChange={([v]) => setNewDeception(v / 100)} max={100} step={1} className="h-1.5 [&_[role=slider]]:bg-secondary" />
                                <div className="flex justify-between text-[8px] text-muted-foreground"><span>Honest</span><span>Bluffer</span></div>
                            </div>

                            {/* Alliance */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium">Alliance</span>
                                    <div className="flex items-center gap-1.5">
                                        <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0">
                                            {Math.round((agent.alliance_tendency ?? 0.5) * 100)}%
                                        </Badge>
                                        {Math.round(newAlliance * 100) !== Math.round((agent.alliance_tendency ?? 0.5) * 100) && (
                                            <>
                                                <ArrowRight className="w-3 h-3 text-orange-400" />
                                                <Badge className="font-mono text-[9px] px-1.5 py-0 bg-orange-500">
                                                    {Math.round(newAlliance * 100)}%
                                                </Badge>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <Slider value={[newAlliance * 100]} onValueChange={([v]) => setNewAlliance(v / 100)} max={100} step={1} className="h-1.5 [&_[role=slider]]:bg-secondary" />
                                <div className="flex justify-between text-[8px] text-muted-foreground"><span>Lone Wolf</span><span>Team</span></div>
                            </div>

                            {/* Betrayal */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium">Betrayal</span>
                                    <div className="flex items-center gap-1.5">
                                        <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0">
                                            {Math.round((agent.betrayal_threshold ?? 0.3) * 100)}%
                                        </Badge>
                                        {Math.round(newBetrayal * 100) !== Math.round((agent.betrayal_threshold ?? 0.3) * 100) && (
                                            <>
                                                <ArrowRight className="w-3 h-3 text-orange-400" />
                                                <Badge className="font-mono text-[9px] px-1.5 py-0 bg-orange-500">
                                                    {Math.round(newBetrayal * 100)}%
                                                </Badge>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <Slider value={[newBetrayal * 100]} onValueChange={([v]) => setNewBetrayal(v / 100)} max={100} step={1} className="h-1.5 [&_[role=slider]]:bg-secondary" />
                                <div className="flex justify-between text-[8px] text-muted-foreground"><span>Loyal</span><span>Opportunist</span></div>
                            </div>

                            {/* Self-Modification */}
                            <div className="flex items-center justify-between p-2 rounded-md bg-secondary/5 border border-secondary/20">
                                <div>
                                    <p className="font-display font-semibold text-[11px]">Self-Modification</p>
                                    <p className="text-[9px] text-muted-foreground">
                                        {agent.can_self_modify ? 'Already unlocked' : `${UPGRADE_COSTS.SELF_MODIFY_UNLOCK} $CLAW to unlock`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => !agent.can_self_modify && setNewSelfModify(!newSelfModify)}
                                    disabled={!!agent.can_self_modify}
                                    className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${(newSelfModify || agent.can_self_modify) ? 'bg-secondary' : 'bg-muted'
                                        } ${agent.can_self_modify ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${(newSelfModify || agent.can_self_modify) ? 'translate-x-[18px]' : 'translate-x-0.5'
                                        }`} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ═══ Cost Summary ═══ */}
                    <div className="p-3 rounded-lg bg-muted/20 border border-border/50 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Total Burn Cost</span>
                            <span className={`font-display font-bold text-sm ${hasChanges ? 'text-orange-400' : 'text-muted-foreground'}`}>
                                {hasChanges ? `🔥 ${totalCost.toLocaleString()} $CLAW` : 'No changes'}
                            </span>
                        </div>
                        {hasChanges && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Your Balance</span>
                                <span className={`font-mono text-xs ${hasEnoughTokens ? 'text-accent' : 'text-destructive'}`}>
                                    {Number(formattedBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })} $CLAW
                                    {!hasEnoughTokens && ' (insufficient)'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* ═══ Upgrade Button ═══ */}
                    <Button
                        onClick={handleUpgrade}
                        disabled={isUpgrading || !hasChanges || !hasEnoughTokens || !isConnected}
                        className="w-full gap-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 font-display font-semibold h-10 text-sm"
                    >
                        {isUpgrading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {getStepLabel()}
                            </>
                        ) : !hasChanges ? (
                            <>
                                <Lock className="w-4 h-4" />
                                Adjust Traits to Upgrade
                            </>
                        ) : !hasEnoughTokens ? (
                            <>
                                <Lock className="w-4 h-4" />
                                Need {totalCost} $CLAW
                            </>
                        ) : (
                            <>
                                <Flame className="w-4 h-4" />
                                Burn {totalCost} $CLAW & Upgrade
                            </>
                        )}
                    </Button>

                    <p className="text-[9px] text-center text-muted-foreground">
                        $CLAW is permanently burned to 0x...dEaD on Polygon Amoy — deflationary upgrade system
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
