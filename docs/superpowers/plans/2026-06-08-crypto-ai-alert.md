# Crypto AI Alert — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **NO GIT this build.** "Commit" → **Checkpoint** (typecheck/test). Never run git.
>
> **Prerequisite:** Phase 4 (Crypto) implemented — `cryptoService.portfolio`, `SeedCryptoDataProvider`, `CryptoDataProvider`.
>
> **Secret handling:** `LLM_API_KEY` lives only in `apps/api/.env` (gitignored). Never write it into any tracked file; `.env.example` carries placeholders only.

**Goal:** On-demand AI technical-analysis alerts for crypto holdings — a deterministic TA engine grounds an OpenAI Agents-SDK explainer (with a rule-based fallback), exposed at `GET /crypto/alerts`, cached ~15 min, no new DB table.

**Architecture:** `indicators` + `signals` (pure, tested) → `AlertContext` → `AiAlertProvider` (agent via 9router proxy, else/at-failure rule-based) → cached service → route → web panel. OHLC added to the crypto provider (seed).

**Tech:** decimal not needed (TA uses `number`); `@openai/agents` + `openai` (proxy), zod, vitest.

**Spec:** [../specs/2026-06-08-crypto-ai-alert-design.md](../specs/2026-06-08-crypto-ai-alert-design.md)

---

## Task 1: Deps + env + OHLC on the provider

**Files:**
- Modify: `apps/api/package.json`, `apps/api/src/config/env.ts`, `apps/api/.env.example`, `.env.example`, `.env.prod.example`
- Modify: `apps/api/src/modules/crypto/market/CryptoDataProvider.ts`, `apps/api/src/modules/crypto/market/SeedCryptoDataProvider.ts`

- [ ] **Step 1: Deps**

In `apps/api/package.json` `dependencies` add `"@openai/agents": "^0.1.0"`, `"openai": "^4.77.0"`. Run `pnpm install`. (Pin to the resolved versions after install.)

- [ ] **Step 2: Env**

In `apps/api/src/config/env.ts` add to the schema:
```ts
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
```
Add to `apps/api/.env.example`, root `.env.example`, and `.env.prod.example` (placeholders only — never the real key):
```bash
# AI alerts (OpenAI-compatible proxy). Leave blank to use the rule-based fallback.
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
```

- [ ] **Step 3: OHLC on the provider interface**

In `apps/api/src/modules/crypto/market/CryptoDataProvider.ts` add:
```ts
export interface CryptoCandle {
  time: string; // YYYY-MM-DD
  close: number;
}
```
and to the interface:
```ts
  fetchOhlc(coinId: string, range: '1m' | '3m' | '6m'): Promise<CryptoCandle[]>;
```

- [ ] **Step 4: Seed OHLC**

In `apps/api/src/modules/crypto/market/SeedCryptoDataProvider.ts` add (import `CryptoCandle`; reuse `usdPrice`/`FX` already in the file):
```ts
  async fetchOhlc(coinId: string, range: '1m' | '3m' | '6m'): Promise<import('./CryptoDataProvider.js').CryptoCandle[]> {
    const days = { '1m': 30, '3m': 90, '6m': 180 }[range];
    const coin = CRYPTO_COINS.find((c) => c.coinId === coinId);
    const base = (coin ? usdPrice(coin.symbol) : 100) * FX; // VND base
    let seed = [...coinId].reduce((s, c) => s + c.charCodeAt(0), 11);
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const out: { time: string; close: number }[] = [];
    let prev = base;
    const start = new Date();
    start.setDate(start.getDate() - days);
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const close = Math.max(1, Math.round(prev + (rand() - 0.5) * 0.06 * base)); // ±3%
      out.push({ time: d.toISOString().slice(0, 10), close });
      prev = close;
    }
    return out;
  }
```
(`CRYPTO_COINS` is already imported in this file; if not, add `import { CRYPTO_COINS } from '../crypto.coins.js';`.)

- [ ] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 2: `indicators.ts` (TDD)

**Files:**
- Create: `apps/api/src/modules/crypto/ai/indicators.ts`
- Create: `apps/api/src/modules/crypto/ai/indicators.test.ts`

- [ ] **Step 1: Failing tests**

Create `apps/api/src/modules/crypto/ai/indicators.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sma, ema, rsi, bollinger, pctChange } from './indicators.js';

describe('sma', () => {
  it('averages the last N', () => expect(sma([1, 2, 3, 4], 4)).toBe(2.5));
  it('clamps period to length', () => expect(sma([2, 4], 10)).toBe(3));
});

describe('ema', () => {
  it('equals the single value', () => expect(ema([5], 10)).toBe(5));
  it('is finite for a series', () => expect(Number.isFinite(ema([1, 2, 3, 4, 5], 3))).toBe(true));
});

describe('rsi', () => {
  it('all-up → 100', () => expect(rsi([1, 2, 3, 4, 5, 6], 5)).toBe(100));
  it('all-down → 0', () => expect(rsi([6, 5, 4, 3, 2, 1], 5)).toBe(0));
  it('within 0..100', () => {
    const v = rsi([1, 2, 1, 2, 1, 2, 3], 6);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});

describe('bollinger', () => {
  it('mid equals sma', () => {
    const closes = [10, 12, 14, 16, 18];
    expect(bollinger(closes, 5).mid).toBe(sma(closes, 5));
  });
});

describe('pctChange', () => {
  it('computes %', () => expect(pctChange(100, 120)).toBe(20));
  it('zero base → 0', () => expect(pctChange(0, 5)).toBe(0));
});
```

- [ ] **Step 2: Run — fail:** `pnpm --filter @finfolio/api test indicators`.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/crypto/ai/indicators.ts`:
```ts
export function sma(closes: number[], period: number): number {
  if (!closes.length) return 0;
  const p = Math.min(period, closes.length);
  const slice = closes.slice(-p);
  return slice.reduce((a, b) => a + b, 0) / p;
}

export function ema(closes: number[], period: number): number {
  if (!closes.length) return 0;
  const k = 2 / (period + 1);
  let e = closes[0]!;
  for (let i = 1; i < closes.length; i++) e = closes[i]! * k + e * (1 - k);
  return e;
}

export function rsi(closes: number[], period = 14): number {
  if (closes.length < 2) return 50;
  const n = Math.min(period, closes.length - 1);
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  if (gains === 0) return 0;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function stdev(closes: number[], period: number): number {
  if (!closes.length) return 0;
  const p = Math.min(period, closes.length);
  const slice = closes.slice(-p);
  const m = slice.reduce((a, b) => a + b, 0) / p;
  const v = slice.reduce((a, b) => a + (b - m) ** 2, 0) / p;
  return Math.sqrt(v);
}

export function bollinger(closes: number[], period = 20, k = 2): { mid: number; upper: number; lower: number } {
  const mid = sma(closes, period);
  const sd = stdev(closes, period);
  return { mid, upper: mid + k * sd, lower: mid - k * sd };
}

export function pctChange(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / from) * 100;
}
```

- [ ] **Step 4: Run — pass:** `pnpm --filter @finfolio/api test indicators`.
- [ ] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 3: `signals.ts` (TDD)

**Files:**
- Create: `apps/api/src/modules/crypto/ai/signals.ts`
- Create: `apps/api/src/modules/crypto/ai/signals.test.ts`

- [ ] **Step 1: Failing tests**

Create `apps/api/src/modules/crypto/ai/signals.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildSignals, severityFrom, type SignalInput } from './signals.js';

const base: SignalInput = {
  indicators: { rsi: 50, sma20: 100, sma50: 100, bollUpper: 130, bollLower: 70, price: 100 },
  holding: { pnlPct: 0, change24hPct: 0 },
};

describe('buildSignals', () => {
  it('flags overbought', () => {
    const s = buildSignals({ ...base, indicators: { ...base.indicators, rsi: 80 } });
    expect(s.some((x) => x.type === 'rsi_overbought')).toBe(true);
  });
  it('flags oversold', () => {
    const s = buildSignals({ ...base, indicators: { ...base.indicators, rsi: 20 } });
    expect(s.some((x) => x.type === 'rsi_oversold')).toBe(true);
  });
  it('flags stop_loss at -10%', () => {
    const s = buildSignals({ ...base, holding: { pnlPct: -12, change24hPct: 0 } });
    expect(s.some((x) => x.type === 'stop_loss')).toBe(true);
  });
  it('flags take_profit at +20%', () => {
    const s = buildSignals({ ...base, holding: { pnlPct: 25, change24hPct: 0 } });
    expect(s.some((x) => x.type === 'take_profit')).toBe(true);
  });
  it('flags volatility spike', () => {
    const s = buildSignals({ ...base, holding: { pnlPct: 0, change24hPct: -15 } });
    expect(s.some((x) => x.type === 'volatility_spike')).toBe(true);
  });
  it('calm market → no actionable signals', () => {
    expect(buildSignals(base).length).toBe(0);
  });
});

describe('severityFrom', () => {
  it('critical when stop_loss present', () => {
    const s = buildSignals({ ...base, holding: { pnlPct: -20, change24hPct: 0 } });
    expect(severityFrom(s)).toBe('critical');
  });
  it('info on empty', () => expect(severityFrom([])).toBe('info'));
});
```

- [ ] **Step 2: Run — fail:** `pnpm --filter @finfolio/api test signals`.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/crypto/ai/signals.ts`:
```ts
export type SignalType =
  | 'rsi_overbought'
  | 'rsi_oversold'
  | 'trend_up'
  | 'trend_down'
  | 'breakout_up'
  | 'breakout_down'
  | 'stop_loss'
  | 'take_profit'
  | 'volatility_spike';

export interface Signal {
  type: SignalType;
  dir: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0..1
  detail: string;
}

export interface SignalInput {
  indicators: {
    rsi: number;
    sma20: number;
    sma50: number;
    bollUpper: number;
    bollLower: number;
    price: number;
  };
  holding: { pnlPct: number; change24hPct: number };
}

export function buildSignals(input: SignalInput): Signal[] {
  const { indicators: ind, holding } = input;
  const out: Signal[] = [];

  if (ind.rsi >= 70) {
    out.push({ type: 'rsi_overbought', dir: 'bearish', strength: Math.min(1, (ind.rsi - 70) / 30 + 0.5), detail: `RSI ${ind.rsi.toFixed(0)} — vùng quá mua` });
  } else if (ind.rsi <= 30) {
    out.push({ type: 'rsi_oversold', dir: 'bullish', strength: Math.min(1, (30 - ind.rsi) / 30 + 0.5), detail: `RSI ${ind.rsi.toFixed(0)} — vùng quá bán` });
  }

  if (ind.sma20 > ind.sma50) out.push({ type: 'trend_up', dir: 'bullish', strength: 0.4, detail: 'SMA20 > SMA50 — xu hướng tăng' });
  else if (ind.sma20 < ind.sma50) out.push({ type: 'trend_down', dir: 'bearish', strength: 0.4, detail: 'SMA20 < SMA50 — xu hướng giảm' });

  if (ind.price >= ind.bollUpper) out.push({ type: 'breakout_up', dir: 'bearish', strength: 0.6, detail: 'Giá chạm dải Bollinger trên' });
  else if (ind.price <= ind.bollLower) out.push({ type: 'breakout_down', dir: 'bullish', strength: 0.6, detail: 'Giá chạm dải Bollinger dưới' });

  if (holding.pnlPct <= -10) out.push({ type: 'stop_loss', dir: 'bearish', strength: Math.min(1, Math.abs(holding.pnlPct) / 20), detail: `Lỗ ${holding.pnlPct.toFixed(1)}% so với giá vốn` });
  else if (holding.pnlPct >= 20) out.push({ type: 'take_profit', dir: 'bullish', strength: Math.min(1, holding.pnlPct / 40), detail: `Lãi ${holding.pnlPct.toFixed(1)}% so với giá vốn` });

  if (Math.abs(holding.change24hPct) >= 10) out.push({ type: 'volatility_spike', dir: 'neutral', strength: Math.min(1, Math.abs(holding.change24hPct) / 20), detail: `Biến động 24h ${holding.change24hPct.toFixed(1)}%` });

  return out.sort((a, b) => b.strength - a.strength);
}

export function severityFrom(signals: Signal[]): 'info' | 'warning' | 'critical' {
  if (signals.some((s) => s.type === 'stop_loss' || s.strength >= 0.8)) return 'critical';
  if (signals.length > 0) return 'warning';
  return 'info';
}
```

- [ ] **Step 4: Run — pass:** `pnpm --filter @finfolio/api test signals`.
- [ ] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 4: Types + cache (TDD cache)

**Files:**
- Create: `apps/api/src/modules/crypto/ai/aiAlert.types.ts`
- Create: `apps/api/src/modules/crypto/ai/aiAlert.cache.ts`
- Create: `apps/api/src/modules/crypto/ai/aiAlert.cache.test.ts`

- [ ] **Step 1: Types**

Create `apps/api/src/modules/crypto/ai/aiAlert.types.ts`:
```ts
import type { Signal } from './signals.js';

export type Severity = 'info' | 'warning' | 'critical';

export interface AlertContext {
  coinSymbol: string;
  wallet: string;
  holding: { avgCostVnd: string; qty: string; currentPriceVnd: string; pnlPct: string; change24hPct: string };
  indicators: { rsi: number; sma20: number; sma50: number; bollUpper: number; bollLower: number; price: number };
  signals: Signal[];
  severity: Severity;
}

export interface AlertResult {
  severity: Severity;
  title: string;
  message: string;
}

export interface CryptoAlert extends AlertResult {
  coinSymbol: string;
  wallet: string;
  signals: Signal[];
  computedAt: string;
}

export interface AiAlertProvider {
  generate(ctx: AlertContext): Promise<AlertResult>;
}
```

- [ ] **Step 2: Cache test**

Create `apps/api/src/modules/crypto/ai/aiAlert.cache.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cacheGet, cacheSet } from './aiAlert.cache.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('aiAlert.cache', () => {
  it('returns a fresh value', () => {
    cacheSet('k', { v: 1 }, 1000);
    expect(cacheGet<{ v: number }>('k')).toEqual({ v: 1 });
  });
  it('expires after TTL', () => {
    cacheSet('k2', { v: 2 }, 1000);
    vi.advanceTimersByTime(1500);
    expect(cacheGet('k2')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Cache impl**

Create `apps/api/src/modules/crypto/ai/aiAlert.cache.ts`:
```ts
const store = new Map<string, { value: unknown; expiresAt: number }>();

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}
```

- [ ] **Step 4: Run — pass:** `pnpm --filter @finfolio/api test aiAlert.cache`.
- [ ] **Step 5: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 5: Providers (rule TDD + agent)

**Files:**
- Create: `apps/api/src/modules/crypto/ai/ruleAlertProvider.ts`
- Create: `apps/api/src/modules/crypto/ai/ruleAlertProvider.test.ts`
- Create: `apps/api/src/modules/crypto/ai/agentAlertProvider.ts`

- [ ] **Step 1: Rule provider test**

Create `apps/api/src/modules/crypto/ai/ruleAlertProvider.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ruleAlertProvider } from './ruleAlertProvider.js';
import type { AlertContext } from './aiAlert.types.js';

const ctx: AlertContext = {
  coinSymbol: 'BTC',
  wallet: 'Binance',
  holding: { avgCostVnd: '1000000000', qty: '0.5', currentPriceVnd: '800000000', pnlPct: '-20', change24hPct: '-5' },
  indicators: { rsi: 25, sma20: 90, sma50: 100, bollUpper: 130, bollLower: 70, price: 80 },
  signals: [
    { type: 'stop_loss', dir: 'bearish', strength: 1, detail: 'Lỗ 20%' },
    { type: 'rsi_oversold', dir: 'bullish', strength: 0.7, detail: 'RSI 25' },
  ],
  severity: 'critical',
};

describe('ruleAlertProvider', () => {
  it('returns the ctx severity and a non-empty message', async () => {
    const r = await ruleAlertProvider.generate(ctx);
    expect(r.severity).toBe('critical');
    expect(r.title).toContain('BTC');
    expect(r.message.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — fail:** `pnpm --filter @finfolio/api test ruleAlertProvider`.

- [ ] **Step 3: Rule provider impl**

Create `apps/api/src/modules/crypto/ai/ruleAlertProvider.ts`:
```ts
import type { AiAlertProvider, AlertContext, Severity } from './aiAlert.types.js';

const SEV_LABEL: Record<Severity, string> = { info: 'Theo dõi', warning: 'Lưu ý', critical: 'Cảnh báo' };

export const ruleAlertProvider: AiAlertProvider = {
  async generate(ctx: AlertContext) {
    if (ctx.signals.length === 0) {
      return { severity: 'info', title: `${ctx.coinSymbol} ổn định`, message: 'Không có tín hiệu kỹ thuật đáng chú ý.' };
    }
    const lines = ctx.signals.map((s) => `• ${s.detail}`);
    const top = ctx.signals[0]!;
    const action =
      top.dir === 'bearish'
        ? 'Cân nhắc giảm tỷ trọng / đặt cắt lỗ.'
        : top.dir === 'bullish'
          ? 'Có thể cân nhắc chốt lời một phần hoặc giữ.'
          : 'Theo dõi sát biến động.';
    return {
      severity: ctx.severity,
      title: `${SEV_LABEL[ctx.severity]}: ${ctx.coinSymbol} (${ctx.wallet})`,
      message: `${lines.join('\n')}\n${action}`,
    };
  },
};
```

- [ ] **Step 4: Run — pass:** `pnpm --filter @finfolio/api test ruleAlertProvider`.

- [ ] **Step 5: Agent provider (no unit test — network)**

Create `apps/api/src/modules/crypto/ai/agentAlertProvider.ts`:
```ts
import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from '@openai/agents';
import OpenAI from 'openai';
import { z } from 'zod';

import { env } from '../../../config/env.js';
import type { AiAlertProvider, AlertContext } from './aiAlert.types.js';

const AlertOutput = z.object({
  severity: z.enum(['info', 'warning', 'critical']),
  title: z.string(),
  message: z.string(),
});

const INSTRUCTIONS = [
  'Bạn là trợ lý phân tích kỹ thuật crypto cho nhà đầu tư cá nhân.',
  'Bạn nhận JSON gồm chỉ báo kỹ thuật (RSI, SMA, Bollinger), giá hiện tại, giá vốn và các tín hiệu đã tính sẵn.',
  'CHỈ diễn giải dữ liệu được cung cấp; TUYỆT ĐỐI không bịa số liệu mới.',
  'Trả lời tiếng Việt, ngắn gọn, bình tĩnh, kèm một gợi ý hành động thận trọng (không phải lời khuyên đầu tư ràng buộc).',
  'Giữ nguyên mức severity được cung cấp.',
].join(' ');

let configured = false;
function ensureClient(): void {
  if (configured) return;
  setDefaultOpenAIClient(new OpenAI({ baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY }));
  setOpenAIAPI('chat_completions'); // proxy supports Chat Completions, not the Responses API
  setTracingDisabled(true);
  configured = true;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), ms)),
  ]);
}

export const agentAlertProvider: AiAlertProvider = {
  async generate(ctx: AlertContext) {
    ensureClient();
    const agent = new Agent({
      name: 'CryptoAlertAnalyst',
      model: env.LLM_MODEL,
      instructions: INSTRUCTIONS,
      outputType: AlertOutput,
    });
    const result = await withTimeout(run(agent, JSON.stringify(ctx), { maxTurns: 1 }), 8000);
    const out = result.finalOutput;
    if (!out) throw new Error('AI returned no output');
    return out;
  },
};
```

- [ ] **Step 6: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 6: Alert service

**Files:** Create `apps/api/src/modules/crypto/ai/aiAlert.service.ts`

- [ ] **Step 1: Implement**

Create `apps/api/src/modules/crypto/ai/aiAlert.service.ts`:
```ts
import { env } from '../../../config/env.js';
import { SeedCryptoDataProvider } from '../market/SeedCryptoDataProvider.js';
import { cryptoService } from '../crypto.service.js';
import { findCoin } from '../crypto.coins.js';
import { bollinger, rsi, sma } from './indicators.js';
import { buildSignals, severityFrom } from './signals.js';
import { agentAlertProvider } from './agentAlertProvider.js';
import { ruleAlertProvider } from './ruleAlertProvider.js';
import { cacheGet, cacheSet } from './aiAlert.cache.js';
import type { AlertContext, CryptoAlert } from './aiAlert.types.js';

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
```

- [ ] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck`. (If `crypto.service.portfolio` holding fields differ, align names.)

---

## Task 7: Route

**Files:** Modify `apps/api/src/modules/crypto/crypto.routes.ts`

- [ ] **Step 1: Add the alerts route**

In `crypto.routes.ts`:
- Import: `import { aiAlertService } from './ai/aiAlert.service.js';`
- Add (inside the plugin, after `/prices`):
```ts
  fastify.get(
    '/alerts',
    {
      schema: {
        tags: ['crypto'],
        response: {
          200: z.object({
            alerts: z.array(
              z.object({
                coinSymbol: z.string(),
                wallet: z.string(),
                severity: z.enum(['info', 'warning', 'critical']),
                title: z.string(),
                message: z.string(),
                signals: z.array(
                  z.object({
                    type: z.string(),
                    dir: z.string(),
                    strength: z.number(),
                    detail: z.string(),
                  }),
                ),
                computedAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => aiAlertService.getAlerts(request.user.sub),
  );
```

- [ ] **Step 2: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 8: Integration test (DB-gated)

**Files:** Create `apps/api/src/modules/crypto/ai/aiAlert.integration.test.ts`

- [ ] **Step 1: Gated test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('crypto AI alerts (integration)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
    // No LLM_API_KEY in tests → rule-based fallback path.
    const { buildApp } = await import('../../../app.js');
    app = await buildApp();
    await app.ready();
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `alert-${Date.now()}@finfolio.test`, password: 'Abcd1234' },
    });
    token = reg.json().accessToken;
    await app.inject({
      method: 'POST',
      url: '/v1/crypto/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: { coinId: 'bitcoin', coinSymbol: 'BTC', action: 'buy', quantity: 0.5, price: 1000000000, wallet: 'Binance' },
    });
  });

  afterAll(async () => app?.close());

  it('returns alerts with a valid severity', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/crypto/alerts', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const a = res.json().alerts;
    expect(Array.isArray(a)).toBe(true);
    if (a.length) expect(['info', 'warning', 'critical']).toContain(a[0].severity);
  });
});
```

- [ ] **Step 2: Run (no DB → skipped):** `pnpm --filter @finfolio/api test`.
- [ ] **Step 3: Checkpoint:** `pnpm --filter @finfolio/api typecheck`.

---

## Task 9: Web — alerts panel

**Files:**
- Modify: `apps/web/src/apis/crypto.api.ts`
- Modify: `apps/web/src/features/crypto/CryptoPortfolioPage.tsx`

- [ ] **Step 1: API client**

In `apps/web/src/apis/crypto.api.ts` add:
```ts
export interface CryptoAlert {
  coinSymbol: string;
  wallet: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  signals: { type: string; dir: string; strength: number; detail: string }[];
  computedAt: string;
}

export const getCryptoAlerts = async () =>
  (await api.get<{ alerts: CryptoAlert[] }>('/crypto/alerts')).data.alerts;
```

- [ ] **Step 2: Panel on the portfolio page**

In `apps/web/src/features/crypto/CryptoPortfolioPage.tsx`:
- Imports: `import { getCryptoAlerts } from '@/apis/crypto.api';`
- Query:
```tsx
  const alerts = useQuery({ queryKey: ['crypto', 'alerts'], queryFn: getCryptoAlerts });
```
- Render an "AI Cảnh báo" card (e.g. above the holdings table):
```tsx
      <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">AI Cảnh báo</h2>
          <button onClick={() => alerts.refetch()} className="text-xs text-neutral-400 hover:text-neutral-200">
            Phân tích lại
          </button>
        </div>
        {alerts.isLoading ? (
          <p className="text-sm text-neutral-500">Đang phân tích…</p>
        ) : (alerts.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-neutral-500">Không có cảnh báo.</p>
        ) : (
          <ul className="space-y-3">
            {alerts.data!.map((a) => (
              <li key={`${a.coinSymbol}-${a.wallet}`} className="flex gap-3">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    a.severity === 'critical' ? 'bg-loss' : a.severity === 'warning' ? 'bg-warning' : 'bg-neutral-500'
                  }`}
                />
                <div>
                  <div className="text-sm font-medium">{a.title}</div>
                  <p className="whitespace-pre-line text-sm text-neutral-400">{a.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
```
(Place inside the non-empty branch of the page, near the KPI/holdings section.)

- [ ] **Step 3: Checkpoint:** `pnpm --filter @finfolio/web typecheck`.

---

## Final verification

- [ ] **API:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`
  Expected: clean; `indicators`/`signals`/`ruleAlertProvider`/`aiAlert.cache` pass; AI integration skipped (no DB) or passing (with DB, rule-based path).
- [ ] **Web:** `pnpm --filter @finfolio/web typecheck` — clean.
- [ ] **Manual (with proxy):** set `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` in `apps/api/.env`; login; buy a volatile coin; open `/crypto` → "AI Cảnh báo" shows grounded VN alerts. Unset key → same shapes via rule-based.

---

## Acceptance criteria (from spec)

- [ ] `GET /crypto/alerts` returns per-(coin,wallet) alerts grounded in TA + P&L-vs-cost. (Tasks 2–7)
- [ ] Works with no AI key (rule-based) and with the 9router proxy (agent), identical shape. (Tasks 5–6)
- [ ] LLM never alters computed numbers; timeout/error → rule-based fallback. (Tasks 5–6)
- [ ] Stablecoins → info only; results cached ~15 min. (Tasks 4, 6)
- [ ] `LLM_API_KEY` only via env; `.env.example` placeholders. (Task 1)
- [ ] `pnpm --filter @finfolio/api test` green; TA/signals/rule/cache pass without network. (Tasks 2–5)
```
