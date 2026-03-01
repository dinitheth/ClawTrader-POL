import { Badge } from "@/components/ui/badge";
import { Wallet, TrendingUp, TrendingDown, Activity, Trophy } from "lucide-react";

interface AgentLeaderRowProps {
  rank: number;
  name: string;
  avatar: string;
  generation: number;
  vaultBalance: number;
  totalTrades: number;
  pnlPercent?: number;
  sharpeScore?: number;
  primaryMetric?: 'balance' | 'pnl' | 'sharpe' | 'trades';
}

const AgentLeaderRow = ({
  rank,
  name,
  avatar,
  generation,
  vaultBalance,
  totalTrades,
  pnlPercent = 0,
  sharpeScore = 0,
  primaryMetric = 'balance',
}: AgentLeaderRowProps) => {
  const getRankStyle = () => {
    switch (rank) {
      case 1: return 'bg-primary/5';
      case 2: return 'bg-muted/50';
      case 3: return 'bg-muted/30';
      default: return 'bg-transparent';
    }
  };

  const getRankColor = () => {
    switch (rank) {
      case 1: return 'text-primary font-bold';
      case 2: return 'text-foreground font-semibold';
      case 3: return 'text-foreground font-semibold';
      default: return 'text-muted-foreground font-medium';
    }
  };

  const formatBalance = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toFixed(2);
  };

  // Render the large primary metric on the right
  const renderPrimaryMetric = () => {
    switch (primaryMetric) {
      case 'pnl':
        const pnlColor = pnlPercent >= 0 ? 'text-green-500' : 'text-red-500';
        return (
          <>
            <p className="text-xs text-muted-foreground hidden sm:flex items-center gap-1 mb-0.5 justify-end">
              {pnlPercent >= 0 ? <TrendingUp className="w-3 h-3 text-green-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />} ROI
            </p>
            <p className={`font-semibold text-sm tabular-nums ${pnlColor}`}>
              {pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
            </p>
          </>
        );
      case 'sharpe':
        return (
          <>
            <p className="text-xs text-muted-foreground hidden sm:flex items-center gap-1 mb-0.5 justify-end">
              <Activity className="w-3 h-3" /> Score
            </p>
            <p className="font-semibold text-sm text-foreground tabular-nums">
              {sharpeScore.toFixed(2)}
            </p>
          </>
        );
      case 'trades':
        return (
          <>
            <p className="text-xs text-muted-foreground hidden sm:flex items-center gap-1 mb-0.5 justify-end">
              <Trophy className="w-3 h-3" /> Trades
            </p>
            <p className="font-semibold text-sm text-foreground tabular-nums">
              {totalTrades}
            </p>
          </>
        );
      case 'balance':
      default:
        return (
          <>
            <p className="text-xs text-muted-foreground hidden sm:flex items-center gap-1 mb-0.5 justify-end">
              <Wallet className="w-3 h-3" /> Vault
            </p>
            <p className="font-semibold text-sm text-primary tabular-nums">
              ${formatBalance(vaultBalance)}
              <span className="text-xs text-muted-foreground ml-1 font-normal">USDC</span>
            </p>
          </>
        );
    }
  };

  return (
    <div className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl transition-colors hover:bg-muted/50 ${getRankStyle()}`}>
      {/* Rank */}
      <div className="w-8 text-center flex-shrink-0">
        <span className={`text-sm md:text-base ${getRankColor()}`}>{rank}</span>
      </div>

      {/* Agent Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-muted flex items-center justify-center text-xl border border-border">
            {avatar}
          </div>
          <Badge className="absolute -bottom-1 -right-1 text-[8px] px-1 py-0 bg-background text-muted-foreground border border-border">
            G{generation}
          </Badge>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {primaryMetric !== 'balance' && <span>${formatBalance(vaultBalance)} USDC</span>}
            {primaryMetric === 'balance' && <span>{totalTrades} trades</span>}
          </div>
        </div>
      </div>

      {/* Right side variable metric */}
      <div className="text-right flex-shrink-0">
        {renderPrimaryMetric()}
      </div>
    </div>
  );
};

export default AgentLeaderRow;
