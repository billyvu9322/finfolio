# FinFolio — Software Requirements Specification

> **Personal Capital Management Application**

| Field | Value |
|---|---|
| **Version** | MVP v1.0 |
| **Created** | 08/06/2025 |
| **Status** | Draft |
| **Team** | FinFolio Dev Team |
| **Tech Stack** | Node.js (Fastify) + React (Vite) + PostgreSQL |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [External API Integration](#5-external-api-integration)
6. [Database Design](#6-database-design-mvp)
7. [API Design (REST)](#7-api-design-rest)
8. [UI/UX Design](#8-uiux-design)
9. [MVP Scope & Roadmap](#9-mvp-scope--development-roadmap)
10. [Appendix](#10-appendix)

---

## 1. Introduction

### 1.1 Document Purpose

This Software Requirements Specification (SRS) document fully describes the functional and non-functional requirements of the FinFolio application, MVP version. The document serves as the foundation for the design, development, testing, and acceptance of the product.

### 1.2 Project Scope

FinFolio is a web application for personal capital management, allowing users to track and analyze investment performance across three main asset classes:

- Physical gold (SJC, PNJ, DOJI, plain rings 9999...)
- Vietnamese stocks (HOSE, HNX, UPCoM)
- Cryptocurrency / Crypto (Bitcoin, Ethereum, Altcoins...)

The MVP version focuses on core features: transaction entry, profit/loss calculation, portfolio display, and an overview dashboard.

### 1.3 Definitions & Terminology

| Term | Definition |
|---|---|
| **DCA** (Dollar-Cost Avg) | Method of computing the weighted-average cost basis by accumulated quantity |
| **P&L** (Profit & Loss) | Nominal profit/loss = (Current price − Average cost) × Quantity held |
| **AUM** | Assets Under Management — Total value of assets being managed |
| **FIFO / WAVG** | Cost-basis methods: First-In-First-Out / Weighted Average |
| **Lot** (stocks) | 1 lot = 100 shares per HOSE/HNX exchange rules |
| **Chỉ / Lượng / Cây** | 1 Cây = 10 Chỉ = 10 Lượng (depending on gold type), Vietnamese gold measurement units |
| **Delay 15m** | Stock prices are provided with a 15-minute delay per disclosure regulations |

### 1.4 Reference Documents

- Vietnam Securities Depository – VSD API / HOSE, HNX data feed
- CoinGecko Public API v3 – https://api.coingecko.com/api/v3
- SJC, PNJ, DOJI – Official gold-price disclosure websites
- Personal income tax regulations on stock transfers – Circular 111/2013/TT-BTC

---

## 2. System Overview

### 2.1 Overall Architecture

| Layer | Technology | Main Framework / Lib | Notes |
|---|---|---|---|
| **Frontend** | React + TypeScript | Vite, TanStack Router/Query, Tailwind CSS, Zustand, Zod | SPA, responsive |
| **Backend API** | Node.js + TypeScript | Fastify, Drizzle ORM, Swagger UI, OpenAI SDK | REST API + WebSocket (real-time prices) |
| **Database** | PostgreSQL | Drizzle ORM (schema-first) | Migrations, connection pool |
| **AI Layer** | OpenAI Agent SDK | Function calling, RAG | Risk alerts, portfolio advice |
| **Deploy** | Docker Compose | nginx reverse proxy | Single-host MVP deployment |

### 2.2 User Model

The MVP version targets individual investors with a single account. Multi-account / multi-tenant features will be expanded in a later phase.

### 2.3 Design Principles

- **Mobile-first**: responsive UI, prioritizing the mobile experience.
- **Offline-aware**: cache portfolio data locally, sync when online.
- **Privacy-first**: financial data stored on a private server, not shared with third parties beyond public APIs.
- **Accuracy-first**: all financial calculations must be accurate to ≥ 2 decimal places and unit-tested.

---

## 3. Functional Requirements

### 3.1 Authentication & Account Management (FR-AUTH)

| ID | Function | Detailed Description | Priority |
|---|---|---|---|
| FR-AUTH-01 | Register account | User registers with email + password. Validation: valid email, password ≥ 8 characters, with uppercase + number. Send confirmation email. | P0 |
| FR-AUTH-02 | Login | Login with email/password. JWT access token (15 min) + refresh token (30 days) httpOnly cookie. Rate limit: 5 times/min. | P0 |
| FR-AUTH-03 | Logout | Revoke refresh token, clear server-side cookie. | P0 |
| FR-AUTH-04 | Forgot password | Send reset link via email, link valid for 1 hour. | P1 |
| FR-AUTH-05 | Update profile | Allow changing display name, default currency (VND/USD), timezone. | P1 |

---

### 3.2 Overview Dashboard (FR-DASH)

#### 3.2.1 Function Description

The dashboard is the home screen, displaying a full picture of the user's financial situation in real time (or updated periodically per configuration).

#### 3.2.2 Detailed Requirements

| ID | Widget / Component | Description | Priority |
|---|---|---|---|
| FR-DASH-01 | Total AUM | Display total current asset value (VND). Compare with previous period (day/week/month). Format: `xxx,xxx,xxx đ`. | P0 |
| FR-DASH-02 | Total invested capital | Total money spent (including fees). Display with % change. | P0 |
| FR-DASH-03 | Aggregate P&L | Nominal profit/loss = AUM − Invested capital. Display both absolute value (đ) and % ROI. Green for profit / red for loss. | P0 |
| FR-DASH-04 | Asset allocation chart | Donut chart: proportion of Gold / Stocks / Crypto / Cash. Click each segment to drill down. | P0 |
| FR-DASH-05 | AUM growth chart | Line chart over time (7 days / 1 month / 3 months / 1 year / All). Compare with VN-Index (optional). | P0 |
| FR-DASH-06 | Top Gainers / Losers | Top 3 assets with the largest gains and losses during the day. | P1 |
| FR-DASH-07 | Featured alerts | Display up to 3 AI alerts (if any) directly on the dashboard. | P2 |

---

### 3.3 Gold Accumulation Management (FR-GOLD)

#### 3.3.1 Transaction Entry

| ID | Data Field | Description & Validation | Priority |
|---|---|---|---|
| FR-GOLD-01 | Gold type | Dropdown: SJC 1 Cây, SJC 5 Chỉ, SJC 2 Chỉ, plain ring 9999, PNJ, DOJI, Other (free-text). Required. | P0 |
| FR-GOLD-02 | Action | Radio button: Buy / Sell. Required. Sell cannot exceed the quantity held. | P0 |
| FR-GOLD-03 | Quantity | Numeric input. Unit: Chỉ / Lượng / Cây (auto-converted). Min > 0. Up to 4 decimal places. | P0 |
| FR-GOLD-04 | Transaction price | Buy/sell price at the time of the transaction (VND/Chỉ or VND/Lượng). Auto-fill current market price if left blank. | P0 |
| FR-GOLD-05 | Transaction fee | Optional. Rounding fee, crafting fee, tax... Added to the cost basis. | P0 |
| FR-GOLD-06 | Transaction date | Date-time picker. Default = `now()`. Allow entering historical dates. | P0 |
| FR-GOLD-07 | Storage location | Dropdown: Kept at home / Deposited at bank (record bank name) / Online gold (account). Required. | P0 |
| FR-GOLD-08 | Note | Optional text field, max 500 characters. | P1 |

#### 3.3.2 Display & Calculation

| ID | Feature | Detailed Description |
|---|---|---|
| FR-GOLD-09 | Actual gold price | Crawl/parse buy-back prices from SJC, PNJ, DOJI every 15 minutes (scheduled job). Cache in Redis/in-memory. Display last-update timestamp. |
| FR-GOLD-10 | Average cost basis (DCA) | Computed by WAVG: `DCA = Σ(Quantity × Buy price + Fee) / Total quantity still held`. Exclude sales (FIFO). |
| FR-GOLD-11 | Nominal P&L | Profit/loss = (Current buy-back price − DCA) × Total quantity held. Display % ROI. |
| FR-GOLD-12 | Transaction history | Transaction table with filters by gold type, action, time range. Default sort by time descending. Pagination 20 records/page. |
| FR-GOLD-13 | Edit / Delete transaction | Allow editing or deleting an entered transaction. System recomputes DCA and P&L after each change. |

---

### 3.4 Stock Management (FR-STOCK)

#### 3.4.1 Transaction Entry

| ID | Data Field | Description & Validation | Priority |
|---|---|---|---|
| FR-STOCK-01 | Stock symbol | Text input with autocomplete from the HOSE/HNX/UPCoM list. Uppercase. Required. Validate the symbol exists. | P0 |
| FR-STOCK-02 | Exchange | Auto-detect from the symbol: HOSE / HNX / UPCoM. Allow override. | P0 |
| FR-STOCK-03 | Action | Dropdown: Buy / Sell / Cash dividend / Stock dividend. Required. | P0 |
| FR-STOCK-04 | Quantity | Integer, unit shares (1 lot = 100 shares). Min 100. Validate multiples of 100 for HOSE. | P0 |
| FR-STOCK-05 | Matched price | Numeric, VND/share. Auto-fill with the closing price if left blank. | P0 |
| FR-STOCK-06 | Fees & Taxes | Brokerage fee (customizable %, default 0.15% on buy, 0.15% + 0.1% tax on sell). System auto-computes if a rate is entered. | P0 |
| FR-STOCK-07 | Transaction date | Date picker, day T (transaction). Settlement T+2 (informational display). | P0 |
| FR-STOCK-08 | Brokerage account | Optional: securities firm name (SSI, VCSC, MBS...). | P1 |

#### 3.4.2 Display & Calculation

| ID | Feature | Detailed Description |
|---|---|---|
| FR-STOCK-09 | Real-time / 15m-delayed price | Integrate stock data APIs (HOSE, HNX). Update intraday price every 1 minute. Outside trading hours, display the closing price. |
| FR-STOCK-10 | Average cost basis (WAVG) | Compute cost basis by the weighted-average method. Auto-adjust when receiving stock dividends. |
| FR-STOCK-11 | Per-symbol P&L | Nominal profit/loss per stock symbol. Distinguish capital gains and received dividends. |
| FR-STOCK-12 | Portfolio & weighting | Display portfolio table: Symbol \| Quantity \| Cost basis \| Current price \| Value \| % Weight \| P&L \| % P&L. |
| FR-STOCK-13 | Stock chart | Mini candlestick chart (3 months) for each symbol on hover/click. Mark buy/sell points on the chart. |
| FR-STOCK-14 | Dividend recording (MVP) | Allow entering cash dividends to record income. Stock dividends adjust the cost basis. _(Phase 2: automatic from VSD notifications)_ |

---

### 3.5 Crypto Management (FR-CRYPTO)

#### 3.5.1 Transaction Entry

| ID | Data Field | Description & Validation | Priority |
|---|---|---|---|
| FR-CRYPTO-01 | Coin/Token symbol | Autocomplete from the CoinGecko top 500 list. Allow a custom symbol if not found. Uppercase. | P0 |
| FR-CRYPTO-02 | Action | Dropdown: Buy / Sell / Swap (exchange coins). Required. | P0 |
| FR-CRYPTO-03 | Quantity | Decimal, up to 8 decimal places (satoshi-level). Min > 0. Required. | P0 |
| FR-CRYPTO-04 | Buy price | VND or USDT (per setting). If USDT, auto-convert to VND at the exchange rate at the transaction time. | P0 |
| FR-CRYPTO-05 | Transaction fee | Optional. Can be entered in coin (gas fee) or VND/USDT. | P0 |
| FR-CRYPTO-06 | Storage location | Dropdown + free text: Binance / OKX / Bybit / MetaMask / Trust Wallet / Ledger / Other. Required. | P0 |
| FR-CRYPTO-07 | Swap (exchange coins) | Enter source coin + quantity + destination coin + quantity received. Auto-compute 2 transactions Sell + Buy. | P0 |
| FR-CRYPTO-08 | Transaction date | DateTime picker, supports UTC or `Asia/Ho_Chi_Minh` timezone entry. | P0 |

#### 3.5.2 Display & Calculation

| ID | Feature | Detailed Description |
|---|---|---|
| FR-CRYPTO-09 | Real-time price | Connect to CoinGecko API (or CoinMarketCap). Update every 1 minute via polling, or WebSocket if available. Display USD and VND prices. |
| FR-CRYPTO-10 | USD/VND exchange rate | Fetch from ExchangeRate API or Vietcombank. Update every 1 hour. Allow manual rate override. |
| FR-CRYPTO-11 | Per-position P&L | Profit/loss per coin. Display both USD and VND. DCA computed by WAVG, separated per wallet/exchange. |
| FR-CRYPTO-12 | Portfolio & wallet allocation | Portfolio table similar to stocks. Add a "Wallet/Exchange" column. Filter by storage wallet/exchange. |
| FR-CRYPTO-13 | 24h Change | Display % price change over 24h per coin. Red/green color. |

---

### 3.6 Reporting & Data Export (FR-REPORT)

| ID | Feature | Description |
|---|---|---|
| FR-RPT-01 | Export CSV | Export each module's transaction history to CSV by time range. |
| FR-RPT-02 | Portfolio snapshot | Snapshot the portfolio on any given date to review a past state. |
| FR-RPT-03 | P&L summary | P&L report by month / quarter / year. Categorized by asset type. Useful for personal income tax filing. |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Criterion | MVP Threshold | Notes |
|---|---|---|
| API Response Time (P95) | < 300ms | Excluding external API calls (prices, exchange rates) |
| Page Load Time (FCP) | < 2 seconds | 3G connection, bundle ≤ 250KB gzipped |
| Dashboard Render | < 1 second | After data is cached |
| Concurrent Users | ≥ 50 users | Single-host deployment, PostgreSQL connection pool 20 |
| DB Query Time (P99) | < 100ms | Full indexing on `user_id`, `created_at`, `asset_type` |

### 4.2 Security

- **OWASP Top 10**: tested and patched before the MVP release.
- **JWT**: access token 15 min, refresh token 30 days, `httpOnly` + `Secure` + `SameSite` cookie.
- **Password hashing**: bcrypt, cost factor ≥ 12.
- **Input sanitization**: Zod schema validation on all API endpoints.
- **Rate limiting**: 100 req/min for normal APIs, 5 req/min for auth endpoints.
- **HTTPS mandatory**: nginx terminates TLS, redirects HTTP → HTTPS.
- **SQL Injection**: use Drizzle ORM, no raw queries.
- **Secrets management**: environment variables, no hardcoding, `.env.example` in the repo.

### 4.3 Reliability & Availability

- **Uptime SLA**: ≥ 99% (excluding scheduled maintenance < 2h/month).
- **Data backup**: PostgreSQL dump every 24h, retained for at least 7 days.
- **External API fallback**: if CoinGecko fails, fall back to CoinMarketCap (or the last cached price).
- **Graceful degradation**: if real-time prices cannot be fetched, display the cached price with a timestamp.

### 4.4 Maintainability & Extensibility

- **Code coverage**: unit test ≥ 70% (prioritizing financial calculation modules).
- **API documentation**: Swagger UI auto-generated, always up-to-date with the code.
- **Database migration**: Drizzle Kit migrate, no direct editing of the production schema.
- **Logging**: structured JSON log (Fastify pino), log level configurable via env.
- **Docker**: every service runs in a container, `docker-compose up` is enough for local dev.

### 4.5 Usability

- **Default language**: Vietnamese. Prepare i18n keys for English (phase 2).
- **Responsive**: mobile (≥ 320px), tablet (≥ 768px), desktop (≥ 1280px).
- **Accessibility**: WCAG 2.1 AA — contrast ratio, keyboard navigation, screen reader labels.
- **Empty state**: every empty screen has first-entry guidance.

---

## 5. External API Integration

| Module | Provider | Data | Frequency | Fallback |
|---|---|---|---|---|
| Gold | SJC Official | SJC buy/sell prices | 15 minutes | Last cached price |
| Gold | PNJ / DOJI | Ring gold prices, PNJ | 15 minutes | Last cached price |
| Stocks | HOSE/HNX Feed | Price, volume, OHLC | 1 minute (session) | Closing price |
| Stocks | VSD / SSI iBoard | Stock symbol list | Daily | Cache 7 days |
| Crypto | CoinGecko API v3 | Price, market cap, 24h change | 1 minute | CoinMarketCap |
| Exchange rate | ExchangeRate-API | USD/VND, USDT/VND | 1 hour | Vietcombank web |
| AI | OpenAI GPT-4o | Risk analysis, alerts | On-demand | Graceful skip |

> **Note:** All external API calls are made on the Backend (Node.js), not exposing API keys to the Frontend. Implement the circuit breaker pattern for external calls.

---

## 6. Database Design (MVP)

### 6.1 Main Tables

| Table Name | Description |
|---|---|
| `users` | User account info: `id`, `email`, `password_hash`, `display_name`, `currency`, `timezone`, `created_at` |
| `gold_transactions` | Gold transactions: `id`, `user_id`, `gold_type`, `action` (buy/sell), `quantity`, `unit`, `price_per_unit`, `fee`, `storage`, `transaction_at`, `note` |
| `stock_transactions` | Stock transactions: `id`, `user_id`, `symbol`, `exchange`, `action`, `quantity`, `price`, `brokerage_fee`, `tax`, `transaction_at`, `broker` |
| `crypto_transactions` | Crypto transactions: `id`, `user_id`, `coin_id`, `coin_symbol`, `action`, `quantity`, `price_vnd`, `price_usd`, `usd_vnd_rate`, `fee`, `fee_currency`, `wallet`, `transaction_at` |
| `price_cache` | Asset price cache: `id`, `asset_type` (gold/stock/crypto), `symbol`, `price_buy`, `price_sell`, `currency`, `fetched_at`, `source` |
| `portfolio_snapshots` | Daily portfolio snapshots: `id`, `user_id`, `snapshot_date`, `total_value`, `total_invested`, `pnl` (JSON breakdown) |
| `dividend_events` | Dividend events: `id`, `user_id`, `symbol`, `div_type` (cash/stock), `amount_per_share`, `record_date`, `payment_date` |

### 6.2 Important Indexes

```sql
-- users
CREATE UNIQUE INDEX ON users (email);

-- gold_transactions
CREATE INDEX ON gold_transactions (user_id, transaction_at DESC);
CREATE INDEX ON gold_transactions (user_id, gold_type);

-- stock_transactions
CREATE INDEX ON stock_transactions (user_id, symbol);
CREATE INDEX ON stock_transactions (user_id, transaction_at DESC);

-- crypto_transactions
CREATE INDEX ON crypto_transactions (user_id, coin_id);
CREATE INDEX ON crypto_transactions (user_id, wallet);

-- price_cache
CREATE UNIQUE INDEX ON price_cache (asset_type, symbol);
CREATE INDEX ON price_cache (fetched_at DESC);
```

---

## 7. API Design (REST)

### 7.1 Base URL & Authentication

```
Base URL:  https://api.finfolio.vn/v1
Auth:      Authorization: Bearer <access_token>
```

> All endpoints (except `/auth/*`) require JWT authentication.

### 7.2 MVP Endpoint List

| Method | Endpoint | Function | Response |
|---|---|---|---|
| `POST` | `/auth/register` | Register account | `201 { user, token }` |
| `POST` | `/auth/login` | Login | `200 { access_token, user }` |
| `POST` | `/auth/logout` | Logout | `204 No Content` |
| `GET` | `/dashboard/summary` | Dashboard overview | `200 { aum, invested, pnl, breakdown }` |
| `GET` | `/dashboard/growth?period=1m` | Growth chart | `200 { data: [{date, value}] }` |
| `GET` | `/gold/transactions` | List gold transactions | `200 { data: [], pagination }` |
| `POST` | `/gold/transactions` | Create new gold transaction | `201 { transaction }` |
| `PUT` | `/gold/transactions/:id` | Update gold transaction | `200 { transaction }` |
| `DELETE` | `/gold/transactions/:id` | Delete gold transaction | `204 No Content` |
| `GET` | `/gold/portfolio` | Gold portfolio + P&L | `200 { holdings, total_pnl }` |
| `GET` | `/gold/prices` | Current gold prices | `200 { prices, updated_at }` |
| `GET/POST/PUT/DELETE` | `/stocks/...` | CRUD similar to the Gold module | _(same pattern above)_ |
| `GET/POST/PUT/DELETE` | `/crypto/...` | CRUD similar to the Gold module | _(same pattern above)_ |
| `GET` | `/reports/pnl?from=&to=` | P&L report by period | `200 { summary, by_asset, by_month }` |
| `GET` | `/reports/export/csv` | Export transactions CSV | `200 text/csv attachment` |

---

## 8. UI/UX Design

### 8.1 Navigation Structure

| Route | Screen Name | Description |
|---|---|---|
| `/dashboard` | Overview Dashboard | Home screen, aggregates all assets |
| `/gold` | Gold Management | Gold portfolio + P&L chart |
| `/gold/add` | Add Gold Transaction | Gold transaction entry form |
| `/stocks` | Stock Management | Stock portfolio + watchlist |
| `/stocks/add` | Add Stock Transaction | Stock transaction entry form |
| `/crypto` | Crypto Management | Coin portfolio + storage wallets |
| `/crypto/add` | Add Crypto Transaction | Crypto transaction entry form |
| `/reports` | Reports | P&L report + export |
| `/settings` | Settings | Profile, currency, notifications |

### 8.2 Design System

- **Framework**: Tailwind CSS with custom config (FinFolio brand colors).
- **Component library**: Shadcn/ui + Radix UI Primitives.
- **Chart library**: Recharts or TradingView Lightweight Charts (for candlesticks).
- **Icon set**: Lucide React.
- **Color scheme**: Dark mode first, light mode optional (phase 2).
- **Typography**: Inter font (Google Fonts), rem units.

---

## 9. MVP Scope & Development Roadmap

### 9.1 In Scope — MVP v1.0

| Feature | Status |
|---|---|
| Authentication (register, login, change password) | ✅ Included |
| Overview dashboard (AUM, P&L, Donut chart, Line chart) | ✅ Included |
| Gold management — CRUD transactions + DCA + P&L | ✅ Included |
| Stock management — CRUD transactions + WAVG + P&L | ✅ Included |
| Crypto management — CRUD transactions + WAVG + P&L + Swap | ✅ Included |
| Live prices: gold (15m), stocks (1m), crypto (1m) | ✅ Included |
| Export transactions to CSV | ✅ Included |
| Swagger UI documentation | ✅ Included |
| Docker Compose deployment | ✅ Included |

### 9.2 Out of Scope — Phase 2+

| Feature | Expected Phase |
|---|---|
| AI Risk Management & Smart Alerts | Phase 2 |
| Crypto Staking / Lending (auto interest recording) | Phase 2 |
| Auto dividend sync from VSD | Phase 2 |
| Multi-user / Portfolio sharing | Phase 2 |
| Mobile app (React Native) | Phase 3 |
| Brokerage account connection (SSO/OpenBanking) | Phase 3 |
| Social / Copy trading | Phase 4 |

### 9.3 MVP Development Roadmap (Estimate)

| Sprint | Sprint Name | Main Deliverables | Duration |
|---|---|---|---|
| Sprint 1 | Foundation | Setup Docker, DB schema, Auth API + UI, CI pipeline | 2 weeks |
| Sprint 2 | Gold Module | Gold CRUD API + UI, gold price crawler, DCA engine | 2 weeks |
| Sprint 3 | Stock Module | Stock CRUD API + UI, real-time stock prices, WAVG engine | 2 weeks |
| Sprint 4 | Crypto Module | Crypto CRUD API + UI, CoinGecko integration, Swap | 2 weeks |
| Sprint 5 | Dashboard & Reports | Dashboard charts, P&L report, CSV export | 2 weeks |
| Sprint 6 | Polish & Launch | Testing, bug fix, performance, deployment, docs | 2 weeks |

> **Total estimated duration:** 12 weeks (~3 months)

---

## 10. Appendix

### 10.1 Financial Calculation Formulas

#### A. Weighted-Average Cost Basis (WAVG / DCA)

```
DCA = Σ(Qᵢ × Pᵢ + Feeᵢ) / Σ Qᵢ

  Qᵢ   = Quantity bought in transaction i
  Pᵢ   = Buy price in transaction i
  Feeᵢ = Transaction fee in transaction i
```

When selling partially: remove the sold quantity (FIFO by transaction order); the DCA of the remaining portion stays unchanged.

#### B. Nominal Profit/Loss (Unrealized P&L)

```
P&L    = (Current price − DCA) × Total quantity held
% ROI  = P&L / (DCA × Total quantity held) × 100
```

#### C. Stock Tax (Vietnam)

```
Sell tax = Sell value × 0.1%
```

> Computed on sale revenue, regardless of profit/loss — per Circular 111/2013/TT-BTC.

---

### 10.2 Gold Unit Conversion

| Unit | Conversion | Notes |
|---|---|---|
| 1 Lượng | = 37.5 grams | VN standard |
| 1 Cây | = 10 Chỉ = 10 Lượng (SJC) | = 375 grams (SJC gold bar) |
| 1 Chỉ | = 1/10 Lượng = 3.75 grams | VN standard |

---

### 10.3 Environment Variables (docker-compose.yml)

| Variable | Service | Description |
|---|---|---|
| `DATABASE_URL` | API | PostgreSQL connection string |
| `JWT_SECRET` | API | Secret key for signing JWT (≥ 32 chars random) |
| `OPENAI_API_KEY` | API | OpenAI API key for the AI module |
| `COINGECKO_API_KEY` | API | CoinGecko Pro API key (optional, higher rate limit) |
| `EXCHANGERATE_API_KEY` | API | ExchangeRate-API key for the USD/VND rate |
| `VITE_API_BASE_URL` | Frontend | Backend API URL |
| `REDIS_URL` | API | Redis URL for price cache (optional MVP) |

---

_© 2025 FinFolio Dev Team — Confidential_
