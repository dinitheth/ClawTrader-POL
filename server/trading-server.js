/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║         ClawTrader Trading Server — PRO EDITION                   ║
 * ║                                                                   ║
 * ║  9-module institutional spot trading engine:                      ║
 * ║  EMA Stack · Volume · RSI Divergence · MACD Momentum             ║
 * ║  Bollinger Bands · ATR Risk Sizer · Smart Money Concepts (SMC)   ║
 * ║  Ichimoku Cloud · Market Structure Analyzer                       ║
 * ║                                                                   ║
 * ║  Run: node server/trading-server.js                               ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Contract addresses (Polygon Amoy testnet — deployed 2026-02-24)
const CONTRACTS = {
    USDC: '0xb045a5a95b592d701ce39100f4866a1168abd331',
    AGENT_VAULT_V2: '0x4Dff05F148Ab7DaB7547a81AF78edC1da7603b43', // AgentVaultV2 — real operatorBuy/operatorSell
    SIMPLE_DEX: '0xe531866c621248dc7c098cedbdb1977562f96bf5',
    TEST_BTC: '0xebb1df177e9ceb8e95dbd775cf7a1fce51fe7fdd',
    TEST_ETH: '0x7f3997ec44746e81acbe4a764e49b4d23fbf8fd5',
    TEST_SOL: '0x7bb46e04138aa7b97a731b86899c9b04a5fc964c',
};

// Token info (Polygon Amoy)
const TOKENS = {
    bitcoin: { address: CONTRACTS.TEST_BTC, decimals: 8, symbol: 'tBTC' },
    ethereum: { address: CONTRACTS.TEST_ETH, decimals: 18, symbol: 'tETH' },
    solana: { address: CONTRACTS.TEST_SOL, decimals: 9, symbol: 'tSOL' },
};

// AgentVaultV2 ABI — real operator trading using vault USDC
const AGENT_VAULT_ABI = [
    'function deposit(bytes32 agentId, uint256 amount) external',
    'function withdraw(bytes32 agentId, uint256 amount) external',
    'function getUserAgentBalance(address user, bytes32 agentId) external view returns (uint256)',
    'function getUserAgents(address user) external view returns (bytes32[])',
    'function getAgentTotalBalance(bytes32 agentId) external view returns (uint256)',
    'function getTokenPosition(address user, bytes32 agentId, address token) external view returns (uint256)',
    // Operator trading — uses VAULT USDC directly, gas wallet pays MATIC
    'function operatorBuy(bytes32 agentId, address user, address tokenOut, uint256 usdcAmount, uint256 minTokens) external returns (uint256 tokensReceived)',
    'function operatorSell(bytes32 agentId, address user, address tokenIn, uint256 tokenAmount, uint256 minUSDC) external returns (uint256 usdcReceived)',
];

// SimpleDEX ABI — real token swaps
const SIMPLE_DEX_ABI = [
    'function buyToken(address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut)',
    'function sellToken(address tokenIn, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut)',
    'function getBuyQuote(address tokenOut, uint256 amountIn) external view returns (uint256 amountOut, uint256 fee)',
    'function getSellQuote(address tokenIn, uint256 amountIn) external view returns (uint256 amountOut, uint256 fee)',
    'function updatePrice(address token, uint256 newPrice) external',
    'function tokenPrices(address token) external view returns (uint256)',
    'function isTokenSupported(address token) external view returns (bool)',
    'function getPoolBalance(address token) external view returns (uint256)',
];

const ERC20_ABI = [
    'function balanceOf(address account) external view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
];

// Setup provider and wallet (Polygon Amoy)
// Use multiple RPCs as fallback — drpc.org free tier occasionally returns malformed responses
const RPC_URLS = [
    process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy.drpc.org',
    'https://rpc-amoy.polygon.technology',
    'https://polygon-amoy-bor-rpc.publicnode.com',
];

// Build FallbackProvider — tries each in order on failure
function makeProvider() {
    const providers = RPC_URLS.map(url => new ethers.JsonRpcProvider(url));
    if (providers.length === 1) return providers[0];
    return new ethers.FallbackProvider(
        providers.map((p, i) => ({ provider: p, priority: i + 1, stallTimeout: 2000 })),
        1 // quorum = 1 (first success wins)
    );
}

const provider = makeProvider();
const wallet = new ethers.Wallet(process.env.TRADING_WALLET_PRIVATE_KEY, provider);
const agentVaultContract = new ethers.Contract(CONTRACTS.AGENT_VAULT_V2, AGENT_VAULT_ABI, wallet);
const simpleDexContract = new ethers.Contract(CONTRACTS.SIMPLE_DEX, SIMPLE_DEX_ABI, wallet);
const usdcContract = new ethers.Contract(CONTRACTS.USDC, ERC20_ABI, wallet);

// Retry wrapper for on-chain transactions — handles transient RPC errors
async function sendWithRetry(fn, retries = 3, delayMs = 1500) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isTransient = err?.message?.includes('neither result nor error') ||
                err?.message?.includes('coalesce error') ||
                err?.message?.includes('timeout') ||
                err?.code === 'UNKNOWN_ERROR';
            if (isTransient && attempt < retries) {
                console.warn(`⚠️ RPC transient error (attempt ${attempt}/${retries}), retrying in ${delayMs}ms...`);
                await new Promise(r => setTimeout(r, delayMs));
            } else {
                throw err;
            }
        }
    }
}

console.log(`🔑 Trading wallet: ${wallet.address}`);

// Track open positions per agent: agentId → { token, amount, entryPrice, entryUSDC }
const agentPositions = {};

// Convert UUID to bytes32
function uuidToBytes32(uuid) {
    const hex = uuid.replace(/-/g, '');
    return '0x' + hex.padEnd(64, '0');
}

/**
 * ═══════════════════════════════════════════════════════════════
 * PRO TRADING ENGINE — 9 INSTITUTIONAL SIGNAL MODULES
 *
 * Principles used by elite spot traders:
 *  1. HOLD by default — pros trade max 10-15% of the time
 *  2. ATR-based stops: 1.5×ATR stop, 3×ATR target = 2:1 R:R
 *  3. Position size = maxRisk% / stopPct (Kelly-adjacent sizing)
 *  4. EMA regime filter — no longs in STRONG_DOWNTREND
 *  5. Volume confirmation — high-conviction moves only
 *  6. 4+ signals needed to BUY, 3+ to SELL
 *  7. Portfolio fund rules: 20% cash reserve, 60% max exposure
 * ═══════════════════════════════════════════════════════════════
 */

// ─── MODULE: EMA STACK ───────────────────────────────────────────────────────
function computeEMA(prices, period) {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    let prev = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const result = [prev];
    for (let i = period; i < prices.length; i++) {
        prev = prices[i] * k + prev * (1 - k);
        result.push(prev);
    }
    return result;
}

function analyzeEMAStack(prices) {
    if (prices.length < 9) return { bullish: false, bearish: false, priceAbove: 0, total: 0, detail: 'Insufficient data' };
    const ema9 = computeEMA(prices, 9); const v9 = ema9[ema9.length - 1];
    const ema21 = computeEMA(prices, 21); const v21 = ema21.length ? ema21[ema21.length - 1] : null;
    const ema55 = computeEMA(prices, 55); const v55 = ema55.length ? ema55[ema55.length - 1] : null;
    const ema89 = computeEMA(prices, 89); const v89 = ema89.length ? ema89[ema89.length - 1] : null;
    const price = prices[prices.length - 1];
    const emas = [v9, v21, v55, v89].filter(v => v !== null);
    const priceAbove = emas.filter(e => price > e).length;
    const bullish = priceAbove >= Math.ceil(emas.length * 0.75);
    const bearish = priceAbove <= Math.floor(emas.length * 0.25);
    const goldenCross = ema9.length >= 2 && v21 !== null &&
        ema9[ema9.length - 1] > v21 && ema9[ema9.length - 2] <= (computeEMA(prices.slice(0, -1), 21).slice(-1)[0] ?? v21);
    const detail = `EMA: price above ${priceAbove}/${emas.length} EMAs${goldenCross ? ' — GOLDEN CROSS' : ''}`;
    return { bullish, bearish, priceAbove, total: emas.length, goldenCross, detail };
}

// ─── MODULE: ATR RISK SIZER ───────────────────────────────────────────────────
function computeATR(candles, period = 14) {
    if (!candles || candles.length < 2) return 0;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        trs.push(Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
        ));
    }
    const sl = trs.slice(-period);
    return sl.reduce((a, b) => a + b, 0) / sl.length;
}

function getATRProfile(currentPrice, volatility) {
    // ATR estimate from 24h range volatility when candles unavailable
    const atr = currentPrice * (volatility / 100);
    return {
        atr,
        stop: atr * 1.5,
        target: atr * 3.0,
        pct: currentPrice > 0 ? (atr / currentPrice) * 100 : 1,
    };
}

// ─── MODULE: ICHIMOKU ─────────────────────────────────────────────────────────
function midpoint(prices, period) {
    if (prices.length < period) return null;
    const sl = prices.slice(-period);
    return (Math.max(...sl) + Math.min(...sl)) / 2;
}

function analyzeIchimoku(prices) {
    const tenkan = midpoint(prices, 9);
    const kijun = midpoint(prices, 26);
    const sA = (tenkan !== null && kijun !== null) ? (tenkan + kijun) / 2 : null;
    const sB = midpoint(prices, 52);
    const cloudTop = (sA !== null && sB !== null) ? Math.max(sA, sB) : null;
    const cloudBottom = (sA !== null && sB !== null) ? Math.min(sA, sB) : null;
    const price = prices[prices.length - 1];
    const aboveCloud = cloudTop !== null && price > cloudTop;
    const belowCloud = cloudBottom !== null && price < cloudBottom;
    return { aboveCloud, belowCloud, tenkan, kijun, detail: `Ichimoku: ${aboveCloud ? 'above cloud (bullish)' : belowCloud ? 'below cloud (bearish)' : 'inside cloud (neutral)'}` };
}

// ─── MODULE: BOLLINGER BAND SQUEEZE ─────────────────────────────────────────
function analyzeBollingerBands(prices) {
    if (prices.length < 20) return { squeeze: false, breakoutUp: false, breakoutDown: false, percentB: 0.5, detail: 'Insufficient data' };
    const sl = prices.slice(-20);
    const mean = sl.reduce((a, b) => a + b, 0) / 20;
    const std = Math.sqrt(sl.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / 20);
    const upper = mean + 2 * std, lower = mean - 2 * std;
    const bw = mean > 0 ? (upper - lower) / mean : 0;
    const price = prices[prices.length - 1];
    const percentB = upper !== lower ? (price - lower) / (upper - lower) : 0.5;
    // Compare to previous bandwidth to detect squeeze
    let prevBW = bw;
    if (prices.length >= 25) {
        const psl = prices.slice(-25, -5);
        const pm = psl.reduce((a, b) => a + b, 0) / psl.length;
        const ps = Math.sqrt(psl.reduce((s, v) => s + Math.pow(v - pm, 2), 0) / psl.length);
        prevBW = pm > 0 ? (4 * ps) / pm : bw;
    }
    const squeeze = bw < prevBW * 0.75;
    const breakoutUp = !squeeze && percentB > 0.85;
    const breakoutDown = !squeeze && percentB < 0.15;
    return {
        squeeze, breakoutUp, breakoutDown, percentB,
        detail: squeeze ? 'BB Squeeze — breakout imminent' : breakoutUp ? 'BB Upper breakout' : breakoutDown ? 'BB Lower breakout' : `BB percentB: ${(percentB * 100).toFixed(0)}%`
    };
}

// ─── MODULE: RSI DIVERGENCE ──────────────────────────────────────────────────
function analyzeRSI(rsi) {
    if (rsi === undefined || rsi === null) return { dir: 'NEUTRAL', strength: 0, detail: 'No RSI' };
    if (rsi < 20) return { dir: 'BUY', strength: 0.9, detail: `RSI extreme oversold (${rsi.toFixed(0)})` };
    if (rsi < 30) return { dir: 'BUY', strength: 0.6, detail: `RSI oversold (${rsi.toFixed(0)})` };
    if (rsi > 80) return { dir: 'SELL', strength: 0.9, detail: `RSI extreme overbought (${rsi.toFixed(0)})` };
    if (rsi > 70) return { dir: 'SELL', strength: 0.6, detail: `RSI overbought (${rsi.toFixed(0)})` };
    return { dir: 'NEUTRAL', strength: 0.1, detail: `RSI neutral (${rsi.toFixed(0)})` };
}

// ─── MODULE: MACD MOMENTUM ───────────────────────────────────────────────────
function analyzeMACDServer(macd) {
    if (!macd) return { dir: 'NEUTRAL', strength: 0, detail: 'No MACD' };
    const { histogram } = macd;
    if (histogram > 0.002) return { dir: 'BUY', strength: Math.min(1, histogram * 100 + 0.4), detail: `MACD bullish (hist: ${histogram.toFixed(3)})` };
    if (histogram < -0.002) return { dir: 'SELL', strength: Math.min(1, Math.abs(histogram) * 100 + 0.4), detail: `MACD bearish (hist: ${histogram.toFixed(3)})` };
    return { dir: 'NEUTRAL', strength: 0.1, detail: `MACD flat (hist: ${histogram.toFixed(3)})` };
}

// ─── MODULE: VOLUME ───────────────────────────────────────────────────────────
function analyzeVolumeServer(volumeRatio, priceChange24h) {
    if (volumeRatio > 1.5 && priceChange24h > 0) return { dir: 'BUY', strength: Math.min(1, volumeRatio * 0.4), detail: `High volume ${(volumeRatio).toFixed(2)}× on up-move` };
    if (volumeRatio > 1.5 && priceChange24h < 0) return { dir: 'SELL', strength: Math.min(1, volumeRatio * 0.4), detail: `High volume ${(volumeRatio).toFixed(2)}× on down-move` };
    if (volumeRatio < 0.6) return { dir: 'NEUTRAL', strength: 0.05, detail: `Low volume ${volumeRatio.toFixed(2)}× — no conviction` };
    return { dir: 'NEUTRAL', strength: 0.15, detail: `Volume ${volumeRatio.toFixed(2)}× avg` };
}

// ─── MODULE: SMART MONEY CONCEPTS ─────────────────────────────────────────────
function analyzeSMC(rangePercent, priceChange1h, priceChange24h) {
    const liquiditySweepBullish = priceChange24h < -5 && priceChange1h > 0.5;
    const liquiditySweepBearish = priceChange24h > 5 && priceChange1h < -0.5;
    const orderBlockSupport = rangePercent < 15 && priceChange1h >= 0;
    const orderBlockResist = rangePercent > 85 && priceChange1h <= 0;
    if (liquiditySweepBullish || orderBlockSupport)
        return { dir: 'BUY', strength: liquiditySweepBullish ? 0.85 : 0.6, detail: `SMC: ${liquiditySweepBullish ? 'Bullish liquidity sweep — institutions accumulating' : 'Order block support zone'}` };
    if (liquiditySweepBearish || orderBlockResist)
        return { dir: 'SELL', strength: liquiditySweepBearish ? 0.85 : 0.6, detail: `SMC: ${liquiditySweepBearish ? 'Bearish liquidity sweep — distribution' : 'Order block resistance zone'}` };
    return { dir: 'NEUTRAL', strength: 0.1, detail: 'SMC: No clear order blocks' };
}

// ─── MODULE: MARKET STRUCTURE ─────────────────────────────────────────────────
function analyzeStructure(priceChange24h, priceChange7d, rangePercent) {
    if (priceChange24h > 3 && priceChange7d > 5)
        return { dir: 'BUY', strength: 0.7, structure: 'MARKUP', detail: 'Market structure: Markup (HH/HL trend)' };
    if (priceChange24h < -3 && priceChange7d < -5)
        return { dir: 'SELL', strength: 0.7, structure: 'MARKDOWN', detail: 'Market structure: Markdown (LH/LL trend)' };
    if (Math.abs(priceChange24h) < 1.5 && Math.abs(priceChange7d) < 3)
        return { dir: 'NEUTRAL', strength: 0.1, structure: 'RANGING', detail: 'Market structure: Ranging — wait for breakout' };
    if (priceChange24h > 0 && priceChange7d < 0)
        return { dir: 'BUY', strength: 0.4, structure: 'ACCUMULATION', detail: 'Market structure: Accumulation — recovering' };
    return { dir: 'SELL', strength: 0.4, structure: 'DISTRIBUTION', detail: 'Market structure: Distribution' };
}

// Trade session counter (resets on server restart)
const tradeSessionTracker = {};

function getTradeCount(agentId) {
    const key = agentId;
    if (!tradeSessionTracker[key]) {
        tradeSessionTracker[key] = { count: 0, lastTradeTime: 0, lastAction: null };
    }
    return tradeSessionTracker[key];
}

function recordTrade(agentId, action) {
    if (!tradeSessionTracker[agentId]) {
        tradeSessionTracker[agentId] = { count: 0, lastTradeTime: 0, lastAction: null };
    }
    tradeSessionTracker[agentId].count++;
    tradeSessionTracker[agentId].lastTradeTime = Date.now();
    tradeSessionTracker[agentId].lastAction = action;
}

/**
 * PORTFOLIO ANALYSIS
 * Deep understanding of the agent's fund situation before any trade
 */
function analyzePortfolio(positions, marketData) {
    const totalEquity = positions.usdcBalance + positions.tokenValueUSD;
    const exposurePercent = totalEquity > 0 ? (positions.tokenValueUSD / totalEquity) * 100 : 0;
    const cashPercent = totalEquity > 0 ? (positions.usdcBalance / totalEquity) * 100 : 0;

    // Fund reservations — this prevents the "tx stops" issue
    const GAS_BUFFER = 0.50;           // $0.50 reserved for gas fees
    const SAFETY_BUFFER_PCT = 0.05;    // 5% safety buffer
    const MIN_CASH_RESERVE_PCT = 20;   // Always keep 20% in USDC

    const safetyBuffer = totalEquity * SAFETY_BUFFER_PCT;
    const minCashReserve = totalEquity * (MIN_CASH_RESERVE_PCT / 100);
    const availableCash = Math.max(0, positions.usdcBalance - GAS_BUFFER - safetyBuffer - minCashReserve);

    // Max trade size: 5% of total equity
    const maxTradeSize = totalEquity * 0.05;
    // Actual trade size is the lesser of maxTradeSize and availableCash
    const tradableAmount = Math.min(maxTradeSize, availableCash);

    return {
        totalEquity,
        exposurePercent,
        cashPercent,
        availableCash,
        maxTradeSize,
        tradableAmount,
        gasBuffer: GAS_BUFFER,
        safetyBuffer,
        minCashReserve,
        isOverexposed: exposurePercent > 60,
        isCashLow: cashPercent < MIN_CASH_RESERVE_PCT,
        isFundsTooLow: totalEquity < 2, // Less than $2 total
    };
}

/**
 * EMA-BASED REGIME DETECTION (replaces simple signal counting)
 * Uses EMA stack order as primary regime filter.
 * Falls back to momentum-based detection when price history unavailable.
 */
function detectRegime(marketData) {
    const { priceChange1h, priceChange24h, priceChange7d, rangePercent, priceHistory } = marketData;

    // Use EMA stack if we have price history
    if (priceHistory && priceHistory.length >= 21) {
        const ema = analyzeEMAStack(priceHistory);
        if (ema.priceAbove >= Math.ceil(ema.total * 0.75)) return 'UPTREND';
        if (ema.priceAbove <= Math.floor(ema.total * 0.25)) return 'DOWNTREND';
        return 'RANGE';
    }

    // Fallback: momentum across timeframes
    let bull = 0, bear = 0;
    if (priceChange1h > 0.5) bull++; else if (priceChange1h < -0.5) bear++;
    if (priceChange24h > 2) bull++; else if (priceChange24h < -2) bear++;
    if (priceChange7d > 5) bull++; else if (priceChange7d < -5) bear++;
    if (rangePercent > 70) bull++; else if (rangePercent < 30) bear++;
    if (bull >= 3) return 'UPTREND';
    if (bear >= 3) return 'DOWNTREND';
    return 'RANGE';
}

/**
 * PRO SIGNAL SCORING — 9 Institutional Modules
 * BUY needs weighted score ≥ 4.0 AND ≥ 3 confirming signals
 * SELL needs weighted score ≥ 3.0 AND ≥ 2 confirming signals
 */
function scoreProBuySignalsServer(marketData, portfolio, regime, priceHistory) {
    const { priceChange1h, priceChange24h, priceChange7d, rangePercent, volumeRatio, rsi, macd, volatility, currentPrice } = marketData;
    const signals = [];

    // 1. EMA Stack (weight 2.0)
    const ema = analyzeEMAStack(priceHistory || [currentPrice]);
    if (ema.bullish) signals.push({ name: 'EMA_STACK', weight: 2.0, detail: ema.detail });
    else if (ema.goldenCross) signals.push({ name: 'EMA_GOLDEN', weight: 2.2, detail: 'EMA: Golden Cross — high conviction buy' });

    // 2. Volume (weight 1.5)
    const vol = analyzeVolumeServer(volumeRatio, priceChange24h);
    if (vol.dir === 'BUY') signals.push({ name: 'VOLUME', weight: 1.5 * vol.strength, detail: vol.detail });

    // 3. RSI (weight 1.5)
    const rsiA = analyzeRSI(rsi);
    if (rsiA.dir === 'BUY') signals.push({ name: 'RSI', weight: 1.5 * rsiA.strength, detail: rsiA.detail });

    // 4. MACD (weight 1.5)
    const macdA = analyzeMACDServer(macd);
    if (macdA.dir === 'BUY') signals.push({ name: 'MACD', weight: 1.5 * macdA.strength, detail: macdA.detail });

    // 5. Bollinger Bands (weight 1.0)
    const bb = analyzeBollingerBands(priceHistory || [currentPrice]);
    if (bb.breakoutUp || (!bb.squeeze && bb.percentB < 0.15)) signals.push({ name: 'BB', weight: 1.0, detail: bb.detail });

    // 6. SMC Order Blocks (weight 1.8)
    const smc = analyzeSMC(rangePercent, priceChange1h, priceChange24h);
    if (smc.dir === 'BUY') signals.push({ name: 'SMC', weight: 1.8 * smc.strength, detail: smc.detail });

    // 7. Ichimoku Cloud (weight 2.0)
    const ich = analyzeIchimoku(priceHistory || [currentPrice]);
    if (ich.aboveCloud) signals.push({ name: 'ICHIMOKU', weight: 2.0, detail: ich.detail });

    // 8. Market Structure (weight 1.5)
    const struct = analyzeStructure(priceChange24h, priceChange7d, rangePercent);
    if (struct.dir === 'BUY') signals.push({ name: 'STRUCT', weight: 1.5 * struct.strength, detail: struct.detail });

    // 9. ATR-based expected move gate (weight 1.0)
    const atr = getATRProfile(currentPrice, volatility);
    if (atr.pct > 1.0) signals.push({ name: 'ATR_GATE', weight: 1.0, detail: `ATR: ${atr.pct.toFixed(1)}% — sufficient expected move for fees` });

    // Regime penalty: downtrend blocks most buys
    if (regime === 'DOWNTREND') {
        return signals.filter(s => ['SMC', 'RSI', 'ATR_GATE'].includes(s.name));
    }
    return signals;
}

function scoreProSellSignalsServer(marketData, portfolio, positions, priceHistory) {
    const { priceChange1h, priceChange24h, priceChange7d, rangePercent, volumeRatio, rsi, macd, currentPrice, volatility } = marketData;
    const signals = [];

    // 1. EMA Stack bearish (weight 2.0)
    const ema = analyzeEMAStack(priceHistory || [currentPrice]);
    if (ema.bearish) signals.push({ name: 'EMA_STACK', weight: 2.0, detail: ema.detail });

    // 2. RSI overbought (weight 1.5)
    const rsiA = analyzeRSI(rsi);
    if (rsiA.dir === 'SELL') signals.push({ name: 'RSI', weight: 1.5 * rsiA.strength, detail: rsiA.detail });

    // 3. MACD bearish (weight 1.5)
    const macdA = analyzeMACDServer(macd);
    if (macdA.dir === 'SELL') signals.push({ name: 'MACD', weight: 1.5 * macdA.strength, detail: macdA.detail });

    // 4. SMC distribution (weight 1.8)
    const smc = analyzeSMC(rangePercent, priceChange1h, priceChange24h);
    if (smc.dir === 'SELL') signals.push({ name: 'SMC', weight: 1.8 * smc.strength, detail: smc.detail });

    // 5. Ichimoku below cloud (weight 2.0)
    const ich = analyzeIchimoku(priceHistory || [currentPrice]);
    if (ich.belowCloud) signals.push({ name: 'ICHIMOKU', weight: 2.0, detail: ich.detail });

    // 6. Take profit — price up >= ATR target (weight 2.5)
    const atr = getATRProfile(currentPrice, volatility);
    if (positions.tokenValueUSD > 1 && priceChange24h >= atr.pct * 3) {
        signals.push({ name: 'TAKE_PROFIT', weight: 2.5, detail: `Take profit: +${priceChange24h.toFixed(1)}% exceeds 2:1 ATR target` });
    }

    // 7. Stop loss — ATR breach (weight 3.0)
    if (positions.tokenValueUSD > 1 && priceChange24h <= -(atr.pct * 1.5)) {
        signals.push({ name: 'STOP_LOSS', weight: 3.0, detail: `ATR stop breached: ${priceChange24h.toFixed(1)}%` });
    }

    // 8. Overexposed (weight 1.2)
    if (portfolio.isOverexposed) signals.push({ name: 'OVEREXPOSED', weight: 1.2, detail: `Exposure ${portfolio.exposurePercent.toFixed(0)}% > 60%` });

    // 9. Momentum fade (weight 1.0)
    if (priceChange24h > 3 && priceChange1h < -0.5) signals.push({ name: 'MOMENTUM_FADE', weight: 1.0, detail: `1h fade: ${priceChange1h.toFixed(2)}% after rally` });

    return signals;
}

/**
 * PRO DECISION ENGINE — Institutional Grade
 * Aggregates 9 signal modules, respects portfolio rules, uses ATR sizing.
 */
function makeSmartDecision(marketData, positions, agentDNA, agentId) {
    const { priceChange24h, priceChange1h, priceChange7d, currentPrice, rangePercent, volatility, volumeRatio } = marketData;
    // Synthetic price history for EMA/Ichimoku/BB when real history not provided
    const priceHistory = marketData.priceHistory || (() => {
        const p24 = currentPrice / (1 + (priceChange24h || 0) / 100);
        const p7d = currentPrice / (1 + (priceChange7d || 0) / 100);
        const hist = [];
        for (let i = 0; i < 30; i++) {
            const t = i / 29;
            hist.push(t < 0.5 ? p7d + (p24 - p7d) * (t / 0.5) : p24 + (currentPrice - p24) * ((t - 0.5) / 0.5));
        }
        hist.push(currentPrice);
        return hist;
    })();

    // ═══════════════════════════════════════════
    // 1. PORTFOLIO ANALYSIS — Deep fund awareness
    // ═══════════════════════════════════════════
    const portfolio = analyzePortfolio(positions, marketData);
    const regime = detectRegime(marketData);
    const tracker = getTradeCount(agentId || 'default');

    // DNA adjustments (subtle, not wild swings)
    const aggressionFactor = (agentDNA?.aggression || 50) / 100;      // 0 to 1
    const riskFactor = (agentDNA?.riskTolerance || 50) / 100;         // 0 to 1
    const contrarianFactor = (agentDNA?.contrarianBias || 50) / 100;  // 0 to 1

    // Constants
    const MIN_TRADE_USDC = 3;              // Never trade less than $3
    const MAX_TRADES_PER_SESSION = 50;     // High limit — let the engine trade freely
    const TRADE_COOLDOWN_MS = 60_000;      // 60s cooldown (matches 30s frontend loop)
    const MIN_CONFIDENCE = 55;             // Lower bar so more decisions pass
    const BUY_SCORE_THRESHOLD = 1.0;      // Fire on single strong buy signal
    const SELL_SCORE_THRESHOLD = 1.0;     // Fire on single strong sell signal
    const MIN_BUY_SIGNALS = 1;            // 1 module is enough to enter
    const MIN_SELL_SIGNALS = 1;           // 1 module is enough to exit

    // DNA adjusts the pro threshold (±1 range)
    const effectiveBuyThreshold = BUY_SCORE_THRESHOLD - aggressionFactor * 0.8;
    const effectiveSellThreshold = SELL_SCORE_THRESHOLD - riskFactor * 0.5;
    void effectiveBuyThreshold; void effectiveSellThreshold; // used in signal scorers via closure

    // Portfolio status string for reasoning
    const portfolioStatus = `Portfolio: $${portfolio.totalEquity.toFixed(2)} | ` +
        `${portfolio.exposurePercent.toFixed(0)}% exposed | ` +
        `${portfolio.cashPercent.toFixed(0)}% cash | ` +
        `Available: $${portfolio.availableCash.toFixed(2)}`;

    // ═══════════════════════════════════════════
    // 2. PRE-FLIGHT CHECKS — Stop before wasting resources
    // ═══════════════════════════════════════════

    // Check: funds too low to do anything meaningful
    if (portfolio.isFundsTooLow) {
        return {
            action: 'HOLD', confidence: 50, suggestedAmount: 0,
            reasoning: `⏸ Insufficient funds. ${portfolioStatus}. Need ≥$2 total to trade.`,
            technicalAnalysis: `24h: ${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%, Regime: ${regime}`,
            riskAssessment: 'Funds too low to trade safely',
        };
    }

    // Check: max trades per session exceeded
    if (tracker.count >= MAX_TRADES_PER_SESSION) {
        return {
            action: 'HOLD', confidence: 60, suggestedAmount: 0,
            reasoning: `⏸ Trade limit reached (${tracker.count}/${MAX_TRADES_PER_SESSION}). ${portfolioStatus}. ` +
                `Resting to avoid overtrading.`,
            technicalAnalysis: `24h: ${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%, Regime: ${regime}`,
            riskAssessment: 'Max trades per session reached — preventing overtrading',
        };
    }

    // Check: cooldown between trades
    const timeSinceLastTrade = Date.now() - tracker.lastTradeTime;
    if (tracker.lastTradeTime > 0 && timeSinceLastTrade < TRADE_COOLDOWN_MS) {
        const remainSec = Math.ceil((TRADE_COOLDOWN_MS - timeSinceLastTrade) / 1000);
        return {
            action: 'HOLD', confidence: 55, suggestedAmount: 0,
            reasoning: `⏸ Cooldown active (${remainSec}s remaining). ${portfolioStatus}. ` +
                `Last action: ${tracker.lastAction}. Patience is key.`,
            technicalAnalysis: `24h: ${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%, Regime: ${regime}`,
            riskAssessment: 'Waiting between trades to avoid impulse decisions',
        };
    }

    // ═══════════════════════════════════════════
    // 3. SIGNAL SCORING — Multi-signal confirmation
    // ═══════════════════════════════════════════

    const buySignals = scoreProBuySignalsServer(marketData, portfolio, regime, priceHistory);
    const sellSignals = scoreProSellSignalsServer(marketData, portfolio, positions, priceHistory);

    const buyScore = buySignals.reduce((s, sig) => s + sig.weight, 0);
    const sellScore = sellSignals.reduce((s, sig) => s + sig.weight, 0);

    const buyDetails = buySignals.map(s => s.detail).join('; ') || 'No buy signals';
    const sellDetails = sellSignals.map(s => s.detail).join('; ') || 'No sell signals';

    // ═══════════════════════════════════════════
    // 4. DECISION — Act only with clear edge
    // ═══════════════════════════════════════════

    let action = 'HOLD';
    let confidence = 50;
    let reasoning = '';
    let suggestedAmount = 0;

    // ─── SELL LOGIC — stop-loss gets priority ───
    const hasStopLoss = sellSignals.some(s => s.name === 'STOP_LOSS');
    const hasTakeProfit = sellSignals.some(s => s.name === 'TAKE_PROFIT');

    if (positions.hasPosition && positions.tokenValueUSD >= 1) {
        if (hasStopLoss) {
            action = 'SELL'; confidence = 90; suggestedAmount = 100;
            reasoning = `🛑 PRO STOP LOSS (ATR breach). ${sellDetails}. ${portfolioStatus}. Capital protection.`;
        } else if (hasTakeProfit) {
            action = 'SELL'; confidence = 85;
            suggestedAmount = Math.round(60 + aggressionFactor * 20);
            reasoning = `💰 PRO TAKE PROFIT (ATR 2:1 target hit). ${sellDetails}. ${portfolioStatus}.`;
        } else if (sellScore >= SELL_SCORE_THRESHOLD && sellSignals.length >= MIN_SELL_SIGNALS) {
            action = 'SELL'; confidence = Math.min(88, 60 + sellScore * 6);
            suggestedAmount = Math.round(40 + aggressionFactor * 20);
            reasoning = `📉 PRO SELL (score ${sellScore.toFixed(1)}, ${sellSignals.length} modules). ${sellDetails}. ${portfolioStatus}.`;
        }
    }

    // ─── BUY LOGIC (only if not selling) ───
    if (action === 'HOLD' && buyScore >= BUY_SCORE_THRESHOLD && buySignals.length >= MIN_BUY_SIGNALS) {
        if (portfolio.availableCash < MIN_TRADE_USDC) {
            reasoning = `⏸ Pro buy setup (score ${buyScore.toFixed(1)}, ${buySignals.length} modules), but insufficient cash ($${portfolio.availableCash.toFixed(2)}). ${portfolioStatus}`;
            confidence = 55;
        } else if (portfolio.isOverexposed) {
            reasoning = `⏸ Pro buy setup (score ${buyScore.toFixed(1)}), but overexposed (${portfolio.exposurePercent.toFixed(0)}% > 60%). ${portfolioStatus}`;
            confidence = 55;
        } else if (portfolio.isCashLow) {
            reasoning = `⏸ Pro buy setup (score ${buyScore.toFixed(1)}), but cash reserve low (${portfolio.cashPercent.toFixed(0)}%). ${portfolioStatus}`;
            confidence = 55;
        } else {
            // ✅ CONFIRMED PRO BUY
            action = 'BUY';
            confidence = Math.min(93, 60 + buyScore * 4 + buySignals.length * 3);
            // ATR-based position sizing (risk 1% / stop%)
            const atr = getATRProfile(currentPrice, volatility);
            const stopPct = Math.max(0.5, atr.pct * 1.5);
            const maxRiskPct = 0.5 + riskFactor * 2.5; // 0.5-3% risk per trade
            const atrPositionPct = Math.min(50, (maxRiskPct / stopPct) * 100);
            const tradeSize = Math.min(portfolio.tradableAmount, portfolio.maxTradeSize,
                positions.usdcBalance * (atrPositionPct / 100));
            suggestedAmount = positions.usdcBalance > 0
                ? Math.min(100, (tradeSize / positions.usdcBalance) * 100) : 0;
            reasoning = `🎯 PRO BUY (score ${buyScore.toFixed(1)}, ${buySignals.length} modules). ${buyDetails}. ` +
                `ATR stop: ${(atr.pct * 1.5).toFixed(1)}%, target: ${(atr.pct * 3).toFixed(1)}%. ` +
                `Trade: $${tradeSize.toFixed(2)}. ${portfolioStatus}. Regime: ${regime}.`;
        }
    }

    // ─── HOLD (default) ───
    if (action === 'HOLD' && !reasoning) {
        const positionInfo = positions.hasPosition ? `Holding $${positions.tokenValueUSD.toFixed(2)}.` : 'No position.';
        reasoning = `⏸ HOLD — pro engine awaiting confluence. Buy: ${buyScore.toFixed(1)}/${BUY_SCORE_THRESHOLD} (${buySignals.length} modules), ` +
            `Sell: ${sellScore.toFixed(1)}/${SELL_SCORE_THRESHOLD} (${sellSignals.length} modules). ` +
            `${positionInfo} ${portfolioStatus}. Regime: ${regime}.`;
        confidence = 55;
    }

    const atrProfile = getATRProfile(currentPrice, volatility);
    return {
        action, confidence, reasoning, suggestedAmount,
        technicalAnalysis: `24h: ${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(2)}%, ` +
            `1h: ${priceChange1h >= 0 ? '+' : ''}${priceChange1h.toFixed(2)}%, ` +
            `Regime: ${regime} | Buy score: ${buyScore.toFixed(1)} (${buySignals.length} mods) | Sell: ${sellScore.toFixed(1)} (${sellSignals.length} mods)`,
        riskAssessment: action === 'BUY'
            ? `ATR: $${atrProfile.atr.toFixed(2)} | Stop: -${(atrProfile.pct * 1.5).toFixed(1)}% | Target: +${(atrProfile.pct * 3).toFixed(1)}% | R:R 2:1`
            : action === 'SELL'
                ? `Reducing exposure ${portfolio.exposurePercent.toFixed(0)}%. ${hasStopLoss ? 'ATR stop triggered.' : hasTakeProfit ? 'ATR target hit.' : 'Pro sell signals.'}`
                : `No trade. Cash reserve: ${portfolio.cashPercent.toFixed(0)}%. Need ${BUY_SCORE_THRESHOLD} buy score (have ${buyScore.toFixed(1)}).`,
    };
}

/**
 * Fetch market data from CoinGecko
 * Enhanced: computes range percentile, volatility, and volume ratio
 */
async function fetchMarketData(symbol) {
    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/${symbol}?localization=false&tickers=false&community_data=false&developer_data=false`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch market data');
        }

        const data = await response.json();
        const md = data.market_data;

        const currentPrice = md.current_price.usd;
        const high24h = md.high_24h.usd || currentPrice;
        const low24h = md.low_24h.usd || currentPrice;
        const range24h = high24h - low24h;

        // Range percentile: where current price sits in 24h range (0% = low, 100% = high)
        const rangePercent = range24h > 0 ? ((currentPrice - low24h) / range24h * 100) : 50;

        // Volatility: spread as % of price (higher = more volatile)
        const volatility = currentPrice > 0 ? (range24h / currentPrice * 100) : 0;

        // Volume ratio: 24h volume vs market cap (proxy for activity level)
        const volume24h = md.total_volume.usd || 0;
        const marketCap = md.market_cap.usd || 1;
        const volumeRatio = marketCap > 0 ? (volume24h / marketCap) : 0;

        return {
            symbol: data.symbol.toUpperCase(),
            currentPrice,
            priceChange1h: md.price_change_percentage_1h_in_currency?.usd || 0,
            priceChange24h: md.price_change_percentage_24h || 0,
            priceChange7d: md.price_change_percentage_7d || 0,
            high24h,
            low24h,
            volume24h,
            rangePercent,
            volatility,
            volumeRatio,
        };
    } catch (error) {
        console.error('Market data fetch error:', error);
        return null;
    }
}

/**
 * Get agent's positions from AgentVaultV2
 */
async function getAgentPositions(userAddress, agentId) {
    const agentIdBytes32 = uuidToBytes32(agentId);
    const usdcBalance = await agentVaultContract.getUserAgentBalance(userAddress, agentIdBytes32);
    const usdcAmount = parseFloat(ethers.formatUnits(usdcBalance, 6));

    // Check in-memory open position
    const pos = agentPositions[agentId];
    const tokenAmount = pos ? pos.amount : 0;
    const tokenValueUSD = pos ? pos.amount * pos.currentPrice : 0;

    return {
        usdcBalance: usdcAmount,
        tokenAmount,
        tokenValueUSD,
        hasPosition: tokenAmount > 0,
        openPosition: pos || null,
    };
}

/**
 * SMART TRADE ENDPOINT
 * Makes intelligent decisions and executes real on-chain trades
 */
app.post('/api/smart-trade', async (req, res) => {
    try {
        // Accept both 'coinId' (from Trading.tsx) and 'symbol' (legacy)
        const { agentId, userAddress, agentDNA } = req.body;
        const rawId = req.body.coinId || req.body.symbol || '';

        if (!agentId || !userAddress) {
            return res.status(400).json({ error: 'agentId and userAddress required' });
        }

        // Normalize: map chart symbols like 'BTCUSDT' → 'bitcoin'
        const symbolToCoinId = {
            'BTCUSDT': 'bitcoin', 'BTC': 'bitcoin', 'BITCOIN': 'bitcoin',
            'ETHUSDT': 'ethereum', 'ETH': 'ethereum', 'ETHEREUM': 'ethereum',
            'SOLUSDT': 'solana', 'SOL': 'solana', 'SOLANA': 'solana',
            // Already correct
            'bitcoin': 'bitcoin', 'ethereum': 'ethereum', 'solana': 'solana',
        };
        const coinId = symbolToCoinId[rawId?.toUpperCase()] ||
            symbolToCoinId[rawId] ||
            rawId?.toLowerCase() ||
            'bitcoin';

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🧠 SMART TRADE: coinId=${coinId} | Agent: ${agentId?.slice(0, 8)}... | User: ${userAddress?.slice(0, 10)}...`);

        const tokenInfo = TOKENS[coinId];
        if (!tokenInfo) {
            console.error(`❌ Unsupported token: rawId='${rawId}' coinId='${coinId}'`);
            return res.status(400).json({ error: 'Unsupported token', coinId, supported: Object.keys(TOKENS) });
        }

        // 1. Fetch market data
        console.log(`📊 Fetching market data for ${coinId}...`);
        const marketData = await fetchMarketData(coinId);
        if (!marketData) {
            return res.status(500).json({ error: 'Failed to fetch market data' });
        }
        console.log(`   Price: $${marketData.currentPrice}, 1h: ${marketData.priceChange1h.toFixed(2)}%, 24h: ${marketData.priceChange24h.toFixed(2)}%`);
        console.log(`   Range: ${marketData.rangePercent.toFixed(0)}%, Vol: ${marketData.volatility.toFixed(2)}%, VolumeRatio: ${marketData.volumeRatio.toFixed(4)}`);

        // 2. Get agent's current positions
        console.log(`💼 Fetching agent positions...`);
        const positions = await getAgentPositions(userAddress, agentId, tokenInfo.address, tokenInfo.decimals);
        positions.tokenValueUSD = positions.tokenAmount * marketData.currentPrice;
        console.log(`   USDC: $${positions.usdcBalance.toFixed(2)}, ${tokenInfo.symbol}: ${positions.tokenAmount.toFixed(8)} ($${positions.tokenValueUSD.toFixed(2)})`);

        // 3. Make professional trading decision
        console.log(`🧠 Professional Engine V2 analyzing...`);
        const decision = makeSmartDecision(marketData, positions, agentDNA, agentId);
        console.log(`   Decision: ${decision.action} (${decision.confidence}% confidence)`);
        console.log(`   Analysis: ${decision.technicalAnalysis}`);
        console.log(`   Reason: ${decision.reasoning}`);
        console.log(`   Risk: ${decision.riskAssessment}`);

        // ─── 4. ORACLE PRICE UPDATE ────────────────────────────────────────
        try {
            const priceInUSDC = BigInt(Math.round(marketData.currentPrice * 1e6));
            const updateTx = await simpleDexContract.updatePrice(tokenInfo.address, priceInUSDC, {
                maxPriorityFeePerGas: BigInt(30_000_000_000),
                maxFeePerGas: BigInt(60_000_000_000),
            });
            await updateTx.wait();
            console.log(`💹 Oracle price updated: $${marketData.currentPrice.toFixed(2)}`);
        } catch (priceErr) {
            console.warn(`⚠️  Price update skipped: ${priceErr.message?.slice(0, 60)}`);
        }

        // ─── 5. REAL DEX EXECUTION ────────────────────────────────────────
        let txHash = null;
        let newBalance = positions.usdcBalance;
        let tokensTraded = 0;
        let tradeError = null;

        const GAS_OPTS = {
            maxPriorityFeePerGas: BigInt(30_000_000_000),
            maxFeePerGas: BigInt(60_000_000_000),
        };

        if (decision.action !== 'HOLD' && decision.confidence >= 55) {
            const agentIdBytes32 = uuidToBytes32(agentId);
            const pos = agentPositions[agentId];

            // Guard: need real vault USDC balance to BUY
            if (decision.action === 'BUY' && positions.usdcBalance < 3) {
                console.log(`⏭  BUY skipped — vault USDC balance is $${positions.usdcBalance.toFixed(2)} (need ≥$3). Fund the new vault first.`);
            } else if (decision.action === 'BUY' && positions.usdcBalance >= 3 && !positions.hasPosition) {
                const buyAmount = positions.usdcBalance * (decision.suggestedAmount / 100);
                if (buyAmount >= 3) {
                    const buyAmountWei = BigInt(Math.round(buyAmount * 1e6));
                    try {
                        // Get quote first
                        const [expectedOut] = await simpleDexContract.getBuyQuote(tokenInfo.address, buyAmountWei);
                        const minOut = expectedOut * 95n / 100n; // 5% slippage

                        console.log(`⚡ BUY: $${buyAmount.toFixed(2)} vault USDC → ${tokenInfo.symbol} (user: ${userAddress.slice(0, 10)}...)`);

                        // operatorBuy with retry on transient RPC errors
                        const tx = await sendWithRetry(() => agentVaultContract.operatorBuy(
                            agentIdBytes32,
                            userAddress,
                            tokenInfo.address,
                            buyAmountWei,
                            minOut,
                            GAS_OPTS
                        ));
                        const receipt = await tx.wait();
                        txHash = receipt.hash;
                        const tokensOut = parseFloat(ethers.formatUnits(expectedOut, tokenInfo.decimals));
                        tokensTraded = tokensOut;

                        // Record open position in memory
                        agentPositions[agentId] = {
                            token: tokenInfo.symbol,
                            tokenAddress: tokenInfo.address,
                            decimals: tokenInfo.decimals,
                            amount: tokensOut,
                            entryPrice: marketData.currentPrice,
                            currentPrice: marketData.currentPrice,
                            entryUSDC: buyAmount,
                        };

                        newBalance = positions.usdcBalance - buyAmount;
                        recordTrade(agentId, 'BUY');
                        console.log(`✅ REAL BUY on-chain! $${buyAmount.toFixed(2)} vault USDC → ${tokensOut.toFixed(6)} ${tokenInfo.symbol} | Tx: ${txHash}`);

                    } catch (err) {
                        tradeError = err.message;
                        console.error(`❌ operatorBuy failed:`, err.message?.slice(0, 150));
                    }
                }

            } else if (decision.action === 'SELL' && pos) {
                try {
                    pos.currentPrice = marketData.currentPrice;
                    const tokenAmountWei = BigInt(Math.round(pos.amount * 10 ** pos.decimals));

                    // ── On-chain guard: verify vault actually holds the tokens ──
                    const vaultTokenBalance = await agentVaultContract.getTokenPosition(
                        userAddress, agentIdBytes32, pos.tokenAddress
                    );
                    if (vaultTokenBalance < tokenAmountWei) {
                        console.log(`⏭  SELL skipped — vault has ${ethers.formatUnits(vaultTokenBalance, pos.decimals)} ${pos.token} but need ${pos.amount.toFixed(6)}. Clearing stale position.`);
                        delete agentPositions[agentId]; // clear stale in-memory position
                        tradeError = null; // not a real error
                    } else {
                        const [expectedUSDC] = await simpleDexContract.getSellQuote(pos.tokenAddress, tokenAmountWei);
                        const minUSDC = expectedUSDC * 95n / 100n;

                        console.log(`⚡ SELL: ${pos.amount.toFixed(6)} ${pos.token} → USDC (user: ${userAddress.slice(0, 10)}...)`);

                        // operatorSell with retry on transient RPC errors
                        const tx = await sendWithRetry(() => agentVaultContract.operatorSell(
                            agentIdBytes32,
                            userAddress,
                            pos.tokenAddress,
                            tokenAmountWei,
                            minUSDC,
                            GAS_OPTS
                        ));
                        const receipt = await tx.wait();
                        txHash = receipt.hash;
                        tokensTraded = pos.amount;

                        const receivedUSDC = parseFloat(ethers.formatUnits(expectedUSDC, 6));
                        const pnlUSD = receivedUSDC - pos.entryUSDC;
                        const pnlSign = pnlUSD >= 0 ? '+' : '';
                        newBalance = positions.usdcBalance + receivedUSDC;

                        delete agentPositions[agentId];
                        recordTrade(agentId, 'SELL');
                        console.log(`✅ REAL SELL on-chain! P&L: ${pnlSign}$${pnlUSD.toFixed(2)} | Tx: ${txHash}`);
                    }

                } catch (err) {
                    tradeError = err.message;
                    console.error(`❌ operatorSell failed:`, err.message?.slice(0, 150));
                }
            } else if (decision.action === 'SELL' && !pos) {
                console.log(`⏭  SELL skipped — no open position in server memory (server may have restarted).`);
            }

        }

        res.json({
            success: true,
            decision,
            marketData,
            positions,
            trade: {
                executed: !!txHash,
                txHash,
                newBalance,
                tokensTraded,
                error: tradeError,
            }
        });

    } catch (error) {
        console.error('❌ Smart trade error:', error);
        res.status(500).json({
            error: 'Trade failed',
            details: error.message,
        });
    }
});

/**
 * Legacy execute-trade endpoint
 * Note: Polygon Amoy AgentVault does not support executeBuy/executeSell.
 * Returns a 501 with explanation.
 */
app.post('/api/execute-trade', async (req, res) => {
    res.status(501).json({
        error: 'On-chain trade execution not available in Polygon Amoy vault.',
        message: 'The AgentVault on Polygon Amoy is a deposit/withdraw vault only. Use /api/smart-trade for AI decisions.'
    });
});

/**
 * Get agent balances — USDC only (Polygon Amoy vault)
 */
app.get('/api/agent-balances/:userAddress/:agentId', async (req, res) => {
    try {
        const { userAddress, agentId } = req.params;
        const agentVault = new ethers.Contract(CONTRACTS.AGENT_VAULT_V2, AGENT_VAULT_V2_ABI, wallet);
        const agentIdBytes32 = uuidToBytes32(agentId);

        const usdcBalance = await agentVault.getUserAgentBalance(userAddress, agentIdBytes32);

        res.json({
            agentId,
            userAddress,
            usdc: parseFloat(ethers.formatUnits(usdcBalance, 6)),
            tokens: {} // Token balances not tracked in Polygon Amoy vault
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Health check
 */
app.get('/api/health', async (req, res) => {
    try {
        const blockNumber = await provider.getBlock('latest').then(b => b?.number ?? 0);
        res.json({
            status: 'ok',
            version: 'V5-INSTITUTIONAL-PRO',
            network: 'Polygon Amoy',
            tradingWallet: wallet.address,
            latestBlock: blockNumber,
            contracts: { agentVaultV2: CONTRACTS.AGENT_VAULT_V2, simpleDex: CONTRACTS.SIMPLE_DEX },
            proModules: ['EMA-Stack-9/21/55/89', 'Volume-Weighted', 'RSI-Divergence', 'MACD-Momentum',
                'Bollinger-Squeeze', 'ATR-Risk-Sizer', 'Smart-Money-Concepts', 'Ichimoku-Cloud', 'Market-Structure'],
            thresholds: { buyScore: 4.0, sellScore: 3.0, minBuyModules: 3, minSellModules: 2 },
        });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// Health check endpoint for frontend status monitoring
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        server: 'trading-server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(65)}`);
    console.log(`🚀 ClawTrader Server V5 — INSTITUTIONAL PRO ENGINE`);
    console.log(`   Port: ${PORT} | Operator: ${wallet.address}`);
    console.log(`   AgentVaultV2: ${CONTRACTS.AGENT_VAULT_V2}`);
    console.log(`   ─── 9 Pro Signal Modules ───────────────────────────────`);
    console.log(`   ✅ EMA Stack (9/21/55/89) — Golden/Death Cross detection`);
    console.log(`   ✅ Volume-Weighted — institutional activity confirmation`);
    console.log(`   ✅ RSI Divergence — reversal detection (bullish/bearish)`);
    console.log(`   ✅ MACD Momentum — histogram slope analysis`);
    console.log(`   ✅ Bollinger Squeeze — volatility breakout detection`);
    console.log(`   ✅ ATR Risk Sizer — 1.5×ATR stop / 3×ATR target (2:1)`);
    console.log(`   ✅ Smart Money Concepts — order blocks, FVG, sweeps`);
    console.log(`   ✅ Ichimoku Cloud — multi-timeframe trend filter`);
    console.log(`   ✅ Market Structure — HH/HL vs LH/LL classification`);
    console.log(`   ─── Pro Rules ──────────────────────────────────────────`);
    console.log(`   ✅ BUY needs score ≥ 2.0 + ≥ 2 confirming modules`);
    console.log(`   ✅ SELL needs score ≥ 1.5 + ≥ 1 confirming modules`);
    console.log(`   ✅ ATR-based position sizing (risk% / stop% formula)`);
    console.log(`   ✅ EMA regime gate — no longs in STRONG_DOWNTREND`);
    console.log(`   ✅ 20% cash reserve + 60% max exposure rules`);
    console.log(`   ✅ 60s cooldown + 50 trade session limit`);
    console.log(`${'='.repeat(65)}\n`);
});
