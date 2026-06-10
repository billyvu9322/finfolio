import { env } from '../../../config/env.js';
import { findCoin } from '../crypto.coins.js';
import { cryptoService } from '../crypto.service.js';
import { SeedCryptoDataProvider } from '../market/SeedCryptoDataProvider.js';
import { agentAlertProvider } from './agentAlertProvider.js';
import { cacheGet, cacheSet } from './aiAlert.cache.js';
import type { AlertContext, CryptoAlert } from './aiAlert.types.js';
import { bollinger, rsi, sma } from './indicators.js';
import { ruleAlertProvider } from './ruleAlertProvider.js';
import { buildSignals, severityFrom } from './signals.js';

const provider = new SeedCryptoDataProvider();
const TTL_MS = 15 * 60 * 1000;
const STABLE = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD']);
const SEV_ORDER = { critical: 0, warning: 1, info: 2 } as const;

const useAgent = Boolean(env.LLM_BASE_URL && env.LLM_API_KEY);

async function generate(ctx: AlertContext) {
  if (useAgent) {
    try {
      return await agentAlertProvider.generate(ctx);
    } catch {
      return ruleAlertProvider.generate(ctx); // graceful fallback
    }
  }
  return ruleAlertProvider.generate(ctx);
}

export const aiAlertService = {
  async getAlerts(userId: string): Promise<{ alerts: CryptoAlert[] }> {
    const { holdings } = await cryptoService.portfolio(userId);
    const alerts: CryptoAlert[] = [];

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

      const res = await generate(ctx);
      const alert: CryptoAlert = {
        coinSymbol: h.coinSymbol,
        wallet: h.wallet,
        severity: res.severity,
        title: res.title,
        message: res.message,
        signals: ctx.signals,
        computedAt: new Date().toISOString(),
      };
      cacheSet(key, alert, TTL_MS);
      alerts.push(alert);
    }

    alerts.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    return { alerts };
  },
};
