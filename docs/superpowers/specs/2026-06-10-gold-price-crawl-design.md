# Gold Price Crawl — Design

> **Date:** 2026-06-10
> **Status:** Approved for planning
> **Depends on:** Gold module (Phase 2) — `gold_transactions`, `goldService.getPortfolio/getPrices`,
> `calculateGoldPortfolio`, the "Giá thị trường mua lại" card on the Gold screen.

## Goal

Crawl daily Vietnamese gold prices from 5 public sources, store them, and show **buy-back (mua lại)
+ sell prices per shop** in the existing "Giá thị trường mua lại" card. A cron runs **daily at 12:00**
to refresh. Crawled prices also feed **portfolio valuation / P&L** (best-effort mapping by gold type).

Currently **no source writes gold prices** — `price_cache` gold rows are empty/seed-only, so the card
and gold P&L show nothing real. This feature is the first real gold price feed.

## Sources (verified 2026-06-10)

| Key | Shop | URL | HTML | Unit on page | Notes |
|-----|------|-----|------|--------------|-------|
| `sjc` | Vàng SJC | https://giavang.org/trong-nuoc/sjc/ | static | **×1000đ/lượng** | giavang.org layout |
| `doji` | Vàng Doji | https://giavang.org/trong-nuoc/doji/ | static | **×1000đ/lượng** | same layout |
| `btmh` | Bảo Tín Mạnh Hải | https://giavang.org/trong-nuoc/bao-tin-manh-hai/ | static | **×1000đ/lượng** | same layout |
| `thanhlien` | Vàng Thành Liên | https://vangthanhlien.com/ | static | **đồng/chỉ** | own layout |
| `quanghanh` | Vàng Quang Hạnh | https://giavangmaothiet.com/gia-vang-quang-hanh-hom-nay/ | **403 to bots** | TBD | needs browser User-Agent; skip on fail |

**Unit normalization is mandatory** — store everything as canonical **VND per lượng**:
- giavang.org: page value `× 1000` → VND/lượng (e.g. `134.400` → `134_400_000`).
- thanhlien: page value `× 10` → VND/lượng (đồng/chỉ → đồng/lượng; e.g. `13_550_000` → `135_500_000`).
- quanghanh: detect at implementation (likely đồng/chỉ); adapter converts.

## Decisions (from clarification)

- **Cron:** daily at 12:00 (`0 12 * * *`), gated by existing `ENABLE_PRICE_SCHEDULER`. Plus a manual
  `POST /gold/prices/refresh` for on-demand.
- **Scope:** display in the card **and** use for portfolio valuation (mapping gold type → product).
- **Quang Hạnh 403:** fetch with a browser `User-Agent`; if still blocked, that source errors and is
  skipped — other sources still succeed. Never block the whole job.

## Storage — new table `gold_prices` (migration `0002`)

`price_cache` is single-source per symbol (unique `(asset_type, symbol)`) and several shops share product
names (e.g. "SJC Lẻ" on both SJC and Doji) → collision. Use a **dedicated multi-shop table**; leave
`price_cache` for stock/crypto untouched.

```
gold_prices
  id           uuid pk
  source       varchar(40)  not null   -- shop key: sjc|doji|btmh|thanhlien|quanghanh
  product_name varchar(120) not null    -- e.g. "SJC 1L", "Nhẫn 9999", "Thành Liên 9999 24k"
  price_buy    numeric(24,2)            -- canonical VND/lượng (shop buys back from you)
  price_sell   numeric(24,2)            -- canonical VND/lượng
  currency     varchar(10)  not null default 'VND'
  unit         varchar(10)  not null default 'luong'
  fetched_at   timestamptz  not null default now()
  unique (source, product_name)         -- idempotent upsert
  index (source)
```

Drizzle: `db/schema/gold-prices.ts`, register in `schema/index.ts`; hand-author `drizzle/0002_gold_prices.sql`
+ journal entry idx 2 (matches the scaffold's hand-authored-migration approach).

## Source adapter (`modules/gold/market/`)

```ts
interface GoldQuote {
  productName: string;
  priceBuy: string | null;   // VND/lượng, canonical
  priceSell: string | null;  // VND/lượng, canonical
}
interface GoldPriceSource {
  key: string;     // 'sjc' | 'doji' | ...
  label: string;   // display name
  fetch(): Promise<GoldQuote[]>;
}
```

Implementations:
- **`GiavangOrgSource`** — constructor `(key, label, path)`; parses the giavang.org table; `× 1000`.
  Three instances: sjc, doji, btmh.
- **`VangThanhLienSource`** — parses vangthanhlien.com; `× 10` (chỉ→lượng).
- **`QuangHanhSource`** — giavangmaothiet.com with `User-Agent` header; throws on 403 (→ skipped).
- **`MockGoldPriceSource`** — canned quotes, no network (tests).

Shared `lib/http-html.ts`: `fetchHtml(url, opts?)` → Node `fetch` with a browser `User-Agent`
(`GOLD_CRAWL_USER_AGENT` env, default a Chrome UA) → cheerio root. Parsing uses **`cheerio`** (new dep).

`market/sources.ts`: `goldPriceSources()` → array of the real sources (registry).

## Service (`modules/gold/gold-price.service.ts`)

- `refreshGoldPrices(sources = goldPriceSources())`:
  for each source → `try { quotes = await source.fetch(); upsert each into gold_prices
  onConflict(source, product_name) doUpdate {price_buy, price_sell, fetched_at} } catch { log + record error }`.
  Returns `{ sources: [{ key, label, count, error? }], total }`. One source failing never aborts others.
- `listGoldPrices()` (card read): rows from `gold_prices`, grouped/flat with `stale`
  (`now - fetched_at > GOLD_PRICE_STALE_MS`, ~26h since daily) + `source` label. Shape stays compatible
  with the existing `goldPriceSchema` (`symbol = product_name`, `source = label`).

## Valuation integration (best-effort)

`gold.calc` works internally in **chỉ** (`Q_SCALE`, 1 lượng = 10 chỉ); crawled canonical is **VND/lượng**
→ feed valuation as **VND/chỉ = VND/lượng ÷ 10**.

`resolveCurrentPrice(goldType, quotes)` (pure, unit-tested):
- normalize (uppercase, strip spaces/accents), match `goldType` against `product_name` by exact → substring
  (e.g. `"SJC 9999"` → a product containing `"SJC"`), with a **source priority** (SJC official > Doji > BTMH
  > Thành Liên > Quang Hạnh).
- returns the matched `price_buy` (buy-back = liquidation value) in **VND/lượng**; caller ÷10 for calc.
- no match → fallback to current DCA behavior (unchanged).

`goldService.getPortfolio` switches its price source from `price_cache` to `gold_prices` via this resolver.

## Routes (`gold.routes.ts`)

- `GET /gold/prices` — unchanged shape, now backed by `gold_prices` (`listGoldPrices`).
- `POST /gold/prices/refresh` — JWT-guarded, runs `refreshGoldPrices`, returns the per-source summary.

## Scheduler (`plugins/scheduler.ts`)

Inside the `ENABLE_PRICE_SCHEDULER` block, add a `0 12 * * *` task calling `refreshGoldPrices`
(`.catch` logs). `.stop()` on `onClose`.

## Web (`apps/web`)

- `apis/gold.api.ts`: keep `getGoldPrices`; add `refreshGoldPrices()` → `POST /gold/prices/refresh`.
- `features/gold/GoldPage.tsx` — "Giá thị trường mua lại" card: **group by source (shop)**; per product
  show buy-back (mua lại) + sell, `fetchedAt`, `stale` badge. Add a "Cập nhật giá" button (manual
  refresh → toast + invalidate `['gold']`). Surface per-source errors if any.

## Env + deps

- `config/env.ts`: `GOLD_CRAWL_USER_AGENT` (optional, default a Chrome UA). Reuse `ENABLE_PRICE_SCHEDULER`.
- New dep: **`cheerio`**. Node `fetch` native (Node ≥ 23). No headless browser.

## Testing

- **Pure parser tests (no network):** feed saved HTML fixtures → each parser returns expected `GoldQuote[]`
  with correct **unit conversion** (giavang ×1000, thanhlien ×10).
- **`resolveCurrentPrice`**: gold type → product match + source priority + ÷10 to VND/chỉ + no-match fallback.
- **Integration (DB-gated, `MockGoldPriceSource`):** `refreshGoldPrices` → `gold_prices` rows; re-run is
  idempotent (upsert, no dupes); `GET /gold/prices` returns them grouped with `stale`.
- **Manual/network:** real crawl of the 5 URLs — out of automated tests (live sites, may change markup).

## Acceptance criteria

- [ ] Daily 12:00 cron crawls all reachable sources → `gold_prices`; one source 403/markup-break does not
      abort the others.
- [ ] "Giá thị trường mua lại" card shows real buy-back + sell prices per shop, in VND/lượng, with stale badge.
- [ ] `POST /gold/prices/refresh` triggers an on-demand crawl.
- [ ] Portfolio P&L uses crawled buy-back price (mapped by gold type, ÷10 to chỉ); falls back to DCA on no match.
- [ ] `pnpm --filter @finfolio/api test` green; parser + unit-conversion + resolver tests pass without network.

## Out of scope

- Headless-browser crawling (Playwright) — only `fetch` + UA; sources needing JS are skipped.
- Historical price storage / charts (only latest per source/product is kept).
- Per-region (HN/ĐN/HCM) breakdown — take one representative row per product.
- Auto-creating gold types from crawled products; user gold types stay free-text.
- OKX/other gold marketplaces; git/CI.
