import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, TrendingUp, TrendingDown, Clock, Brain, Target, ShieldAlert } from 'lucide-react';
import type { TradingDecision } from '@/lib/trading-service';

interface LatestDecisionCardProps {
  decision: TradingDecision | null;
  agentName?: string;
  timestamp?: string;
  /** When true, uses a compact horizontal layout with fixed height */
  horizontal?: boolean;
}

export function LatestDecisionCard({ decision, agentName, timestamp, horizontal }: LatestDecisionCardProps) {
  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
      case 'SELL': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'BUY': return <TrendingUp className="w-5 h-5" />;
      case 'SELL': return <TrendingDown className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-emerald-400';
    if (confidence >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  /* ── EMPTY STATE ── */
  if (!decision) {
    return (
      <Card
        className="border-muted/50 bg-gradient-to-br from-muted/10 to-transparent overflow-hidden"
        style={horizontal ? { height: '200px' } : undefined}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Latest Strategy Signal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center mb-2">
              <Brain className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No analysis yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Analyze" or enable "Auto Trade"</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ── HORIZONTAL / WIDE layout (right column) ── */
  if (horizontal) {
    return (
      <Card
        className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden"
        style={{ height: '220px' }}
      >
        <CardHeader className="pb-1 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Latest Strategy Signal
            </CardTitle>
            <div className="flex items-center gap-3">
              {agentName && <span className="text-xs text-muted-foreground">by {agentName}</span>}
              {timestamp && (
                <span className="text-xs text-muted-foreground">
                  {new Date(timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-3 pt-2 space-y-2 overflow-hidden">
          {/* Row 1: Action badge + Confidence */}
          <div className="flex items-center gap-3">
            <Badge className={`text-base px-3 py-1.5 flex items-center gap-1.5 ${getActionColor(decision.action)}`}>
              {getActionIcon(decision.action)}
              <span className="font-bold">{decision.action}</span>
            </Badge>
            <div>
              <div className={`text-xl font-bold ${getConfidenceColor(decision.confidence)}`}>
                {decision.confidence.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground">Signal Strength</div>
            </div>
            {/* Position Size pill */}
            <div className="ml-auto text-center px-3 py-1 rounded-lg bg-muted/30 border border-border/30">
              <div className="text-[10px] text-muted-foreground">Size</div>
              <div className="font-mono font-semibold text-sm">{Number(decision.suggestedAmount).toFixed(1)}%</div>
            </div>
          </div>

          {/* Row 2: AI Reasoning (truncated 2 lines) */}
          <div className="p-2 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <Brain className="w-3 h-3 text-primary shrink-0" />
              <span className="text-[10px] font-medium text-muted-foreground">Strategy Breakdown</span>
            </div>
            <p className="text-xs leading-relaxed line-clamp-2">{decision.reasoning}</p>
          </div>

          {/* Row 3: Technical Analysis (1 line) */}
          {decision.technicalAnalysis && (
            <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-muted/20 border border-border/30">
              <Target className="w-3 h-3 text-secondary shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground truncate">{decision.technicalAnalysis}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ── VERTICAL / DEFAULT layout (original) ── */
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Latest Strategy Signal
          </CardTitle>
          {timestamp && (
            <span className="text-xs text-muted-foreground">
              {new Date(timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
        {agentName && (
          <p className="text-xs text-muted-foreground">by {agentName}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action Badge & Confidence */}
        <div className="flex items-center justify-between">
          <Badge className={`text-lg px-4 py-2 flex items-center gap-2 ${getActionColor(decision.action)}`}>
            {getActionIcon(decision.action)}
            <span className="font-bold">{decision.action}</span>
          </Badge>
          <div className="text-right">
            <div className={`text-2xl font-bold ${getConfidenceColor(decision.confidence)}`}>
              {decision.confidence.toFixed(2)}%
            </div>
            <div className="text-xs text-muted-foreground">Signal Strength</div>
          </div>
        </div>

        {/* Reasoning */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-3 h-3 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Strategy Breakdown</span>
          </div>
          <p className="text-xs leading-relaxed">{decision.reasoning}</p>
        </div>

        {/* Technical Analysis */}
        {decision.technicalAnalysis && (
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-3 h-3 text-secondary" />
              <span className="text-xs font-medium text-muted-foreground">Technical Analysis</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{decision.technicalAnalysis}</p>
          </div>
        )}

        {/* Risk Assessment */}
        {decision.riskAssessment && (
          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-3 h-3 text-destructive" />
              <span className="text-xs font-medium text-destructive/70">Risk Assessment</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{decision.riskAssessment}</p>
          </div>
        )}

        {/* Trade Parameters */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/30 border border-border/30">
            <p className="text-xs text-muted-foreground">Position Size</p>
            <p className="font-mono font-semibold">{decision.suggestedAmount}%</p>
          </div>
          {decision.stopLoss && (
            <div className="text-center p-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-xs text-destructive">Stop Loss</p>
              <p className="font-mono text-xs font-semibold">${decision.stopLoss.toLocaleString()}</p>
            </div>
          )}
          {decision.takeProfit && (
            <div className="text-center p-2 rounded-lg bg-accent/10 border border-accent/20">
              <p className="text-xs text-accent">Take Profit</p>
              <p className="font-mono text-xs font-semibold">${decision.takeProfit.toLocaleString()}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
