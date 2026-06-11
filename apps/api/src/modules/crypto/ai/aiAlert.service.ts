import { env } from '../../../config/env.js';
import { findCoin } from '../crypto.coins.js';
import { cryptoService } from '../crypto.service.js';
import { SeedCryptoDataProvider } from '../market/SeedCryptoDataProvider.js';
import { generateBatch } from './agentAlertProvider.js';
import { cacheGet, cacheSet } from './aiAlert.cache.js';
import type { AlertContext, AlertResult, CryptoAlert } from './aiAlert.types.js';
import { bollinger, rsi, sma } from './indicators.js';
import { ruleAlertProvider } from './ruleAlertProvider.js';
import { buildSignals, severityFrom } from './signals.js';

const provider = new SeedCryptoDataProvider();
const TTL_MS = 15 * 60 * 1000;
const STABLE = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD']);
const SEV_ORDER = { critical: 0, warning: 1, info: 2 } as const;

const useAgent = Boolean(env.LLM_BASE_URL && env.LLM_API_KEY);

/**
 * Analyse every pending coin in one shot: a single batched LLM call when the
 * agent is configured, falling back to the per-coin rule provider if the agent
 * is off or the batch call fails. Results align to the input order.
 */
async function generateAll(contexts: AlertContext[]): Promise<AlertResult[]> {
  if (useAgent && contexts.length > 0) {
    try {
      return await generateBatch(contexts);
    } catch {
      // graceful fallback — rule provider, per coin
    }
  }
  return Promise.all(contexts.map((ctx) => ruleAlertProvider.generate(ctx)));
}

export const aiAlertService = {
  async getAlerts(userId: string): Promise<{ alerts: CryptoAlert[] }> {
    const { holdings } = await cryptoService.portfolio(userId);
    const alerts: CryptoAlert[] = [];
    // Coins needing fresh analysis — contexts built here, generated in one batch.
    const pending: { key: string; ctx: AlertContext }[] = [];

    for (const h of holdings) {
      if (Number(h.qty) <= 0) continue;
      const key = `${userId}|${h.coinSymbol}|${h.wallet}`;
      const cached = cacheGet<CryptoAlert>(key);
      if (cached) {
        alerts.push(cached);
        continue;
      }

      if (STABLE.has(h.coinSymbol)) {
        const alert: CryptoAlert = {
          coinSymbol: h.coinSymbol,
          wallet: h.wallet,
          severity: 'info',
          title: `${h.coinSymbol} ổn định`,
          message: 'Stablecoin — không áp dụng phân tích kỹ thuật.',
          signals: [],
          computedAt: new Date().toISOString(),
        };
        cacheSet(key, alert, TTL_MS);
        alerts.push(alert);
        continue;
      }

      const coin = findCoin(h.coinSymbol);
      const candles = await provider.fetchOhlc(coin?.coinId ?? h.coinSymbol.toLowerCase(), '3m');
      const closes = candles.map((c) => c.close);
      const price = Number(h.currentPriceVnd ?? closes[closes.length - 1] ?? 0);
      const boll = bollinger(closes, 20);
      const ctx: AlertContext = {
        coinSymbol: h.coinSymbol,
        wallet: h.wallet,
        holding: {
          avgCostVnd: h.avgCostVnd,
          qty: h.qty,
          currentPriceVnd: h.currentPriceVnd ?? '0',
          pnlPct: h.pnlPct ?? '0',
          change24hPct: h.change24hPct ?? '0',
        },
        indicators: {
          rsi: rsi(closes, 14),
          sma20: sma(closes, 20),
          sma50: sma(closes, 50),
          bollUpper: boll.upper,
          bollLower: boll.lower,
          price,
        },
        signals: [],
        severity: 'info',
      };
      ctx.signals = buildSignals({
        indicators: ctx.indicators,
        holding: { pnlPct: Number(ctx.holding.pnlPct), change24hPct: Number(ctx.holding.change24hPct) },
      });
      ctx.severity = severityFrom(ctx.signals);
      pending.push({ key, ctx });
    }

    const results = await generateAll(pending.map((p) => p.ctx));
    const computedAt = new Date().toISOString();
    pending.forEach(({ key, ctx }, i) => {
      const res = results[i]!; // generateAll returns one result per input, in order
      const alert: CryptoAlert = {
        coinSymbol: ctx.coinSymbol,
        wallet: ctx.wallet,
        severity: res.severity,
        title: res.title,
        message: res.message,
        signals: ctx.signals,
        computedAt,
      };
      cacheSet(key, alert, TTL_MS);
      alerts.push(alert);
    });

    alerts.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    return { alerts };
  },
};
