// trading-service.ts — uses local pro engine only (no Supabase edge functions)
import {
  scoreProConfluence,
  buildATRProfile,
  type EnhancedMarketData,
  type ProAgentDNA,
  type ProConfluenceResult,
} from './pro-trading-engine';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TradingDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  suggestedAmount: number;
  stopLoss?: number;
  takeProfit?: number;
  technicalAnalysis: string;
  riskAssessment: string;
  // Pro engine additions
  emaRegime?: string;
  marketStructure?: string;
  activeSignals?: string[];
  confluenceScore?: number;
}

/**
 * AgentDNA — 9 total traits: 5 core + 4 new pro skill traits.
 * Core traits (0-100 each):
 *   aggression       → position size and trade frequency
 *   riskTolerance    → ATR stop multiplier and max exposure
 *   patternRecognition → EMA/MACD/RSI indicator weighting
 *   contrarianBias   → SMC / fade-the-crowd emphasis
 *   timingSensitivity → min signal threshold (patient vs YOLO)
 * Pro skill traits (0-100 each):
 *   emaSkill         → EMA Stack module weight (Golden/Death cross mastery)
 *   smcAwareness     → Smart Money Concepts module weight
 *   ichimokuMastery  → Ichimoku Cloud module weight
 *   atrDiscipline    → How strictly ATR-based position sizing is followed
 */
export interface AgentDNA extends ProAgentDNA { }

export interface MarketData extends EnhancedMarketData {
  rsi?: number;
  macd?: { value: number; signal: number; histogram: number };
  movingAverages?: { ma20: number; ma50: number; ma200: number };
}

export interface TradingAnalysisResult {
  success: boolean;
  decision?: TradingDecision;
  timestamp?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Build price history from current market snapshot
// When no full OHLCV history is available, synthesize using price change data.
// ─────────────────────────────────────────────────────────────────────────────

function synthesizePriceHistory(market: MarketData): number[] {
  const price = market.currentPrice;
  const h24 = market.high24h;
  const l24 = market.low24h;
  const p1h = market.priceChange1h ?? 0;
  const p24h = market.priceChange24h ?? 0;
  const p7d = (market.priceChange7d ?? 0);

  // Reconstruct approximate price path: [7d ago → 24h ago → 1h ago → now]
  const price7dAgo = price / (1 + p7d / 100);
  const price24hAgo = price / (1 + p24h / 100);
  const price1hAgo = price / (1 + p1h / 100);

  // Create a 30-point synthetic history (enough for EMA21 and BB20)
  const history: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t = i / 29; // 0 → 1
    let base: number;
    if (t < 0.33) {
      base = price7dAgo + (price24hAgo - price7dAgo) * (t / 0.33);
    } else if (t < 0.9) {
      // Use high/low in day with sinusoidal path
      const dayT = (t - 0.33) / 0.57;
      const midDayPrice = dayT < 0.5
        ? price24hAgo + (h24 - price24hAgo) * (dayT / 0.5)
        : h24 + (l24 - h24) * ((dayT - 0.5) / 0.5);
      base = midDayPrice;
    } else {
      base = price1hAgo + (price - price1hAgo) * ((t - 0.9) / 0.1);
    }
    // Add tiny noise to create realistic swings
    const noise = (Math.random() - 0.5) * base * 0.003;
    history.push(base + noise);
  }
  history.push(price); // Ensure current price is last

  // Prepend with existing history if provided
  if (market.priceHistory && market.priceHistory.length > 0) {
    return [...market.priceHistory, ...history.slice(-5)];
  }

  return history;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: PRO LOCAL DECISION ENGINE
// Replaces the old computeTechnicalSignals + generateLocalDecision.
// Uses the full pro-trading-engine confluence scorer.
// ─────────────────────────────────────────────────────────────────────────────

export function generateLocalDecision(
  dna: AgentDNA,
  market: MarketData,
  personality: string = 'adaptive',
  portfolioBalance: number = 1000,
): TradingDecision {

  // Build rich market data for pro engine
  const enrichedMarket: EnhancedMarketData = {
    ...market,
    priceHistory: market.priceHistory ?? synthesizePriceHistory(market),
    volumeHistory: market.volumeHistory ?? [
      market.volume24h * 0.85, market.volume24h * 0.95, market.volume24h * 0.88,
      market.volume24h * 1.05, market.volume24h * 0.92, market.volume24h,
    ],
  };

  // Apply personality overrides to DNA
  const personalityDNA: Partial<ProAgentDNA> = { ...dna };
  switch (personality) {
    case 'aggressive':
      personalityDNA.aggression = Math.min(100, (dna.aggression ?? 50) + 20);
      personalityDNA.timingSensitivity = Math.max(0, (dna.timingSensitivity ?? 50) - 15);
      break;
    case 'cautious':
      personalityDNA.riskTolerance = Math.max(0, (dna.riskTolerance ?? 50) - 20);
      personalityDNA.timingSensitivity = Math.min(100, (dna.timingSensitivity ?? 50) + 20);
      break;
    case 'calculating':
      personalityDNA.patternRecognition = Math.min(100, (dna.patternRecognition ?? 50) + 15);
      personalityDNA.ichimokuMastery = Math.min(100, (dna.ichimokuMastery ?? 45) + 20);
      personalityDNA.timingSensitivity = Math.min(100, (dna.timingSensitivity ?? 50) + 25);
      break;
    case 'contrarian':
    case 'deceptive':
      personalityDNA.contrarianBias = Math.min(100, (dna.contrarianBias ?? 50) + 25);
      personalityDNA.smcAwareness = Math.min(100, (dna.smcAwareness ?? 40) + 20);
      break;
    case 'chaotic':
      // Reduce timing sensitivity — act on fewer confirmations
      personalityDNA.timingSensitivity = Math.max(0, (dna.timingSensitivity ?? 50) - 30);
      personalityDNA.aggression = Math.min(100, (dna.aggression ?? 50) + 10);
      break;
  }

  // Run the pro confluence scorer
  const proResult: ProConfluenceResult = scoreProConfluence(enrichedMarket, personalityDNA);

  // Position sizing using ATR-driven risk management
  // Pro rule: risk max 1% of portfolio per trade (stop = 1.5× ATR)
  const atr = proResult.atrProfile;
  const riskFactor = (dna.riskTolerance ?? 50) / 100;      // 0 to 1
  const aggFactor = (dna.aggression ?? 50) / 100;            // 0 to 1
  const atrDiscipline = (dna.atrDiscipline ?? 60) / 100;     // 0 to 1

  // Max risk per trade scales between 0.5% (conservative) → 3% (aggressive)
  const maxRiskPct = 0.5 + riskFactor * 2.5;
  // Stop distance as % of price
  const stopPct = atr.minExpectedMovePct * 1.5;
  // Position size in % terms: risk% / stop% (classic position sizing formula)
  const rawPositionPct = stopPct > 0 ? (maxRiskPct / stopPct) * 100 : 5;
  // Blend ATR-calculated size with aggression DNA
  const atrPosition = Math.min(50, rawPositionPct);
  const aggressionPosition = 5 + aggFactor * 45; // 5-50%
  const suggestedAmount = Math.round(
    atrPosition * atrDiscipline + aggressionPosition * (1 - atrDiscipline)
  );

  // Stop loss and take profit using ATR
  const stopLoss = proResult.action === 'BUY'
    ? Math.round((market.currentPrice - atr.stopDistanceLong) * 100) / 100
    : proResult.action === 'SELL'
      ? Math.round((market.currentPrice + atr.stopDistanceShort) * 100) / 100
      : undefined;

  const takeProfit = proResult.action === 'BUY'
    ? Math.round((market.currentPrice + atr.targetDistanceLong) * 100) / 100
    : proResult.action === 'SELL'
      ? Math.round((market.currentPrice - atr.targetDistanceShort) * 100) / 100
      : undefined;

  // Build human-readable reasoning
  const activeSignals = proResult.signals
    .filter(s => s.direction !== 'NEUTRAL')
    .map(s => `${s.module}: ${s.direction} (${(s.strength * 100).toFixed(0)}%)`);

  const priceCtx = `${market.symbol} @ $${market.currentPrice.toLocaleString()} (${market.priceChange24h >= 0 ? '+' : ''}${market.priceChange24h.toFixed(2)}% 24h)`;
  const regimeCtx = `EMA ${proResult.emaRegime} | ${proResult.marketStructure}`;

  let reasoning: string;
  if (proResult.action === 'BUY') {
    reasoning = `🎯 PRO BUY — ${proResult.signalCount} signals aligned. ${priceCtx}. ${regimeCtx}. Signals: ${activeSignals.slice(0, 3).join(', ')}.`;
  } else if (proResult.action === 'SELL') {
    reasoning = `📉 PRO SELL — ${proResult.signalCount} signals aligned. ${priceCtx}. ${regimeCtx}. Signals: ${activeSignals.slice(0, 3).join(', ')}.`;
  } else {
    const needed = Math.ceil(2 + (dna.timingSensitivity ?? 50) / 50);
    reasoning = `⏸ HOLD — insufficient confluence. ${priceCtx}. ${regimeCtx}. Need ${needed} aligned signals, have ${Math.max(proResult.signalCount, 0)}.`;
  }

  return {
    action: proResult.action,
    confidence: proResult.confidence,
    reasoning,
    suggestedAmount: Math.max(1, Math.min(100, suggestedAmount)),
    stopLoss,
    takeProfit,
    technicalAnalysis: proResult.technicalSummary,
    riskAssessment: proResult.riskSummary,
    emaRegime: proResult.emaRegime,
    marketStructure: proResult.marketStructure,
    activeSignals,
    confluenceScore: proResult.confluenceScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ATR-aware position information export
// ─────────────────────────────────────────────────────────────────────────────

export function getATRRiskProfile(market: MarketData) {
  return buildATRProfile(market.currentPrice, market.volatility, market.candles);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ANALYSIS FUNCTION: tries Supabase Edge Function, falls back to pro engine
// ─────────────────────────────────────────────────────────────────────────────

export async function getAITradingAnalysis(
  agentDNA: AgentDNA,
  marketData: MarketData,
  agentPersonality: string = 'adaptive',
  portfolioBalance: number = 1000,
): Promise<TradingAnalysisResult> {
  // Always use local pro trading engine
  try {
    const decision = generateLocalDecision(agentDNA, marketData, agentPersonality, portfolioBalance);
    return { success: true, decision, timestamp: new Date().toISOString() };
  } catch (err) {
    console.log('[PRO ENGINE] Using local pro decision engine (fallback)');
    try {
      const decision = generateLocalDecision(agentDNA, marketData, agentPersonality, portfolioBalance);
      return { success: true, decision, timestamp: new Date().toISOString() };
    } catch (localErr) {
      return {
        success: false,
        error: localErr instanceof Error ? localErr.message : 'Pro engine error',
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKET DATA FETCHER (CoinGecko)
// Fetches rich data including RSI proxy, 1h/24h/7d changes, volume, range
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchMarketData(coinId: string = 'bitcoin'): Promise<MarketData | null> {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
    );
    if (!response.ok) throw new Error('Failed to fetch market data');
    const data = await response.json();
    const md = data.market_data;

    const currentPrice: number = md.current_price.usd;
    const high24h: number = md.high_24h.usd || currentPrice;
    const low24h: number = md.low_24h.usd || currentPrice;
    const range24h = high24h - low24h;
    const volume24h: number = md.total_volume.usd || 0;
    const marketCap: number = md.market_cap.usd || 1;

    const rangePercent = range24h > 0 ? ((currentPrice - low24h) / range24h) * 100 : 50;
    const volatility = currentPrice > 0 ? (range24h / currentPrice) * 100 : 0;
    const volumeRatio = marketCap > 0 ? volume24h / marketCap : 0;

    // Proxy RSI from price changes (heuristic — real RSI needs candle history)
    const priceChange24h: number = md.price_change_percentage_24h || 0;
    const priceChange7d: number = md.price_change_percentage_7d || 0;
    // Rough RSI proxy: 50 baseline, pushed by trend strength
    const rsiProxy = Math.max(5, Math.min(95,
      50 + priceChange24h * 1.5 + priceChange7d * 0.5
    ));

    return {
      symbol: data.symbol.toUpperCase(),
      currentPrice,
      priceChange1h: md.price_change_percentage_1h_in_currency?.usd || 0,
      priceChange24h,
      priceChange7d,
      volume24h,
      high24h,
      low24h,
      rangePercent,
      volatility,
      volumeRatio,
      rsi: rsiProxy,
      // Synthetic volume history (5-period)
      volumeHistory: [
        volume24h * 0.82, volume24h * 0.91, volume24h * 1.04,
        volume24h * 0.87, volume24h * 0.96, volume24h,
      ],
    };
  } catch (error) {
    console.error('[PRO ENGINE] Market data fetch error:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT PRO DNA — used when agent has no custom DNA
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PRO_DNA: AgentDNA = {
  // Core traits
  aggression: 50,
  riskTolerance: 50,
  patternRecognition: 65,
  contrarianBias: 30,
  timingSensitivity: 60,
  // Pro skill traits
  emaSkill: 60,
  smcAwareness: 50,
  ichimokuMastery: 45,
  atrDiscipline: 70,
};

// Symbol → CoinGecko ID mapping
export const SYMBOL_TO_COINGECKO: Record<string, string> = {
  'BINANCE:BTCUSDT': 'bitcoin',
  'BINANCE:ETHUSDT': 'ethereum',
  'BINANCE:SOLUSDT': 'solana',
  'BINANCE:AVAXUSDT': 'avalanche-2',
  'BINANCE:NEARUSDT': 'near',
  'BINANCE:ARBUSDT': 'arbitrum',
  'BINANCE:OPUSDT': 'optimism',
  'BINANCE:BNBUSDT': 'binancecoin',
  'BINANCE:DOTUSDT': 'polkadot',
  'BINANCE:ADAUSDT': 'cardano',
  'BINANCE:MATICUSDT': 'matic-network',
};

export function getCoinGeckoId(tradingViewSymbol: string): string {
  return SYMBOL_TO_COINGECKO[tradingViewSymbol] || 'bitcoin';
}
