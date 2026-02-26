import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Plus, Dna, Zap, Loader2, Activity, Flame } from "lucide-react";
import CreateAgentModal from "@/components/agents/CreateAgentModal";
import { FeedTokenModal } from "@/components/agents/FeedTokenModal";
import { agentService, profileService } from "@/lib/api";
import { useAccount } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { OnChainBalance } from '@/components/trading/OnChainBalance';

const Agents = () => {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [feedTokenAgent, setFeedTokenAgent] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isConnected && address) {
      loadProfile();
    } else {
      setProfile(null);
      setAgents([]);
      setIsLoading(false);
    }
  }, [address, isConnected]);

  // Load agents AFTER profile is ready — only shows agents owned by this wallet
  useEffect(() => {
    if (profile?.id) {
      loadAgents(profile.id);
    }
  }, [profile?.id]);

  const loadProfile = async () => {
    if (!address) return;
    try {
      const profileData = await profileService.getOrCreateByWallet(address);
      setProfile(profileData);
    } catch (error) {
      console.error('Error loading/creating profile:', error);
      toast({
        title: 'Profile Error',
        description: 'Failed to load your profile. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const loadAgents = async (profileId: string) => {
    setIsLoading(true);
    try {
      const myAgents = await agentService.getByOwner(profileId);
      setAgents(myAgents);
    } catch (error) {
      console.error('Error loading agents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusInfo = (agent: any) => {
    if (agent.is_in_match) return { label: 'In Match', color: 'text-destructive' };
    if (agent.is_active) return { label: 'Active', color: 'text-accent' };
    return { label: 'Idle', color: 'text-muted-foreground' };
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 space-y-8">
        {/* Header */}
        <section className="py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Bot className="w-8 h-8 text-primary" />
              <h1 className="text-3xl md:text-4xl font-display font-bold">
                MY AGENTS
              </h1>
            </div>
            <p className="text-muted-foreground">
              Create AI trading agents and upgrade them with $CLAW
            </p>
          </div>
          <Button
            onClick={() => {
              if (!isConnected) {
                toast({ title: 'Connect Wallet', description: 'Please connect your wallet to create an agent', variant: 'destructive' });
                return;
              }
              setIsCreateModalOpen(true);
            }}
            className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 font-display font-semibold"
            style={{ boxShadow: 'var(--glow-primary)' }}
          >
            <Plus className="w-5 h-5" />
            Create Agent
          </Button>
        </section>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : agents.length === 0 ? (
          <Card className="border-dashed border-2 border-muted">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
                <Bot className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="font-display font-semibold text-xl mb-2">No Agents Yet</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                Create your first AI trading agent to compete in the arena. Each agent has unique DNA and personality traits.
              </p>
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="gap-2 bg-gradient-to-r from-primary to-primary/80"
              >
                <Plus className="w-5 h-5" />
                Create Your First Agent
              </Button>
            </CardContent>
          </Card>
        ) : (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <div key={agent.id} className="space-y-4">
                <Card className="card-glow border-border overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-xl border border-primary/30">
                            {agent.avatar}
                          </div>
                          <Badge className="absolute -bottom-1 -right-1 text-[8px] px-1 py-0 bg-primary/20 text-primary border-primary/30">
                            G{agent.generation}
                          </Badge>
                        </div>
                        <div>
                          <h3 className="font-display font-semibold text-sm">{agent.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${agent.is_in_match
                                ? 'bg-destructive/20 text-destructive border-destructive/50'
                                : agent.is_active
                                  ? 'bg-accent/20 text-accent border-accent/50'
                                  : 'bg-muted text-muted-foreground border-border'
                                }`}
                            >
                              {agent.is_in_match ? (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-destructive mr-1 animate-pulse" />
                                  In Match
                                </>
                              ) : agent.is_active ? 'Active' : 'Idle'}
                            </Badge>
                            <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">
                              {agent.personality}
                            </Badge>

                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stats - Real On-Chain Data */}
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      <div className="text-center p-1.5 rounded-md bg-muted/30">
                        <p className="text-[9px] text-muted-foreground">Vault Balance</p>
                        <p className="font-display font-bold text-sm text-accent">
                          <OnChainBalance agentId={agent.id} />
                        </p>
                      </div>
                      <div className="text-center p-1.5 rounded-md bg-muted/30">
                        <p className="text-[9px] text-muted-foreground">Generation</p>
                        <p className="font-display font-bold text-sm">G{agent.generation}</p>
                      </div>
                      <div className="text-center p-1.5 rounded-md bg-muted/30">
                        <p className="text-[9px] text-muted-foreground">Personality</p>
                        <p className="font-display font-bold text-sm capitalize">{agent.personality}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                      <div className="text-center p-1.5 rounded-md bg-muted/30">
                        <p className="text-[9px] text-muted-foreground">Mutations</p>
                        <p className="font-display font-bold text-sm text-secondary">{agent.mutation_count ?? 0}</p>
                      </div>
                      <div className="text-center p-1.5 rounded-md bg-muted/30">
                        <p className="text-[9px] text-muted-foreground">Status</p>
                        <div className="flex items-center justify-center gap-1">
                          <Activity className={`w-3 h-3 ${getStatusInfo(agent).color}`} />
                          <p className={`font-display font-bold text-sm ${getStatusInfo(agent).color}`}>
                            {getStatusInfo(agent).label}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Strategy DNA */}
                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Dna className="w-3 h-3" />
                        <span>Strategy DNA</span>
                        {agent.can_self_modify && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 text-secondary border-secondary/50">
                            Self-Mod
                          </Badge>
                        )}
                        {agent.governance_enabled && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 text-primary border-primary/50">
                            DAO
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        <DNABar label="Risk" value={Number(agent.dna_risk_tolerance) * 100} />
                        <DNABar label="Aggr" value={Number(agent.dna_aggression) * 100} />
                        <DNABar label="Pattern" value={Number(agent.dna_pattern_recognition) * 100} />
                        <DNABar label="Timing" value={Number(agent.dna_timing_sensitivity) * 100} />
                        <DNABar label="Contra" value={Number(agent.dna_contrarian_bias) * 100} />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end pt-3 border-t border-border">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 h-7 text-xs border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                          onClick={() => setFeedTokenAgent(agent)}
                          disabled={!isConnected}
                        >
                          <Flame className="w-3 h-3" />
                          Upgrade
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1 h-7 text-xs bg-primary hover:bg-primary/90"
                          disabled={agent.is_in_match}
                          onClick={() => navigate(`/trading?agent=${agent.id}`)}
                        >
                          <Zap className="w-3 h-3" />
                          Arena
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>


              </div>
            ))}

            {/* Create New Agent Card */}
            <Card
              className="border-dashed border-2 border-muted hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors">
                  <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 className="font-display font-semibold text-sm mb-1">Create New Agent</h3>
                <p className="text-xs text-muted-foreground max-w-[180px]">
                  Build a new AI trader with custom DNA
                </p>
              </CardContent>
            </Card>
          </section>
        )}
      </div>

      {/* Modals */}
      {profile && (
        <CreateAgentModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          profileId={profile.id}
          onAgentCreated={() => profile?.id && loadAgents(profile.id)}
        />
      )}

      {feedTokenAgent && (
        <FeedTokenModal
          open={!!feedTokenAgent}
          onOpenChange={(open) => !open && setFeedTokenAgent(null)}
          agent={feedTokenAgent}
          onSuccess={() => profile?.id && loadAgents(profile.id)}
        />
      )}
    </Layout>
  );
};

const DNABar = ({ label, value }: { label: string; value: number }) => (
  <div className="text-center">
    <div className="h-8 w-full bg-muted/50 rounded relative overflow-hidden mb-0.5">
      <div
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-primary to-primary/60 transition-all"
        style={{ height: `${value}%` }}
      />
    </div>
    <span className="text-[8px] text-muted-foreground">{label}</span>
  </div>
);

export default Agents;
