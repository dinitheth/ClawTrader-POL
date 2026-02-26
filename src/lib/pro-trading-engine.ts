/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║         PRO TRADING ENGINE — INSTITUTIONAL SKILL LIBRARY          ║
 * ║                                                                   ║
 * ║  8 production-grade signal modules used by elite spot traders:   ║
 * ║  1. EMA Stack Analysis         (trend regime, golden/death cross) ║
 * ║  2. Volume-Weighted Signal     (institutional activity filter)    ║
 * ║  3. RSI Divergence Detector    (reversal confirmation)            ║
 * ║  4. MACD Momentum              (histogram slope + zero-line)      ║
 * ║  5. Bollinger Band Squeeze     (volatility breakout detection)    ║
 * ║  6. ATR Risk Sizer             (dynamic stop/target levels)       ║
 * ║  7. Smart Money Concepts (SMC) (order blocks, FVG, liquidity)    ║
 * ║  8. Ichimoku Cloud             (multi-timeframe trend filter)     ║
 * ║  9. Confluence Scorer          (final weighted decision engine)   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface OHLCV {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface EnhancedMarketData {
    symbol: string;
    currentPrice: number;
    priceChange1h: number;
    priceChange24h: number;
    priceChange7d: number;
    high24h: number;
    low24h: number;
    volume24h: number;
    rangePercent: number;      // 0-100, position in 24h range
    volatility: number;        // range / price * 100
    volumeRatio: number;       // volume / marketCap ratio
    // Rich data — used by pro modules
    candles?: OHLCV[];         // Recent OHLCV candles (5-200 periods)
    rsi?: number;              // Pre-computed RSI if available
    rsiHistory?: number[];     // RSI over last N periods (for divergence)
    priceHistory?: number[];   // Close prices for EMA calc
    volumeHistory?: number[];  // Volume history for VWS
    macd?: { value: number; signal: number; histogram: number; historySlope?: number };
    ath24h?: number;           // All-time-high of the 24h range
}

export interface ProSignal {
    name: string;
    module: string;
    direction: 'BUY' | 'SELL' | 'NEUTRAL';
    strength: number;       // 0.0 → 1.0
    weight: number;         // Module weight in confluence
    detail: string;
}

export interface ATRProfile {
    atr: number;
    stopDistanceLong: number;  // Price distance for stop (1.5x ATR)
    stopDistanceShort: number;
    targetDistanceLong: number; // Price distance for target (3x ATR → 2:1 R:R)
    targetDistanceShort: number;
    minExpectedMovePct: number; // ATR as % of price
    volatilityRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

export interface ProConfluenceResult {
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;       // 0-100
    confluenceScore: number;  // Weighted sum of aligned signals
    signalCount: number;      // How many signals fired in direction
    signals: ProSignal[];
    atrProfile: ATRProfile;
    emaRegime: 'STRONG_UPTREND' | 'UPTREND' | 'NEUTRAL' | 'DOWNTREND' | 'STRONG_DOWNTREND';
    marketStructure: 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MARKDOWN' | 'RANGING';
    technicalSummary: string;
    riskSummary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1: EMA STACK ANALYSIS
// Pro traders use EMA 9/21/55/89/200 to gauge trend strength.
// A full bullish stack (price > EMA9 > EMA21 > EMA55 > EMA89 > EMA200)
// is among the most reliable trend confirmation setups used by institutions.
// ─────────────────────────────────────────────────────────────────────────────

export function computeEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const result: number[] = [];
    let prev = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(prev);
    for (let i = period; i < prices.length; i++) {
        prev = prices[i] * k + prev * (1 - k);
        result.push(prev);
    }
    return result;
}

export interface EMAStackResult {
    ema9: number | null;
    ema21: number | null;
    ema55: number | null;
    ema89: number | null;
    ema200: number | null;
    bullishAlignment: number;   // 0-5: how many EMAs are in bullish order
    bearishAlignment: number;   // 0-5: how many EMAs are in bearish order
    goldenCross: boolean;       // EMA9 just crossed above EMA21
    deathCross: boolean;        // EMA9 just crossed below EMA21
    priceAboveCount: number;    // How many EMAs price is above (0-5)
    signal: ProSignal;
}

export function analyzeEMAStack(prices: number[]): EMAStackResult {
    const ema9Arr = computeEMA(prices, 9);
    const ema21Arr = computeEMA(prices, 21);
    const ema55Arr = computeEMA(prices, 55);
    const ema89Arr = computeEMA(prices, 89);
    const ema200Arr = computeEMA(prices, 200);

    const ema9 = ema9Arr.length > 0 ? ema9Arr[ema9Arr.length - 1] : null;
    const ema21 = ema21Arr.length > 0 ? ema21Arr[ema21Arr.length - 1] : null;
    const ema55 = ema55Arr.length > 0 ? ema55Arr[ema55Arr.length - 1] : null;
    const ema89 = ema89Arr.length > 0 ? ema89Arr[ema89Arr.length - 1] : null;
    const ema200 = ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : null;

    const price = prices[prices.length - 1];
    const availableEMAs = [ema9, ema21, ema55, ema89, ema200].filter(e => e !== null) as number[];

    // Count bullish ordering pairs
    const emaSorted = [...availableEMAs].sort((a, b) => b - a);
    let bullishAlignment = 0;
    let bearishAlignment = 0;
    for (let i = 0; i < availableEMAs.length - 1; i++) {
        if (availableEMAs[i] > availableEMAs[i + 1]) bullishAlignment++;
        else if (availableEMAs[i] < availableEMAs[i + 1]) bearishAlignment++;
    }
    void emaSorted;

    const priceAboveCount = availableEMAs.filter(e => price > e).length;

    // Golden / death cross detection (EMA9 vs EMA21)
    const goldenCross = ema9 !== null && ema21 !== null &&
        ema9Arr.length >= 2 && ema21Arr.length >= 2 &&
        ema9Arr[ema9Arr.length - 1] > ema21Arr[ema21Arr.length - 1] &&
        ema9Arr[ema9Arr.length - 2] <= ema21Arr[ema21Arr.length - 2];

    const deathCross = ema9 !== null && ema21 !== null &&
        ema9Arr.length >= 2 && ema21Arr.length >= 2 &&
        ema9Arr[ema9Arr.length - 1] < ema21Arr[ema21Arr.length - 1] &&
        ema9Arr[ema9Arr.length - 2] >= ema21Arr[ema21Arr.length - 2];

    const bullStrength = (bullishAlignment + priceAboveCount) / (availableEMAs.length * 2 - 1);
    const bearStrength = (bearishAlignment + (availableEMAs.length - priceAboveCount)) / (availableEMAs.length * 2 - 1);

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let detail = '';

    if (goldenCross) {
        direction = 'BUY'; strength = 0.9;
        detail = `Golden Cross: EMA9 crossed above EMA21. Price above ${priceAboveCount}/${availableEMAs.length} EMAs.`;
    } else if (deathCross) {
        direction = 'SELL'; strength = 0.9;
        detail = `Death Cross: EMA9 crossed below EMA21. Price above only ${priceAboveCount}/${availableEMAs.length} EMAs.`;
    } else if (bullStrength > 0.65) {
        direction = 'BUY'; strength = bullStrength;
        detail = `Bullish EMA stack (${bullishAlignment}/${availableEMAs.length - 1} aligned up). Price above ${priceAboveCount} EMAs.`;
    } else if (bearStrength > 0.65) {
        direction = 'SELL'; strength = bearStrength;
        detail = `Bearish EMA stack (${bearishAlignment}/${availableEMAs.length - 1} aligned down). Price above only ${priceAboveCount} EMAs.`;
    } else {
        direction = 'NEUTRAL'; strength = 0.2;
        detail = `EMA stack mixed. Price above ${priceAboveCount}/${availableEMAs.length} EMAs.`;
    }

    return {
        ema9, ema21, ema55, ema89, ema200,
        bullishAlignment, bearishAlignment, goldenCross, deathCross, priceAboveCount,
        signal: { name: 'EMA_STACK', module: 'EMA Stack', direction, strength, weight: 2.0, detail },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2: VOLUME-WEIGHTED SIGNAL
// Institutions leave high-volume footprints. A price move on > 1.5× avg volume
// is conviction. A move on weak volume is likely a fake-out.
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeVolume(
    currentVolume: number,
    volumeHistory: number[],
    priceChange24h: number,
): ProSignal {
    const avgVolume = volumeHistory.length > 0
        ? volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length
        : currentVolume;

    const ratio = avgVolume > 0 ? currentVolume / avgVolume : 1;
    const isHighVolume = ratio >= 1.5;
    const isLowVolume = ratio < 0.7;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let detail = '';

    if (isHighVolume && priceChange24h > 0) {
        direction = 'BUY'; strength = Math.min(1, (ratio - 1) * 0.5 + 0.4);
        detail = `Volume ${ratio.toFixed(1)}× avg on up-move — institutional buying confirmation.`;
    } else if (isHighVolume && priceChange24h < 0) {
        direction = 'SELL'; strength = Math.min(1, (ratio - 1) * 0.5 + 0.4);
        detail = `Volume ${ratio.toFixed(1)}× avg on down-move — institutional selling pressure.`;
    } else if (isLowVolume) {
        direction = 'NEUTRAL'; strength = 0.1;
        detail = `Low volume (${ratio.toFixed(1)}× avg) — no institutional conviction. Avoid.`;
    } else {
        direction = 'NEUTRAL'; strength = 0.2;
        detail = `Volume ${ratio.toFixed(1)}× avg — normal activity.`;
    }

    return { name: 'VOLUME', module: 'Volume-Weighted Signal', direction, strength, weight: 1.5, detail };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3: RSI DIVERGENCE DETECTOR
// Pro traders don't just watch RSI levels — they watch divergences.
// Bullish divergence: price makes lower low, RSI makes higher low → reversal.
// Bearish divergence: price makes higher high, RSI makes lower high → top.
// ─────────────────────────────────────────────────────────────────────────────

export interface RSIDivergenceResult {
    rsi: number;
    divergenceType: 'BULLISH' | 'BEARISH' | 'NONE';
    signal: ProSignal;
}

export function analyzeRSIDivergence(
    rsi: number,
    priceChange24h: number,
    priceHistory?: number[],
    rsiHistory?: number[],
): RSIDivergenceResult {
    // Detect divergence if we have history
    let divergenceType: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';

    if (priceHistory && rsiHistory && priceHistory.length >= 3 && rsiHistory.length >= 3) {
        const pLen = priceHistory.length;
        const rLen = rsiHistory.length;
        const priceLower = priceHistory[pLen - 1] < priceHistory[pLen - 3];
        const rsiHigher = rsiHistory[rLen - 1] > rsiHistory[rLen - 3];
        const priceHigher = priceHistory[pLen - 1] > priceHistory[pLen - 3];
        const rsiLower = rsiHistory[rLen - 1] < rsiHistory[rLen - 3];

        if (priceLower && rsiHigher && rsi < 50) divergenceType = 'BULLISH';
        else if (priceHigher && rsiLower && rsi > 50) divergenceType = 'BEARISH';
    }

    // Base RSI level signals
    const oversold = rsi < 30;
    const overbought = rsi > 70;
    const extremeOversold = rsi < 20;
    const extremeOverbought = rsi > 80;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let detail = '';

    if (divergenceType === 'BULLISH') {
        direction = 'BUY';
        strength = extremeOversold ? 0.95 : 0.8;
        detail = `Bullish RSI divergence: price lower-low but RSI higher-low at RSI ${rsi.toFixed(0)} — institutional accumulation.`;
    } else if (divergenceType === 'BEARISH') {
        direction = 'SELL';
        strength = extremeOverbought ? 0.95 : 0.8;
        detail = `Bearish RSI divergence: price higher-high but RSI lower-high at RSI ${rsi.toFixed(0)} — distribution detected.`;
    } else if (extremeOversold) {
        direction = 'BUY'; strength = 0.75;
        detail = `RSI extremely oversold (${rsi.toFixed(0)}) — strong mean-reversion setup.`;
    } else if (oversold) {
        direction = 'BUY'; strength = 0.5;
        detail = `RSI oversold (${rsi.toFixed(0)}) — potential buy zone.`;
    } else if (extremeOverbought) {
        direction = 'SELL'; strength = 0.75;
        detail = `RSI extremely overbought (${rsi.toFixed(0)}) — strong take-profit zone.`;
    } else if (overbought) {
        direction = 'SELL'; strength = 0.5;
        detail = `RSI overbought (${rsi.toFixed(0)}) — caution at highs.`;
    } else {
        // RSI in neutral zone — use price momentum as tiebreaker
        if (priceChange24h > 2) { direction = 'BUY'; strength = 0.2; }
        else if (priceChange24h < -2) { direction = 'SELL'; strength = 0.2; }
        else strength = 0.1;
        detail = `RSI neutral (${rsi.toFixed(0)}) — no divergence detected. No RSI edge.`;
    }

    return {
        rsi, divergenceType,
        signal: { name: 'RSI_DIV', module: 'RSI Divergence', direction, strength, weight: 1.5, detail },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4: MACD MOMENTUM ANALYZER
// Pro traders read MACD histogram SLOPE, not just value.
// Rising histogram = momentum building. Peak histogram = momentum exhaustion.
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeMACDMomentum(macd?: {
    value: number; signal: number; histogram: number; historySlope?: number;
}): ProSignal {
    if (!macd) {
        return { name: 'MACD', module: 'MACD Momentum', direction: 'NEUTRAL', strength: 0, weight: 1.5, detail: 'No MACD data.' };
    }

    const { value, signal, histogram, historySlope } = macd;
    const slope = historySlope ?? 0;
    const aboveZero = histogram > 0;
    const rising = slope > 0;
    const bullishCross = value > signal && histogram > 0;
    const bearishCross = value < signal && histogram < 0;
    const slopeStrong = Math.abs(slope) > 0.001;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let detail = '';

    if (bullishCross && rising && aboveZero) {
        direction = 'BUY'; strength = slopeStrong ? 0.85 : 0.65;
        detail = `MACD bullish: histogram ${histogram.toFixed(3)} above zero, rising slope. Strong momentum.`;
    } else if (bearishCross && !rising && !aboveZero) {
        direction = 'SELL'; strength = slopeStrong ? 0.85 : 0.65;
        detail = `MACD bearish: histogram ${histogram.toFixed(3)} below zero, falling slope. Strong sell pressure.`;
    } else if (bullishCross && !rising) {
        direction = 'SELL'; strength = 0.4;   // Peak histogram = momentum exhaustion
        detail = `MACD peak: bullish cross but histogram slope turning — momentum exhaustion. Possible reversal.`;
    } else if (bearishCross && rising) {
        direction = 'BUY'; strength = 0.4;    // Trough = sellers exhausting
        detail = `MACD trough: bearish histogram but slope rising — sellers exhausting. Possible reversal.`;
    } else {
        direction = aboveZero ? 'BUY' : 'SELL'; strength = 0.25;
        detail = `MACD ${aboveZero ? 'above' : 'below'} zero (hist: ${histogram.toFixed(3)}) — weak signal.`;
    }

    return { name: 'MACD_MOMENTUM', module: 'MACD Momentum', direction, strength, weight: 1.5, detail };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 5: BOLLINGER BAND SQUEEZE
// Volatility contracts (BB squeeze) → then expands with a breakout.
// The direction of breakout after a squeeze is one of the highest-quality setups.
// ─────────────────────────────────────────────────────────────────────────────

export interface BollingerResult {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;   // (upper - lower) / middle — measures squeeze
    percentB: number;    // 0-1: where price is in the band
    isSqueeze: boolean;
    isExpanding: boolean;
    signal: ProSignal;
}

export function analyzeBollingerBands(prices: number[], period = 20, stdMultiplier = 2): BollingerResult {
    if (prices.length < period) {
        const fallback = prices[prices.length - 1] ?? 0;
        return {
            upper: fallback * 1.02, middle: fallback, lower: fallback * 0.98,
            bandwidth: 0.04, percentB: 0.5, isSqueeze: false, isExpanding: false,
            signal: { name: 'BB', module: 'Bollinger Bands', direction: 'NEUTRAL', strength: 0.1, weight: 1.0, detail: 'Insufficient data.' },
        };
    }

    const slice = prices.slice(-period);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
    const std = Math.sqrt(variance);

    const upper = mean + stdMultiplier * std;
    const lower = mean - stdMultiplier * std;
    const bandwidth = mean > 0 ? (upper - lower) / mean : 0;
    const price = prices[prices.length - 1];
    const percentB = upper !== lower ? (price - lower) / (upper - lower) : 0.5;

    // Historic bandwidth for comparison (detect squeeze = below 30-day avg bandwidth)
    const recentBandwidth = prices.length >= period + 5
        ? (() => {
            const oldSlice = prices.slice(-(period + 5), -5);
            const oldMean = oldSlice.reduce((s, v) => s + v, 0) / period;
            const oldVar = oldSlice.reduce((s, v) => s + Math.pow(v - oldMean, 2), 0) / period;
            const oldStd = Math.sqrt(oldVar);
            return oldMean > 0 ? ((oldMean + 2 * oldStd) - (oldMean - 2 * oldStd)) / oldMean : bandwidth;
        })()
        : bandwidth;

    const isSqueeze = bandwidth < recentBandwidth * 0.75;
    const isExpanding = bandwidth > recentBandwidth * 1.25;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let detail = '';

    if (isSqueeze) {
        direction = 'NEUTRAL'; strength = 0.3;
        detail = `BB Squeeze active (BW: ${(bandwidth * 100).toFixed(1)}%) — volatility contraction. Breakout imminent — wait for direction.`;
    } else if (isExpanding && percentB > 0.85) {
        direction = 'BUY'; strength = 0.7;
        detail = `BB Expansion: price at ${(percentB * 100).toFixed(0)}% of band (upper breakout). Momentum confirmed.`;
    } else if (isExpanding && percentB < 0.15) {
        direction = 'SELL'; strength = 0.7;
        detail = `BB Expansion: price at ${(percentB * 100).toFixed(0)}% of band (lower breakout). Sell/short momentum.`;
    } else if (percentB > 0.90) {
        direction = 'SELL'; strength = 0.5;   // Price above upper band = mean reversion risk
        detail = `Price above upper BB (${(percentB * 100).toFixed(0)}%) — overbought, mean-reversion risk.`;
    } else if (percentB < 0.10) {
        direction = 'BUY'; strength = 0.5;
        detail = `Price below lower BB (${(percentB * 100).toFixed(0)}%) — oversold, bounce candidate.`;
    } else {
        direction = 'NEUTRAL'; strength = 0.15;
        detail = `Price within BB (${(percentB * 100).toFixed(0)}%). No edge from Bollinger Bands.`;
    }

    return { upper, middle: mean, lower, bandwidth, percentB, isSqueeze, isExpanding, signal: { name: 'BB_SQUEEZE', module: 'Bollinger Bands', direction, strength, weight: 1.0, detail } };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 6: ATR RISK SIZER
// Average True Range defines the "heartbeat" of the market.
// Pro traders set stops at 1.5× ATR and targets at 3× ATR (2:1 minimum R:R).
// Position size is then calculated so 1 loss = max 1% of equity.
// ─────────────────────────────────────────────────────────────────────────────

export function computeATR(candles: OHLCV[], period = 14): number {
    if (candles.length < 2) return 0;
    const trues: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const hl = candles[i].high - candles[i].low;
        const hc = Math.abs(candles[i].high - candles[i - 1].close);
        const lc = Math.abs(candles[i].low - candles[i - 1].close);
        trues.push(Math.max(hl, hc, lc));
    }
    const slice = trues.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function buildATRProfile(
    currentPrice: number,
    volatility: number,
    candles?: OHLCV[],
): ATRProfile {
    // Use real ATR if candles available, else estimate from volatility %
    const atr = candles && candles.length >= 14
        ? computeATR(candles, 14)
        : currentPrice * (volatility / 100);

    const stopDistance = atr * 1.5;
    const targetDistance = atr * 3.0;
    const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

    const volatilityRating: ATRProfile['volatilityRating'] =
        atrPct > 8 ? 'EXTREME' :
            atrPct > 4 ? 'HIGH' :
                atrPct > 1.5 ? 'MEDIUM' : 'LOW';

    return {
        atr,
        stopDistanceLong: stopDistance,
        stopDistanceShort: stopDistance,
        targetDistanceLong: targetDistance,
        targetDistanceShort: targetDistance,
        minExpectedMovePct: atrPct,
        volatilityRating,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 7: SMART MONEY CONCEPTS (SMC)
// Institutions leave tracks: order blocks (last bearish candle before big move up),
// Fair Value Gaps (FVG — unfilled imbalances), and liquidity sweeps.
// When price returns to an order block zone, that's high-probability support.
// ─────────────────────────────────────────────────────────────────────────────

export interface SMCResult {
    hasOrderBlockSupport: boolean;
    hasOrderBlockResistance: boolean;
    hasFVGBelow: boolean;        // Unfilled gap below current price (magnet)
    hasFVGAbove: boolean;        // Unfilled gap above current price (ceiling)
    liquiditySweep: 'BULLISH' | 'BEARISH' | 'NONE';  // False breakout detection
    signal: ProSignal;
}

export function analyzeSmartMoney(
    currentPrice: number,
    candles?: OHLCV[],
    rangePercent?: number,
    priceChange1h?: number,
    priceChange24h?: number,
): SMCResult {
    let hasOrderBlockSupport = false;
    let hasOrderBlockResistance = false;
    let hasFVGBelow = false;
    let hasFVGAbove = false;
    let liquiditySweep: SMCResult['liquiditySweep'] = 'NONE';

    if (candles && candles.length >= 5) {
        // Order block detection: last bearish candle before a significant bullish push
        for (let i = candles.length - 5; i >= 0 && i < candles.length - 3; i++) {
            const c = candles[i];
            const isBearish = c.close < c.open;
            if (!isBearish) continue;
            // Check if subsequent candles made a strong up move
            const laterHigh = Math.max(...candles.slice(i + 1, i + 4).map(cc => cc.high));
            if (laterHigh > c.open * 1.02) {
                // This candle's range is the order block zone
                if (currentPrice >= c.low && currentPrice <= c.high * 1.01) {
                    hasOrderBlockSupport = true;
                }
                if (currentPrice < c.low && currentPrice > c.low * 0.99) {
                    hasOrderBlockSupport = true;
                }
            }

            // Resistance order block: last bullish candle before big drop
            const isBullish = c.close > c.open;
            if (isBullish) {
                const laterLow = Math.min(...candles.slice(i + 1, i + 4).map(cc => cc.low));
                if (laterLow < c.open * 0.98) {
                    if (currentPrice >= c.low && currentPrice <= c.high) {
                        hasOrderBlockResistance = true;
                    }
                }
            }
        }

        // Fair Value Gap: 3-candle pattern where candle 1 high < candle 3 low (bullish FVG)
        for (let i = 0; i < candles.length - 2; i++) {
            const c1 = candles[i];
            const c3 = candles[i + 2];
            if (c1.high < c3.low) {
                // Bullish FVG (gap above) — price below this gap = magnet above
                if (currentPrice < c3.low) hasFVGAbove = true;
                // Bullish FVG below current — price should use as support
                if (currentPrice > c1.high && currentPrice < c3.low * 1.1) hasFVGBelow = true;
            }
            if (c1.low > c3.high) {
                // Bearish FVG (gap below)
                if (currentPrice > c1.low) hasFVGBelow = true;
                if (currentPrice < c1.low && currentPrice > c3.high * 0.9) hasFVGAbove = true;
            }
        }

        // Liquidity sweep: sharp move beyond recent high/low that quickly reverses
        if (candles.length >= 3) {
            const lastCandle = candles[candles.length - 1];
            const prevHigh = Math.max(...candles.slice(-4, -1).map(c => c.high));
            const prevLow = Math.min(...candles.slice(-4, -1).map(c => c.low));
            if (lastCandle.high > prevHigh && lastCandle.close < prevHigh) {
                liquiditySweep = 'BEARISH'; // Swept above, closed back below = bear trap
            } else if (lastCandle.low < prevLow && lastCandle.close > prevLow) {
                liquiditySweep = 'BULLISH'; // Swept below, closed back above = bull trap
            }
        }
    } else {
        // Fallback: use price position in range as SMC proxy
        const rPct = rangePercent ?? 50;
        const p24h = priceChange24h ?? 0;
        const p1h = priceChange1h ?? 0;

        // Price at bottom of range with 1h reversal = order block support
        if (rPct < 20 && p1h > 0.1) hasOrderBlockSupport = true;
        // Price at top of range with 1h fade = order block resistance
        if (rPct > 80 && p1h < -0.1) hasOrderBlockResistance = true;
        // Sharp drop that's recovering = possible liquidity sweep
        if (p24h < -5 && p1h > 0.5) liquiditySweep = 'BULLISH';
        if (p24h > 5 && p1h < -0.5) liquiditySweep = 'BEARISH';
    }

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let detail = '';

    const smcSignals: string[] = [];
    if (hasOrderBlockSupport) smcSignals.push('Order Block support');
    if (hasOrderBlockResistance) smcSignals.push('Order Block resistance');
    if (hasFVGBelow) smcSignals.push('FVG below (support magnet)');
    if (hasFVGAbove) smcSignals.push('FVG above (price magnet)');
    if (liquiditySweep !== 'NONE') smcSignals.push(`${liquiditySweep} liquidity sweep`);

    if (liquiditySweep === 'BULLISH' || hasOrderBlockSupport) {
        direction = 'BUY';
        strength = liquiditySweep === 'BULLISH' ? 0.85 : 0.65;
        detail = `SMC: ${smcSignals.join(', ')} — institutional accumulation zone.`;
    } else if (liquiditySweep === 'BEARISH' || hasOrderBlockResistance) {
        direction = 'SELL';
        strength = liquiditySweep === 'BEARISH' ? 0.85 : 0.6;
        detail = `SMC: ${smcSignals.join(', ')} — institutional distribution zone.`;
    } else {
        detail = smcSignals.length > 0
            ? `SMC: ${smcSignals.join(', ')} — mixed signals.`
            : 'SMC: No clear order blocks or FVG detected.';
        strength = 0.1;
    }

    return {
        hasOrderBlockSupport, hasOrderBlockResistance, hasFVGBelow, hasFVGAbove, liquiditySweep,
        signal: { name: 'SMC', module: 'Smart Money Concepts', direction, strength, weight: 1.8, detail },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 8: ICHIMOKU CLOUD
// Used by institutional traders for multi-timeframe trend confirmation.
// Key signals: Tenkan/Kijun cross, price vs cloud, Chikou span, cloud color.
// ─────────────────────────────────────────────────────────────────────────────

export interface IchimokuResult {
    tenkan: number | null;       // Conversion line (9-period midpoint)
    kijun: number | null;        // Base line (26-period midpoint)
    senkouA: number | null;      // Leading span A (midpoint of tenkan+kijun)
    senkouB: number | null;      // Leading span B (52-period midpoint)
    cloudTop: number | null;     // Max of A/B
    cloudBottom: number | null;  // Min of A/B
    aboveCloud: boolean;
    belowCloud: boolean;
    inCloud: boolean;
    tkCrossUp: boolean;          // Tenkan crossed above Kijun = BUY
    tkCrossDown: boolean;        // Tenkan crossed below Kijun = SELL
    signal: ProSignal;
}

function periodMidpoint(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    return (high + low) / 2;
}

export function analyzeIchimoku(prices: number[]): IchimokuResult {
    const tenkan = periodMidpoint(prices, 9);
    const kijun = periodMidpoint(prices, 26);
    const senkouA = (tenkan !== null && kijun !== null) ? (tenkan + kijun) / 2 : null;
    const senkouB = periodMidpoint(prices, 52);
    const cloudTop = (senkouA !== null && senkouB !== null) ? Math.max(senkouA, senkouB) : null;
    const cloudBottom = (senkouA !== null && senkouB !== null) ? Math.min(senkouA, senkouB) : null;

    const price = prices[prices.length - 1];
    const aboveCloud = cloudTop !== null && price > cloudTop;
    const belowCloud = cloudBottom !== null && price < cloudBottom;
    const inCloud = !aboveCloud && !belowCloud;

    // TK Cross — need prev prices
    let tkCrossUp = false;
    let tkCrossDown = false;
    if (prices.length >= 27) {
        const prevSlice = prices.slice(0, -1);
        const prevTenkan = periodMidpoint(prevSlice, 9);
        const prevKijun = periodMidpoint(prevSlice, 26);
        if (tenkan !== null && kijun !== null && prevTenkan !== null && prevKijun !== null) {
            tkCrossUp = tenkan > kijun && prevTenkan <= prevKijun;
            tkCrossDown = tenkan < kijun && prevTenkan >= prevKijun;
        }
    }

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let detail = '';

    if (tkCrossUp && aboveCloud) {
        direction = 'BUY'; strength = 0.90;
        detail = `Ichimoku: Tenkan/Kijun bullish cross ABOVE cloud — highest quality buy signal.`;
    } else if (tkCrossDown && belowCloud) {
        direction = 'SELL'; strength = 0.90;
        detail = `Ichimoku: Tenkan/Kijun bearish cross BELOW cloud — highest quality sell signal.`;
    } else if (tkCrossUp) {
        direction = 'BUY'; strength = 0.65;
        detail = `Ichimoku: TK bullish cross (in/below cloud) — moderate buy signal.`;
    } else if (tkCrossDown) {
        direction = 'SELL'; strength = 0.65;
        detail = `Ichimoku: TK bearish cross (in/above cloud) — moderate sell signal.`;
    } else if (aboveCloud && tenkan !== null && kijun !== null && tenkan > kijun) {
        direction = 'BUY'; strength = 0.55;
        detail = `Ichimoku: Price above cloud, Tenkan > Kijun — bullish trend.`;
    } else if (belowCloud && tenkan !== null && kijun !== null && tenkan < kijun) {
        direction = 'SELL'; strength = 0.55;
        detail = `Ichimoku: Price below cloud, Tenkan < Kijun — bearish trend.`;
    } else if (inCloud) {
        direction = 'NEUTRAL'; strength = 0.2;
        detail = `Ichimoku: Price inside cloud — choppy/uncertain market. Avoid new positions.`;
    } else {
        direction = 'NEUTRAL'; strength = 0.15;
        detail = `Ichimoku: Insufficient data for full analysis.`;
    }

    return {
        tenkan, kijun, senkouA, senkouB, cloudTop, cloudBottom,
        aboveCloud, belowCloud, inCloud, tkCrossUp, tkCrossDown,
        signal: { name: 'ICHIMOKU', module: 'Ichimoku Cloud', direction, strength, weight: 2.0, detail },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 9: MARKET STRUCTURE ANALYZER
// Identifies Higher Highs / Higher Lows (uptrend), Lower Highs / Lower Lows (downtrend).
// Used alongside EMA to confirm reversals and swing entries.
// ─────────────────────────────────────────────────────────────────────────────

export type MarketStructureType = 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MARKDOWN' | 'RANGING';

export interface MarketStructureResult {
    structure: MarketStructureType;
    swingHighs: number[];
    swingLows: number[];
    higherHighs: boolean;
    higherLows: boolean;
    lowerHighs: boolean;
    lowerLows: boolean;
    signal: ProSignal;
}

export function analyzeMarketStructure(
    priceHistory: number[],
    priceChange24h: number,
    priceChange7d: number,
): MarketStructureResult {
    const n = priceHistory.length;

    // Find local swing highs and lows
    const swingHighs: number[] = [];
    const swingLows: number[] = [];
    for (let i = 1; i < n - 1; i++) {
        if (priceHistory[i] > priceHistory[i - 1] && priceHistory[i] > priceHistory[i + 1]) {
            swingHighs.push(priceHistory[i]);
        }
        if (priceHistory[i] < priceHistory[i - 1] && priceHistory[i] < priceHistory[i + 1]) {
            swingLows.push(priceHistory[i]);
        }
    }

    // Need at least 2 swing highs and lows
    const higherHighs = swingHighs.length >= 2 && swingHighs[swingHighs.length - 1] > swingHighs[swingHighs.length - 2];
    const higherLows = swingLows.length >= 2 && swingLows[swingLows.length - 1] > swingLows[swingLows.length - 2];
    const lowerHighs = swingHighs.length >= 2 && swingHighs[swingHighs.length - 1] < swingHighs[swingHighs.length - 2];
    const lowerLows = swingLows.length >= 2 && swingLows[swingLows.length - 1] < swingLows[swingLows.length - 2];

    // Determine structure
    let structure: MarketStructureType;
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 0;
    let detail = '';

    // If not enough historical data, fall back to basic momentum
    if (swingHighs.length < 2 || swingLows.length < 2) {
        if (priceChange24h > 3 && priceChange7d > 5) {
            structure = 'MARKUP'; direction = 'BUY'; strength = 0.5;
            detail = `Market showing markup phase: +${priceChange24h.toFixed(1)}% 24h, +${priceChange7d.toFixed(1)}% 7d.`;
        } else if (priceChange24h < -3 && priceChange7d < -5) {
            structure = 'MARKDOWN'; direction = 'SELL'; strength = 0.5;
            detail = `Market in markdown phase: ${priceChange24h.toFixed(1)}% 24h, ${priceChange7d.toFixed(1)}% 7d.`;
        } else if (Math.abs(priceChange24h) < 1.5 && Math.abs(priceChange7d) < 5) {
            structure = 'RANGING'; direction = 'NEUTRAL'; strength = 0.15;
            detail = `Market ranging: ${priceChange24h.toFixed(1)}% 24h. Wait for breakout.`;
        } else if (priceChange24h > 0) {
            structure = 'ACCUMULATION'; direction = 'BUY'; strength = 0.4;
            detail = `Possible accumulation: price recovering from lows.`;
        } else {
            structure = 'DISTRIBUTION'; direction = 'SELL'; strength = 0.4;
            detail = `Possible distribution: price falling from highs.`;
        }
    } else if (higherHighs && higherLows) {
        structure = 'MARKUP'; direction = 'BUY'; strength = 0.8;
        detail = `HH/HL structure confirmed — Classic uptrend. Strong buy bias.`;
    } else if (lowerHighs && lowerLows) {
        structure = 'MARKDOWN'; direction = 'SELL'; strength = 0.8;
        detail = `LH/LL structure confirmed — Classic downtrend. Strong sell bias.`;
    } else if (higherLows && lowerHighs) {
        structure = 'ACCUMULATION'; direction = 'BUY'; strength = 0.5;
        detail = `Coiling structure (higher lows, lower highs) — accumulation. Bullish breakout likely.`;
    } else if (lowerLows && higherHighs) {
        structure = 'DISTRIBUTION'; direction = 'SELL'; strength = 0.5;
        detail = `Expanding structure (lower lows, higher highs) — distribution. Bearish break likely.`;
    } else {
        structure = 'RANGING'; direction = 'NEUTRAL'; strength = 0.2;
        detail = `No clear HH/HL or LH/LL structure. Ranging market.`;
    }

    return {
        structure, swingHighs, swingLows, higherHighs, higherLows, lowerHighs, lowerLows,
        signal: { name: 'MARKET_STRUCT', module: 'Market Structure', direction, strength, weight: 1.5, detail },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 9 (DNA): AGENT SKILL DNA WEIGHTS
// DNA traits control which modules have more influence per agent.
// Elite agents with high patternRecognition trust Ichimoku + EMA more.
// Contrarian agents upweight SMC (fading institutional setups).
// ─────────────────────────────────────────────────────────────────────────────

export interface ProAgentDNA {
    // Core DNA (0-100)
    aggression: number;
    riskTolerance: number;
    patternRecognition: number;
    contrarianBias: number;
    timingSensitivity: number;
    // New pro trading skill traits (0-100 each)
    emaSkill: number;           // Mastery of EMA analysis (default 50)
    smcAwareness: number;       // Smart Money Concepts sensitivity (default 40)
    ichimokuMastery: number;    // Ichimoku cloud expertise (default 45)
    atrDiscipline: number;      // How strictly ATR risk rules are followed (default 60)
}

export function buildDNAWeights(dna: Partial<ProAgentDNA>): Record<string, number> {
    const ema = (dna.emaSkill ?? 50) / 100;
    const smc = (dna.smcAwareness ?? 40) / 100;
    const ich = (dna.ichimokuMastery ?? 45) / 100;
    const pattern = (dna.patternRecognition ?? 50) / 100;
    const contrarian = (dna.contrarianBias ?? 50) / 100;

    return {
        EMA_STACK: 1.5 + ema * 1.5,          // 1.5-3.0 weight
        VOLUME: 1.0 + pattern * 0.5,       // 1.0-1.5
        RSI_DIV: 1.0 + pattern * 1.0,       // 1.0-2.0
        MACD_MOMENTUM: 1.0 + pattern * 0.5,       // 1.0-1.5
        BB_SQUEEZE: 0.8 + pattern * 0.4,       // 0.8-1.2
        SMC: 1.0 + smc * 1.5 + contrarian * 0.8, // 1.0-3.3
        ICHIMOKU: 1.5 + ich * 1.5,           // 1.5-3.0
        MARKET_STRUCT: 1.0 + pattern * 0.5,       // 1.0-1.5
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLUENCE SCORER — THE FINAL DECISION ENGINE
// Aggregates all 8 modules into a single weighted score.
// BUY needs: weighted score ≥ threshold AND min 3 confirming signals.
// SELL needs: weighted score ≤ -threshold AND min 2 confirming signals.
// ─────────────────────────────────────────────────────────────────────────────

export function scoreProConfluence(
    market: EnhancedMarketData,
    dna: Partial<ProAgentDNA> = {},
): ProConfluenceResult {
    const prices = market.priceHistory ?? [];
    const candles = market.candles;
    const dnaWeights = buildDNAWeights(dna);

    // Run all modules (use available data)
    const emaResult = prices.length >= 9
        ? analyzeEMAStack(prices)
        : null;

    const volumeSig = analyzeVolume(
        market.volume24h, market.volumeHistory ?? [market.volume24h * 0.9], market.priceChange24h
    );

    const rsiResult = market.rsi !== undefined
        ? analyzeRSIDivergence(market.rsi, market.priceChange24h, market.priceHistory, market.rsiHistory)
        : null;

    const macdSig = analyzeMACDMomentum(market.macd);

    const bbResult = prices.length >= 10
        ? analyzeBollingerBands(prices, 20, 2)
        : null;

    const smcResult = analyzeSmartMoney(
        market.currentPrice, candles, market.rangePercent,
        market.priceChange1h, market.priceChange24h
    );

    const ichResult = prices.length >= 26
        ? analyzeIchimoku(prices)
        : null;

    const structResult = analyzeMarketStructure(
        prices.length >= 5 ? prices : [market.currentPrice],
        market.priceChange24h, market.priceChange7d
    );

    const atrProfile = buildATRProfile(market.currentPrice, market.volatility, candles);

    // Collect all signals
    const allSignals: ProSignal[] = [
        emaResult?.signal, volumeSig, rsiResult?.signal, macdSig,
        bbResult?.signal, smcResult.signal, ichResult?.signal, structResult.signal,
    ].filter(Boolean) as ProSignal[];

    // Apply DNA-weighted scoring
    let weightedBuyScore = 0;
    let weightedSellScore = 0;
    let buyCount = 0;
    let sellCount = 0;

    for (const sig of allSignals) {
        const dnaW = dnaWeights[sig.name] ?? sig.weight;
        const effectiveWeight = dnaW * sig.strength;
        if (sig.direction === 'BUY') {
            weightedBuyScore += effectiveWeight;
            buyCount++;
        } else if (sig.direction === 'SELL') {
            weightedSellScore += effectiveWeight;
            sellCount++;
        }
    }

    // Contrarian bias: flip signals if DNA is strongly contrarian
    const contrarianPct = (dna.contrarianBias ?? 50) / 100;
    if (contrarianPct > 0.7) {
        [weightedBuyScore, weightedSellScore] = [weightedSellScore, weightedBuyScore];
        [buyCount, sellCount] = [sellCount, buyCount];
    }

    // Timing sensitivity: adjusts min signal threshold
    const timingSens = (dna.timingSensitivity ?? 50) / 100;
    const minSignalsRequired = Math.round(2 + timingSens * 2); // 2-4 signals min
    const aggression = (dna.aggression ?? 50) / 100;
    const buyThreshold = 2.5 + aggression * 2; // 2.5-4.5 weighted score
    const sellThreshold = 2.0;

    // EMA regime context
    const priceAbove = emaResult?.priceAboveCount ?? 2;
    const totalEMAs = [emaResult?.ema9, emaResult?.ema21, emaResult?.ema55, emaResult?.ema89, emaResult?.ema200]
        .filter(e => e !== null).length;
    const emaRegime: ProConfluenceResult['emaRegime'] =
        totalEMAs === 0 ? 'NEUTRAL' :
            priceAbove >= totalEMAs ? 'STRONG_UPTREND' :
                priceAbove >= Math.ceil(totalEMAs * 0.6) ? 'UPTREND' :
                    priceAbove <= Math.floor(totalEMAs * 0.4) ? 'DOWNTREND' :
                        priceAbove === 0 ? 'STRONG_DOWNTREND' : 'NEUTRAL';

    // Final decision
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 50;
    let signalCount = 0;

    if (weightedBuyScore >= buyThreshold && buyCount >= minSignalsRequired) {
        // Extra gate: don't buy in a strong downtrend EMA regime
        if (emaRegime !== 'STRONG_DOWNTREND') {
            action = 'BUY';
            confidence = Math.min(95, 55 + (weightedBuyScore - buyThreshold) * 8 + buyCount * 3);
            signalCount = buyCount;
        }
    } else if (weightedSellScore >= sellThreshold && sellCount >= Math.max(2, minSignalsRequired - 1)) {
        action = 'SELL';
        confidence = Math.min(92, 55 + (weightedSellScore - sellThreshold) * 8 + sellCount * 3);
        signalCount = sellCount;
    }

    // Build summaries
    const activeSigs = allSignals.filter(s => s.direction !== 'NEUTRAL').map(s =>
        `[${s.module}] ${s.direction} (${(s.strength * 100).toFixed(0)}%): ${s.detail}`
    );

    const technicalSummary = [
        `EMA Regime: ${emaRegime}`,
        `Structure: ${structResult.structure}`,
        `ATR: $${atrProfile.atr.toFixed(2)} (${atrProfile.volatilityRating})`,
        ...(emaResult ? [`EMA Stack: price above ${emaResult.priceAboveCount}/5 EMAs`] : []),
        ...(ichResult?.aboveCloud ? ['Ichimoku: Above cloud'] : ichResult?.belowCloud ? ['Ichimoku: Below cloud'] : []),
        `Buy score: ${weightedBuyScore.toFixed(1)} (${buyCount} signals)`,
        `Sell score: ${weightedSellScore.toFixed(1)} (${sellCount} signals)`,
    ].join(' | ');

    const riskSummary = action === 'BUY'
        ? `ATR Stop: $${(market.currentPrice - atrProfile.stopDistanceLong).toFixed(2)} (-${((atrProfile.stopDistanceLong / market.currentPrice) * 100).toFixed(1)}%). Target: $${(market.currentPrice + atrProfile.targetDistanceLong).toFixed(2)} (+${((atrProfile.targetDistanceLong / market.currentPrice) * 100).toFixed(1)}%). R:R = 2:1.`
        : action === 'SELL'
            ? `ATR Cover: $${(market.currentPrice + atrProfile.stopDistanceShort).toFixed(2)} (+${((atrProfile.stopDistanceShort / market.currentPrice) * 100).toFixed(1)}%). Target: $${(market.currentPrice - atrProfile.targetDistanceShort).toFixed(2)}.`
            : `No trade. ${emaRegime === 'STRONG_DOWNTREND' ? 'EMA regime too bearish to buy.' : `Waiting for ${minSignalsRequired} confirmations (have: buy=${buyCount}, sell=${sellCount}).`}`;

    console.log(`[PRO ENGINE] ${market.symbol} → ${action} (conf: ${Math.round(confidence)}%) | ${activeSigs.length} active signals | ${technicalSummary}`);

    return {
        action, confidence: Math.round(confidence),
        confluenceScore: action === 'BUY' ? weightedBuyScore : weightedSellScore,
        signalCount,
        signals: allSignals,
        atrProfile,
        emaRegime,
        marketStructure: structResult.structure,
        technicalSummary,
        riskSummary,
    };
}
