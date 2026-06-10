import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { getCryptoAlerts, getCryptoPortfolio } from "@/apis/crypto.api";
import { useAuthStore } from "@/stores/auth";

const vnd = (value: number) =>
  `${new Intl.NumberFormat("vi-VN").format(Math.round(value))} d`;
const usd = (value: number) =>
  `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;

export function CryptoPortfolioPage() {
  const [walletFilter, setWalletFilter] = useState("");
  const currency = useAuthStore((s) => s.user?.currency) ?? "VND";
  const portfolio = useQuery({
    queryKey: ["crypto", "portfolio"],
    queryFn: () => getCryptoPortfolio(),
  });
  const alerts = useQuery({ queryKey: ["crypto", "alerts"], queryFn: getCryptoAlerts });

  const fxRate = portfolio.data?.fxRate ?? 25000;
  // All amounts come from the API in VND; render in the user's default currency
  // (Settings). USD = VND / fxRate — no manual rate input.
  const fmt = (value: string | null | undefined) => {
    if (value == null) return "-";
    const num = Number(value);
    return currency === "USD" ? usd(num / fxRate) : vnd(num);
  };

  const totals = portfolio.data?.totals;
  const holdings = (portfolio.data?.holdings ?? []).filter(
    (holding) => !walletFilter || holding.wallet === walletFilter,
  );
  const wallets = [
    ...new Set(
      (portfolio.data?.holdings ?? []).map((holding) => holding.wallet),
    ),
  ];
  const coinCount = new Set(
    (portfolio.data?.holdings ?? []).map((holding) => holding.coinSymbol),
  ).size;
  const isEmpty = portfolio.data && portfolio.data.holdings.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Quản lý Crypto</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Theo dõi coin theo từng ví/sàn, giá trị quy đổi theo tiền mặc định
            ({currency}) và P&L chưa thực hiện.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/crypto/add"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Thêm giao dịch
          </Link>
        </div>
      </div>

      {portfolio.isLoading ? (
        <div className="mt-8 text-sm text-neutral-500">
          Đang tải danh mục crypto...
        </div>
      ) : null}
      {portfolio.isError ? (
        <div className="mt-8 rounded-lg border border-loss/30 bg-loss/10 p-4 text-sm text-loss">
          Không tải được danh mục crypto.
        </div>
      ) : null}

      {portfolio.data ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Kpi label="Tổng giá trị" value={fmt(totals?.valueVnd)} />
          <Kpi label="Tổng vốn" value={fmt(totals?.invested)} />
          <Kpi label="SL coin đang giữ" value={`${coinCount}`} />
          <Kpi
            label="P&L (%ROI)"
            value={`${fmt(totals?.pnl)} (${totals?.pnlPct ?? "0"}%)`}
            tone={Number(totals?.pnl ?? 0) >= 0 ? "profit" : "loss"}
          />
        </div>
      ) : null}

      {!isEmpty ? (
        <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">AI Cảnh báo</h2>
            <button
              onClick={() => alerts.refetch()}
              disabled={alerts.isFetching}
              className="text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
            >
              {alerts.isFetching ? "Đang phân tích…" : "Phân tích lại"}
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
                      a.severity === "critical"
                        ? "bg-loss"
                        : a.severity === "warning"
                          ? "bg-amber-400"
                          : "bg-neutral-500"
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
      ) : null}

      {isEmpty ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-700 p-8 text-center text-neutral-500">
          Chưa có giao dịch crypto. Thêm giao dịch để xem danh mục.
        </div>
      ) : (
      <>
        {wallets.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWalletFilter("")}
              className={`rounded px-3 py-1 text-xs ${!walletFilter ? "bg-neutral-700 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}
            >
              Tất cả ví
            </button>
            {wallets.map((wallet) => (
              <button
                key={wallet}
                type="button"
                onClick={() => setWalletFilter(wallet)}
                className={`rounded px-3 py-1 text-xs ${walletFilter === wallet ? "bg-neutral-700 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}
              >
                {wallet}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr className="border-b border-neutral-800 text-left">
                <th className="p-3">Coin</th>
                <th className="p-3">Ví/Sàn</th>
                <th className="p-3 text-right">SL</th>
                <th className="p-3 text-right">Giá vốn</th>
                <th className="p-3 text-right">Giá hiện tại</th>
                <th className="p-3 text-right">Giá trị</th>
                <th className="p-3 text-right">24h</th>
                <th className="p-3 text-right">P&L</th>
                <th className="p-3 text-right">%P&L</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {holdings.map((holding) => (
                <tr
                  key={`${holding.coinSymbol}-${holding.wallet}`}
                  className="border-b border-neutral-800/50"
                >
                  <td className="p-3 font-sans font-semibold">
                    {holding.coinSymbol}
                  </td>
                  <td className="p-3">
                    <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                      {holding.wallet}
                    </span>
                  </td>
                  <td className="p-3 text-right">{holding.qty}</td>
                  <td className="p-3 text-right">
                    {fmt(holding.avgCostVnd)}
                  </td>
                  <td className="p-3 text-right">
                    {fmt(holding.currentPriceVnd)}
                  </td>
                  <td className="p-3 text-right">
                    {fmt(holding.valueVnd)}
                  </td>
                  <td
                    className={`p-3 text-right ${Number(holding.change24hPct ?? 0) >= 0 ? "text-profit" : "text-loss"}`}
                  >
                    {holding.change24hPct ?? "-"}%
                  </td>
                  <td
                    className={`p-3 text-right ${Number(holding.pnlVnd ?? 0) >= 0 ? "text-profit" : "text-loss"}`}
                  >
                    {fmt(holding.pnlVnd)}
                  </td>
                  <td
                    className={`p-3 text-right ${Number(holding.pnlPct ?? 0) >= 0 ? "text-profit" : "text-loss"}`}
                  >
                    {holding.pnlPct ?? "-"}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss";
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-sm text-neutral-400">{label}</div>
      <div
        className={`mt-1 font-mono text-lg font-bold ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
