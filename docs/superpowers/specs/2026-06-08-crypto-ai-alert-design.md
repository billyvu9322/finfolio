# Crypto AI Alert — Design

> **Date:** 2026-06-08
> **Feature:** AI-assisted technical-analysis alerts for crypto holdings
> **Status:** Approved for planning
> **Depends on:** Phase 4 (Crypto) implemented (`crypto.service.portfolio`, `CryptoDataProvider`).
> **SRS:** realizes the deferred "AI Risk Management & Smart Alerts" (SRS §9.2 Phase 2) for crypto + FR-DASH-07 (featured AI alerts).

## Goal

For each crypto holding `(coin, wallet)`, compare **realtime price** against the user's **WAVG buy
cost** and a short **price history**, compute **technical-analysis** indicators/signals, and emit a
human-readable Vietnamese **alert** (severity + reasoning + suggested action). On-demand via
`GET /crypto/alerts`, cached in-memory ~15 min. No new DB table.

## Two-layer design (AI never invents numbers)

1. **Deterministic TA engine (pure TS, unit-tested)** — the source of truth.
   - `indicators.ts`: SMA, EMA, RSI(14), 24h change, stdev/Bollinger from a close-price series.
   - `signals.ts`: rules over indicators + holding → `Signal[]` (typed, with direction + strength).
2. **LLM layer (OpenAI Agents SDK)** — only **explains** the precomputed signals into a calm VN alert
   with a suggested action, via **structured output** (zod `outputType`). It is *grounded*: it receives
   the computed numbers and is instructed not to fabricate figures. On missing key / error / timeout it
   **falls back** to a deterministic rule-based template (so the feature always works).

## Decisions

- **Persistence:** none. In-memory TTL cache keyed `userId|coinSymbol|wallet` (~15 min). Recompute on `GET /crypto/alerts`.
- **OHLC:** extend `CryptoDataProvider` with `fetchOhlc(coinId, range)` (seed deterministic, mirrors the stock seed). Real CoinGecko OHLC later behind the same interface.
- **LLM:** `@openai/agents` with a custom OpenAI-compatible client (9router proxy) via env:
  - `LLM_BASE_URL` (e.g. `https://9router.nimo.io.vn/v1`), `LLM_API_KEY`, `LLM_MODEL` (e.g. `cx/gpt-5.5`).
  - `setDefaultOpenAIClient(new OpenAI({ baseURL, apiKey }))`, `setOpenAIAPI('chat_completions')` (proxy supports Chat Completions, not the Responses API), `setTracingDisabled(true)` (don't ship traces to OpenAI).
  - `Agent({ outputType: AlertOutputSchema })`, `run(agent, msg, { maxTurns: 1 })`.
- **Stablecoins** (USDT, USDC, and any coin flagged stable): skip TA → return a single `info` "ổn định, không cảnh báo".
- **Secrets:** `LLM_API_KEY` only via env (`apps/api/.env`, gitignored). `.env.example` carries placeholders. Never commit the key.

## Indicators (`modules/crypto/ai/indicators.ts`, pure)

Input: `closes: number[]` (oldest→newest), plus the current price.
- `sma(closes, period)`, `ema(closes, period)` (last value).
- `rsi(closes, period=14)` — Wilder's RSI, clamped 0..100 (all-gains → 100, all-losses → 0).
- `stdev(closes, period)` + `bollinger(closes, period=20, k=2)` → `{ upper, lower, mid }`.
- `pctChange(from, to)` helper.
All return plain `number`s; deterministic.

## Signals (`modules/crypto/ai/signals.ts`, pure)

Input: `{ indicators, holding: { avgCostVnd, qty, currentPriceVnd, change24hPct } }` → `Signal[]`:
- RSI ≥ 70 → `{ type:'rsi_overbought', dir:'bearish', strength }`; RSI ≤ 30 → `rsi_oversold` bullish.
- SMA20 vs SMA50: `> ` → `trend_up` bullish; `<` → `trend_down` bearish.
- Price ≥ Bollinger.upper → `breakout_up`; ≤ lower → `breakout_down`.
- P&L vs cost: `pnlPct ≤ -10` → `stop_loss` (critical-leaning); `pnlPct ≥ +20` → `take_profit`.
- `|change24h| ≥ 10` → `volatility_spike`.
`strength ∈ 0..1`. A pure `severityFrom(signals)` → `'info'|'warning'|'critical'` (critical if `stop_loss` or any strength ≥ 0.8; warning if any actionable; else info).

## AI alert provider

```ts
interface AlertContext {
  coinSymbol: string; wallet: string;
  holding: { avgCostVnd: string; qty: string; currentPriceVnd: string; pnlPct: string; change24hPct: string };
  indicators: { rsi: number; sma20: number; sma50: number; bollUpper: number; bollLower: number };
  signals: Signal[];
  severity: 'info' | 'warning' | 'critical';
}
interface AlertResult { severity: 'info'|'warning'|'critical'; title: string; message: string; }
interface AiAlertProvider { generate(ctx: AlertContext): Promise<AlertResult>; }
```
- `RuleAlertProvider` — deterministic VN templates from `ctx.signals`/`severity`. Always available.
- `AgentAlertProvider` — `@openai/agents`; grounded prompt (the JSON `ctx`), VN, "không bịa số, chỉ diễn giải, gợi ý hành động ngắn"; `outputType` = zod `{ severity, title, message }`; `maxTurns:1`; ~8s timeout.
- `aiAlert.service` picks `AgentAlertProvider` when `LLM_API_KEY` + `LLM_BASE_URL` set, else `RuleAlertProvider`; and wraps the agent call in try/catch → **falls back to rule** on any error.

## Service (`modules/crypto/ai/aiAlert.service.ts`)

`getAlerts(userId)`:
1. `crypto.service.portfolio(userId)` → holdings (qty>0).
2. For each holding: if stablecoin → push info, continue. Else cache lookup `userId|coin|wallet`; if fresh → use. Else: `provider.fetchOhlc(coinId, '3m')` → closes; `indicators` → `signals` → `severity` → `ctx`; `alertProvider.generate(ctx)` (agent→rule fallback); cache set (TTL 15m).
3. Return `[{ coinSymbol, wallet, severity, title, message, signals, computedAt }]`, ordered critical→warning→info.

`aiAlert.cache.ts`: tiny `Map<string,{ value; expiresAt }>` with `get`/`set(ttlMs)`.

## API

`GET /v1/crypto/alerts` (JWT) → `{ alerts: [{ coinSymbol, wallet, severity, title, message, signals, computedAt }] }`.
Added to `crypto.routes.ts`.

## Provider change

`CryptoDataProvider` gains `fetchOhlc(coinId: string, range: '1m'|'3m'|'6m'): Promise<{ time: string; close: number }[]>`.
`SeedCryptoDataProvider` implements it (deterministic walk seeded by symbol, like the stock seed).

## Env + deps

- `config/env.ts`: add `LLM_BASE_URL?`, `LLM_API_KEY?`, `LLM_MODEL` (default `'gpt-4o-mini'`).
- `apps/api/package.json`: add `@openai/agents`, `openai`.
- `.env.example` (+ `.env.prod.example`): `LLM_BASE_URL=`, `LLM_API_KEY=`, `LLM_MODEL=` placeholders.

## Web

- `apis/crypto.api.ts`: `getCryptoAlerts()`.
- `CryptoPortfolioPage`: an "AI Cảnh báo" panel — list alerts, severity-colored dot (critical=loss, warning=amber, info=neutral), title + message, a "Phân tích lại" refetch button. Empty → "Không có cảnh báo".

## Testing

- **Pure unit (no network):**
  - `indicators`: `sma`/`ema` exact on a known series; `rsi` → 100 for all-up, 0 for all-down, within 0..100 mixed; `bollinger` mid == sma.
  - `signals`: overbought/oversold, trend up/down, stop_loss at −10%, take_profit at +20%, volatility spike; `severityFrom` mapping.
  - `RuleAlertProvider.generate`: deterministic message reflects the dominant signal + severity.
  - `aiAlert.cache`: returns fresh, expires after TTL.
- **Not unit-tested (network/LLM):** `AgentAlertProvider` — exercised manually; covered by the try/catch fallback.
- **Integration (DB-gated):** register → buy a volatile coin → `GET /crypto/alerts` returns ≥1 alert with a valid severity; stablecoin holding → info.

## Acceptance criteria

- [ ] `GET /crypto/alerts` returns per-(coin,wallet) alerts grounded in computed TA + P&L-vs-cost.
- [ ] Works with **no** AI key (rule-based) and with the 9router proxy (agent), same response shape.
- [ ] LLM never alters the computed numbers; failure/timeout falls back to rule-based.
- [ ] Stablecoins skip TA (info only). Results cached ~15 min.
- [ ] `LLM_API_KEY` never committed; only via env.
- [ ] `pnpm --filter @finfolio/api test` green; TA/signals/rule/cache tests pass without network.

## Out of scope

Persisted alert history + dashboard AI widget wiring (FR-DASH-07 can read this endpoint later), push/email notifications, multi-asset (gold/stock) AI alerts, RAG/news. On-chain data. Real CoinGecko OHLC (interface ready).
