# FinFolio — Design System (DESIGN.md)

> **App:** FinFolio — Personal Capital Management
> **Platform target:** Stitch (Google) · Web SPA · Dark-mode first · Mobile-first responsive
> **Reference language:** dark fintech dashboard (à la "FinSight") — calm near-black surfaces, a single confident emerald accent, dense-but-breathable data cards, money rendered in tabular figures.
> **Covers:** every feature in the FinFolio SRS — Auth, Dashboard, Gold, Stocks, Crypto (+Swap), Reports, Settings.

---

## 0. Stitch Configuration (design tokens)

Use these when calling `create_design_system` / generating screens in Stitch.

| Token | Value |
|---|---|
| `colorMode` | `DARK` |
| `colorVariant` | `NEUTRAL` |
| `headlineFont` | `INTER` (alt for stronger Vietnamese diacritics: `BE_VIETNAM_PRO`) |
| `bodyFont` | `INTER` |
| `labelFont` | `INTER` |
| `monoFont` (numerics/tables) | `JETBRAINS_MONO` (alt: `SPACE_MONO`) |
| `roundness` | `ROUND_TWELVE` (cards/inputs 12px; pills full) |
| `customColor` (seed/primary) | `#10B981` (emerald) |
| `overridePrimaryColor` | `#10B981` |
| `overrideSecondaryColor` | `#3B82F6` (data blue) |
| `overrideTertiaryColor` | `#A855F7` (data violet) |
| `overrideNeutralColor` | `#0A0A0A` (canvas) |

**Design intent for Stitch generation:** "Premium dark fintech dashboard. Near-black layered surfaces, hairline borders, generous card padding, one emerald accent used sparingly for primary actions and positive trends. Big bold balance numbers in tabular mono. Soft glow only behind charts. No drop shadows on a light background — elevation comes from surface lightness + 1px borders. Calm, trustworthy, data-first."

---

## 1. Design Principles (from SRS §2.3)

1. **Accuracy-first** — money is the hero. Every figure ≥ 2 decimals, right-aligned, tabular numerals, thousands separators. Never let a number wrap or truncate silently.
2. **Mobile-first** — design at 320px, scale up. Touch targets ≥ 44px.
3. **Dark-mode first** — dark is the default and most-polished theme; light mode is Phase 2 but tokens are theme-agnostic.
4. **Privacy-calm** — no loud marketing, no dark patterns. A serious tool for a serious balance.
5. **Glanceable hierarchy** — KPIs in 1.5s, detail on demand (drill-down, hover, expand).
6. **Status by color + icon + sign** — never color alone (WCAG): profit = green + `▲` + `+`, loss = red + `▼` + `−`.

---

## 2. Color System

### 2.1 Surfaces (elevation by lightness, not shadow)

| Token | Hex | Use |
|---|---|---|
| `bg/canvas` | `#0A0A0A` | App background |
| `surface/1` | `#121214` | Cards, nav bar |
| `surface/2` | `#1A1A1E` | Nested panels, table header, inputs |
| `surface/3` | `#232329` | Hover row, popovers, dropdowns |
| `border/subtle` | `#26262C` | Hairline card/divider borders |
| `border/strong` | `#3A3A42` | Input focus ring base, active borders |
| `overlay/scrim` | `rgba(0,0,0,.6)` | Modal backdrop |

### 2.2 Text

| Token | Hex | Use |
|---|---|---|
| `text/primary` | `#F4F4F5` | Headlines, balances |
| `text/secondary` | `#A1A1AA` | Labels, captions |
| `text/tertiary` | `#71717A` | Hints, disabled, timestamps |
| `text/inverse` | `#0A0A0A` | On emerald buttons |

### 2.3 Brand & Accent

| Token | Hex | Use |
|---|---|---|
| `brand/500` | `#10B981` | Primary actions, active nav, brand mark, positive line |
| `brand/600` | `#059669` | Button hover/pressed |
| `brand/glow` | `rgba(16,185,129,.18)` | Soft radial behind hero chart |

### 2.4 Semantic — Profit / Loss (the most important pair)

| Token | Hex | Use |
|---|---|---|
| `profit` | `#16A34A` / text `#22C55E` | Gains, up %, buy-side |
| `loss` | `#DC2626` / text `#F87171` | Losses, down %, sell-side |
| `warning` | `#F59E0B` | Stale price, rate fallback, near-limit |
| `info` | `#3B82F6` | Neutral notices, T+2 hints |

> Profit/loss tints for chips: `profit/bg = rgba(34,197,94,.12)`, `loss/bg = rgba(248,113,113,.12)`.

### 2.5 Asset-Class Palette (charts, badges, donut)

Consistent everywhere a category appears (donut, legend, allocation bars, filters).

| Asset | Color | Hex |
|---|---|---|
| **Gold (Vàng)** | Amber | `#F59E0B` |
| **Stocks (Cổ phiếu)** | Blue | `#3B82F6` |
| **Crypto** | Violet | `#A855F7` |
| **Cash (Tiền mặt)** | Slate | `#64748B` |
| **Bonds/Other** | Teal | `#14B8A6` |

Each has a 12%-opacity `bg` variant for tag backgrounds and a solid variant for chart fills.

---

## 3. Typography

**Family:** Inter (UI) · JetBrains Mono (all numerics: balances, prices, %, quantities, table figures). Mono guarantees column alignment for money.

| Level | Size / Line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 32 / 40 | 700 | −0.02em | Hero balance (Total AUM) |
| `h1` | 24 / 32 | 600 | −0.01em | Page title ("Dashboard Overview") |
| `h2` | 20 / 28 | 600 | 0 | Card titles ("Portfolio Performance") |
| `h3` | 16 / 24 | 600 | 0 | Sub-section, modal title |
| `body` | 14 / 20 | 400 | 0 | Default text |
| `body-strong` | 14 / 20 | 600 | 0 | Row labels, emphasis |
| `label` | 13 / 16 | 500 | 0 | Field labels, nav, chips |
| `caption` | 12 / 16 | 400 | 0 | Timestamps, hints, table sub-text |
| `num/xl` (mono) | 28 / 34 | 700 | tabular | KPI value |
| `num/md` (mono) | 15 / 20 | 500 | tabular | Table money cells |
| `num/sm` (mono) | 12 / 16 | 500 | tabular | % deltas in chips |

**Number formatting**
- VND: `128.750.600 đ` (dot thousands, `đ` suffix, no decimals for whole VND; 2 decimals when sub-unit relevant).
- USD: `$8,954.30`.
- Crypto qty: up to 8 decimals, trailing zeros trimmed.
- Percent: `+5.21%` / `−1.23%`, always signed, 2 decimals.
- Always tabular numerals, right-aligned in tables.

---

## 4. Spacing, Radius, Elevation, Grid

**Spacing scale** (`4px` base): `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32 · 3xl 48`.
Card padding: `xl (24)` desktop, `lg (16)` mobile. Grid gutter: `lg (16)`.

**Radius:** `input/button 10` · `card 16` · `pill/chip full` · `avatar full`.

**Elevation** (dark = lighter surface + border, optional faint glow):
- `e0` flat (canvas)
- `e1` card: `surface/1` + `1px border/subtle`
- `e2` popover/dropdown: `surface/3` + `1px border/strong` + `0 8px 24px rgba(0,0,0,.4)`
- `e3` modal: `surface/2` + `border/strong` + `0 24px 64px rgba(0,0,0,.5)`

**Layout grid (desktop ≥1280px):** 12-col, max content width 1280, left sidebar 240 (or top-nav variant 64 tall). The reference uses a **top nav** — adopt top nav on desktop, collapse to bottom tab bar on mobile.

---

## 5. Iconography & Imagery

- **Icon set:** Lucide, 20px default / 16px in dense rows, `1.75` stroke, `text/secondary` (active = `brand/500`).
- **Asset/brand logos:** circular 32px token chips; real ticker logos for stocks/crypto where available, else monogram on asset-color bg.
- **Gold/Stock/Crypto module icons:** `coins`, `line-chart`, `bitcoin` (Lucide).
- No photography. Charts and numbers are the imagery.

---

## 6. Motion

| Interaction | Spec |
|---|---|
| Hover (card/row) | bg → `surface/3`, 120ms ease-out |
| Press (button) | scale 0.98, 80ms |
| Chart draw-in | line path 600ms ease-out; donut sweep 500ms |
| Number count-up | KPI values animate 400ms on load/refresh |
| Modal / drawer | fade + 8px rise, 180ms; mobile drawer slides up |
| Toast | slide-in top-right, auto-dismiss 4s |
| Skeleton shimmer | 1.2s loop while loading prices |

Respect `prefers-reduced-motion`: disable count-up, chart animations, parallax.

---

## 7. Component Library

### 7.1 Top Navigation (desktop)
- 64px tall, `surface/1`, bottom `border/subtle`.
- Left: brand mark (emerald glyph + "FinFolio" `h3`).
- Center: pill nav — Dashboard · Vàng · Chứng khoán · Crypto · Báo cáo · Cài đặt. Active item = filled pill `surface/3` + `brand/500` text.
- Right: search (`⌘K`), notification bell w/ unread dot, avatar + name + plan + chevron menu.

### 7.2 Bottom Tab Bar (mobile)
- 5 items max: Dashboard, Vàng, Stocks (center "+" FAB for Add Transaction), Crypto, More. Active = emerald icon + label.

### 7.3 KPI Stat Card  *(reference: the 4 top cards)*
- `surface/1`, radius 16, padding 24.
- Row: `label` (e.g., "Tổng tài sản (AUM)") + top-right tinted square icon (asset/semantic color, 12% bg).
- `num/xl` value.
- Delta chip: `▲ +5.21%` profit/bg or `▼ −1.23%` loss/bg + caption "vs kỳ trước".

### 7.4 Chart Card
- Header: `h2` title left; controls right (range tabs / dropdown).
- Range tabs: `1D 1W 1M 3M 6M 1Y All` segmented; active = `surface/3` pill.
- Body: chart. Crosshair tooltip = `e2` popover showing date + value + delta.
- Footer (optional): "Cập nhật lúc HH:mm" with stale `warning` dot if data cached.

### 7.5 Donut / Allocation Card
- Center label: total value (`num/md`) + "Total Value" caption.
- Legend rows: color dot · name · `%` · value, right-aligned. Click → drill-down to that asset module.
- "By Asset Class" dropdown to regroup (by wallet, by exchange, by storage).

### 7.6 Market Watch Strip *(reference: sparkline row)*
- Horizontal scroll of mini cards: logo · ticker · name · price · `±%` chip · 40px sparkline (green up / red down).

### 7.7 Data Table (portfolio / transactions)
- Header `surface/2`, `label` text, sortable carets.
- Rows 48px, hover `surface/3`, `1px` row dividers `border/subtle`.
- Money cells right-aligned mono; P&L cells colored.
- Sticky header on scroll; pagination 20/page (SRS); column-visibility menu.
- Row actions on hover: edit / delete (icon buttons) → confirm dialog.

### 7.8 List Item — Transaction / Holding
- Left: asset chip/logo. Middle: title `body-strong` + sub `caption` (date / type). Right: signed amount (`+` profit / `−` loss) + secondary value.
- Holding variant adds a thin allocation progress bar under the title (asset color).

### 7.9 Badges & Chips
- Action chips: Mua=`profit/bg`, Bán=`loss/bg`, Swap=`info/bg`, Cổ tức=`warning/bg`.
- Exchange tags: HOSE/HNX/UPCoM, neutral `surface/2`.
- Wallet/Storage tags: small slate chips.

### 7.10 Buttons
- **Primary:** `brand/500` bg, `text/inverse`, hover `brand/600`. ("Thêm giao dịch", "Lưu").
- **Secondary:** `surface/2` bg, `text/primary`, `border/subtle`. ("Export", "Add Widget" — icon + label, as reference).
- **Ghost / icon:** transparent, hover `surface/3`.
- **Danger:** `loss` text/border, fill on confirm.
- Heights: 40 (default), 36 (compact), 44 (mobile). Loading = spinner + disabled.

### 7.11 Form Controls
- Input: `surface/2`, `border/subtle`, radius 10, 40px; focus = `brand/500` 1px ring + glow. Error = `loss` border + helper text.
- Numeric input: mono, right-aligned, unit suffix slot (đ / USDT / Chỉ).
- Dropdown / Combobox: searchable (stock & coin autocomplete), virtualized list, `e2`.
- Radio group: Mua/Bán segmented pills (profit/loss tint when selected).
- Date-time picker: dark calendar, "Hôm nay" shortcut, defaults to `now()`.
- Toggle, slider (fee %), stepper.
- Inline validation + field-level helper (`caption`).

### 7.12 Feedback
- **Toast** (success/error/info), **inline alert** banner (e.g., price fallback to cache), **empty state** (icon + message + primary CTA "Nhập giao dịch đầu tiên"), **skeleton** loaders for cards/tables, **error state** with retry.
- **Confirm dialog** for destructive edit/delete (recompute warning: "DCA & P&L sẽ được tính lại").

### 7.13 Modal / Drawer
- Desktop: centered modal `e3` (forms) or right drawer (detail). Mobile: bottom sheet.

---

## 8. Data Visualization Specs

| Chart | Where | Spec |
|---|---|---|
| **Area/Line** | Dashboard Portfolio Performance, AUM growth | Emerald stroke 2px, vertical gradient fill `brand/glow → transparent`, dotted compare line for VN-Index (optional), crosshair tooltip, range tabs. |
| **Donut** | Asset Allocation | 5 asset colors, 16px ring, center total, hover segment lifts 4px + dims others. |
| **Candlestick** | Stock detail (3-month) | Up=profit, down=loss bodies; overlay buy▲/sell▼ markers at trade dates. |
| **Sparkline** | Market Watch, table rows | 40×20, color by direction, no axes. |
| **Bar** | Reports P&L by month | Profit/loss bars, zero baseline, hover value. |
| **Stacked bar / heat** | Reports by asset over time | Asset-color stacks. |

All charts: dark gridlines `border/subtle`, axis labels `text/tertiary` `caption`, empty + loading states defined.

---

## 9. Screen Specifications (all SRS features)

### 9.1 Authentication  *(FR-AUTH)*
Centered card `e3` on `bg/canvas` with faint emerald glow top.

- **Login** — email, password (show/hide), "Ghi nhớ", primary "Đăng nhập", link "Quên mật khẩu?", footer "Chưa có tài khoản? Đăng ký". Rate-limit notice on too many tries.
- **Register** — email, password (live strength meter: ≥8, uppercase, number per FR-AUTH-01), confirm, optional display name, terms. Success → "Kiểm tra email xác nhận".
- **Forgot password** — email → "Đã gửi link (hiệu lực 1 giờ)".
- **Reset password** — new + confirm password, strength meter.

### 9.2 Dashboard  *(FR-DASH)*  — primary screen, mirrors the reference
- **Header row:** `h1` "Tổng quan" + welcome subtext; right cluster: date-range picker, **Export**, **+ Add Widget**.
- **KPI row (4 cards):** Tổng AUM · Tổng vốn đầu tư · P&L tổng hợp (value + %ROI, colored) · Cash Balance. Each with vs-previous-period delta. *(FR-DASH-01..03)*
- **Portfolio Performance** chart card with range tabs + optional VN-Index compare. *(FR-DASH-05)*
- **Asset Allocation** donut + legend, drill-down. *(FR-DASH-04)*
- **Market Watch** sparkline strip (watchlist tickers).
- **Recent Transactions** list (cross-asset, "View All").
- **Top Holdings** list with allocation bars + value + %. 
- **Upcoming Events / AI Alerts** card: dividends, rate decisions, up to 3 AI alerts (Phase 2 placeholder, P2). *(FR-DASH-06/07)*
- **Top Gainers/Losers** mini list (P1).
- Responsive: 4-col KPI → 2×2 → 1-col; charts stack; lists become full-width.

### 9.3 Gold Management  *(FR-GOLD)*
- **/gold — Portfolio:** header KPIs (Tổng giá trị vàng, Vốn, P&L %ROI). Live gold-price panel (SJC/PNJ/DOJI buy-back, "Cập nhật lúc…", stale `warning`). Holdings table: Loại vàng · Số lượng (Chỉ/Lượng/Cây) · Giá vốn (DCA) · Giá hiện tại · Giá trị · %Tỷ trọng · P&L · %P&L. Transaction history table with filters (loại vàng, hành động, khoảng thời gian), 20/page. *(FR-GOLD-09..13)*
- **/gold/add — Add/Edit form** *(FR-GOLD-01..08)*: Loại vàng (dropdown + "Khác" free-text) · Mua/Bán segmented (Bán ≤ đang giữ) · Số lượng + unit selector (auto-convert Chỉ/Lượng/Cây) · Giá giao dịch (auto-fill market) · Phí (optional) · Ngày giờ (default now, allow past) · Nơi lưu trữ (Nhà / Ngân hàng+tên / Online) · Ghi chú (≤500). Live preview of resulting DCA & P&L. Edit/Delete → recompute confirm.

### 9.4 Stock Management  *(FR-STOCK)*
- **/stocks — Portfolio:** KPIs; holdings table (Mã · SL · Giá vốn WAVG · Giá hiện tại · Giá trị · %Tỷ trọng · P&L · %P&L, capital-gain vs dividend split). Real-time/15m-delay badge + 1-min refresh; closing price after hours. Watchlist. *(FR-STOCK-09..12)*
- **Stock detail drawer:** 3-month candlestick with buy/sell markers; dividend history. *(FR-STOCK-13/14)*
- **/stocks/add — form** *(FR-STOCK-01..08)*: Mã (autocomplete HOSE/HNX/UPCoM, uppercase, validate) · Sàn (auto-detect, override) · Hành động (Mua/Bán/Cổ tức tiền/Cổ tức CP) · SL (×100, min 100, HOSE multiple-of-100) · Giá khớp (auto close) · Phí & Thuế (default 0.15% buy; 0.15%+0.1% sell, auto-calc) · Ngày T (show T+2) · Tài khoản môi giới (optional). Fee/tax live breakdown.

### 9.5 Crypto Management  *(FR-CRYPTO)*
- **/crypto — Portfolio:** KPIs in USD + VND. Holdings table like stocks + **Ví/Sàn** column + 24h change chip (red/green). Filter by wallet/exchange. DCA per wallet. USD/VND rate shown with manual-override affordance. *(FR-CRYPTO-09..13)*
- **/crypto/add — form** *(FR-CRYPTO-01..06,08)*: Coin (autocomplete CoinGecko top 500 + custom) · Mua/Bán/Swap · Số lượng (8 decimals) · Giá (VND/USDT toggle, auto-convert) · Phí (coin gas or VND/USDT) · Nơi lưu (Binance/OKX/Bybit/MetaMask/Trust/Ledger/Khác) · Ngày giờ (UTC / Asia/Ho_Chi_Minh).
- **Swap sub-form** *(FR-CRYPTO-07)*: coin nguồn + SL → coin đích + SL nhận; preview "= 1 Bán + 1 Mua".

### 9.6 Reports  *(FR-REPORT)*
- **/reports:** period selector (Tháng/Quý/Năm + custom range). P&L summary cards (realized vs unrealized, by asset). Bar chart P&L by month; stacked by asset. Table: by-asset & by-month breakdown (tax-friendly, Thuế bán 0.1% note). **Export CSV** per module + range. **Portfolio Snapshot** picker — view portfolio state on any past date. *(FR-RPT-01..03)*

### 9.7 Settings  *(FR-AUTH-05)*
- **/settings:** Profile (display name, avatar), Đơn vị tiền tệ mặc định (VND/USD), Múi giờ, Đổi mật khẩu, Notification preferences, Sessions/logout. Data export. Danger zone.

---

## 10. Global States & Patterns

- **Empty states** — every list/table: illustrative icon + one-line guidance + primary CTA (SRS NFR 4.5). e.g., gold portfolio empty → "Chưa có giao dịch vàng. Nhập giao dịch đầu tiên."
- **Loading** — skeleton cards/rows; charts show shimmer; prices show last value + spinner.
- **Stale / fallback** — `warning` dot + tooltip "Giá cache lúc HH:mm" when live fetch fails (SRS reliability).
- **Errors** — inline banner + retry; form field errors from Zod messages.
- **Offline-aware** — banner "Đang offline — hiển thị dữ liệu đã lưu", sync on reconnect.

---

## 11. Responsive Breakpoints

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | ≥320 | Single column, top app-bar + bottom tab bar, center "+" FAB, bottom-sheet forms, cards full-width, tables → stacked cards. |
| Tablet | ≥768 | 2-col grids, collapsible filters, drawer detail. |
| Desktop | ≥1280 | 12-col, top nav, multi-card dashboard exactly as reference, modal forms. |

---

## 12. Accessibility (SRS NFR 4.5 — WCAG 2.1 AA)

- Contrast ≥ 4.5:1 body, ≥ 3:1 large/UI; verify emerald-on-dark and profit/loss on tints.
- **Never status-by-color-only** — pair with sign (`+/−`), arrow icon, and label.
- Full keyboard nav; visible focus ring (`brand/500` 2px); logical tab order; `⌘K` search.
- ARIA labels on icon buttons, charts (text summary + data table fallback), live regions for price updates.
- Respect `prefers-reduced-motion`.
- Hit targets ≥ 44px on touch.

---

## 13. Localization & Currency

- **Default vi-VN**; i18n keys ready for en (Phase 2).
- VND `1.234.567 đ`, USD `$1,234.56`, USDT shown where chosen; FX rate (USD/VND) surfaced and overridable.
- Dates `DD/MM/YYYY`, times 24h, timezone-aware (`Asia/Ho_Chi_Minh` / UTC for crypto).
- Vietnamese gold units (Chỉ/Lượng/Cây) with auto-conversion hints in inputs.

---

## 14. Asset → Color → Icon Quick Map (for consistent generation)

| Module | Accent | Icon | Action chips |
|---|---|---|---|
| Gold / Vàng | `#F59E0B` | `coins` | Mua / Bán |
| Stocks / CP | `#3B82F6` | `line-chart` | Mua / Bán / Cổ tức |
| Crypto | `#A855F7` | `bitcoin` | Mua / Bán / Swap |
| Cash | `#64748B` | `wallet` | — |
| Brand / primary | `#10B981` | `trending-up` | — |
| Profit / Loss | `#22C55E` / `#F87171` | `arrow-up` / `arrow-down` | — |

---

_© 2025 FinFolio Dev Team — Design System v1.0 (MVP). Built to be uploaded to Stitch via `upload_design_md` → `create_design_system_from_design_md`._
