# Changelog

## v1.0.0 — MVP (unreleased)

Personal capital management for gold, Vietnamese stocks, and crypto.

- **Auth:** register/login/logout, JWT access + rotating refresh, profile update.
- **Gold:** transactions, DCA (FIFO), unrealized P&L, cached price support.
- **Stock:** transactions + dividends, WAVG, fee/tax, live (delayed) prices, candlestick detail.
- **Crypto:** transactions + swap, per-(coin, wallet) WAVG, USD/VND, 24h change.
- **Dashboard & Reports:** cross-asset AUM/P&L, allocation, growth from daily snapshots, P&L report, CSV export.
- **Ops:** Docker Compose (dev) + production compose (Cloudflare Tunnel, external PostgreSQL), release zip, backup script, Swagger UI.
