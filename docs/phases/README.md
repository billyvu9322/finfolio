# FinFolio — Implementation Phases

Work breakdown for the FinFolio MVP, derived from [SRS.md](../SRS.md) §9.3 roadmap and the
current scaffold (`apps/api`, `apps/web`). Each phase is one markdown file with goals,
task checklists (API + Web), the SRS feature IDs it delivers, and acceptance criteria.

UI references live in the Stitch project **FinFolio** (design system "Luminous Equity") and
the spec in [../DESIGN.md](../DESIGN.md).

## Phase index

| Phase | File | Theme | Est. | Status |
|---|---|---|---|---|
| 1 | [phase-1-foundation.md](phase-1-foundation.md) | Foundation: infra, DB, Auth, CI | 2 wks | 🟡 Scaffold done, hardening pending |
| 2 | [phase-2-gold.md](phase-2-gold.md) | Gold module: CRUD + DCA engine + price crawler | 2 wks | ⬜ Not started |
| 3 | [phase-3-stock.md](phase-3-stock.md) | Stock module: CRUD + WAVG + live price | 2 wks | ⬜ Not started |
| 4 | [phase-4-crypto.md](phase-4-crypto.md) | Crypto module: CRUD + Swap + CoinGecko + FX | 2 wks | ⬜ Not started |
| 5 | [phase-5-dashboard-reports.md](phase-5-dashboard-reports.md) | Dashboard, charts, P&L reports, CSV | 2 wks | ⬜ Not started |
| 6 | [phase-6-polish-launch.md](phase-6-polish-launch.md) | Testing, perf, a11y, deploy, docs | 2 wks | ⬜ Not started |
| 7 | [phase-7-exchange-sync.md](phase-7-exchange-sync.md) | Exchange/wallet sync (Binance read-only API key) | — | 🔵 Post-MVP |

**Total:** ~12 weeks (~3 months) for MVP (phases 1–6). Phase 7 is post-MVP.

## Conventions

- Tasks use `- [ ]` checkboxes; tick as completed.
- `(FR-XXX-00)` tags trace each task back to the SRS.
- "API" = `apps/api`, "Web" = `apps/web`.
- Every financial-calc module ships with unit tests (SRS NFR 4.4, ≥70% coverage).
- Dark-mode-first, vi-VN default, numbers in tabular mono per DESIGN.md.

## Cross-cutting (applies every phase)

- [ ] All endpoints JWT-guarded except `/auth/*`; Zod validation on every input.
- [ ] All money math accurate to ≥ 2 decimals, unit-tested.
- [ ] Loading / empty / error / stale states for every data screen (DESIGN.md §10).
- [ ] Responsive: mobile ≥320, tablet ≥768, desktop ≥1280.
- [ ] Swagger UI stays in sync (auto-generated).
