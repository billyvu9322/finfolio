import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { getCryptoPortfolio } from "@/apis/crypto.api";

const formatVnd = (value: string | null | undefined) =>
  value == null
    ? "-"
    : `${new Intl.NumberFormat("vi-VN").format(Math.round(Number(value)))} d`;
const formatUsd = (value: string | null | undefined) =>
  value == null
    ? "-"
    : `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value))}`;

export function CryptoPortfolioPage() {
  const [fx, setFx] = useState("");
  const [walletFilter, setWalletFilter] = useState("");
  const portfolio = useQuery({
    queryKey: ["crypto", "portfolio", fx],
    queryFn: () => getCryptoPortfolio(fx ? Number(fx) : undefined),
  });

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
            Theo dõi coin theo từng ví/sàn, giá trị USD + VND và P&L chưa thực
            hiện.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-neutral-400">
            USD/VND
            <input
              value={fx}
              onChange={(event) => setFx(event.target.value)}
              placeholder={String(portfolio.data?.fxRate ?? 25000)}
              className="ml-2 w-28 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-neutral-200"
            />
          </label>
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
          <Kpi
            label="Tổng giá trị"
            value={`${formatVnd(totals?.valueVnd)} · ${formatUsd(totals?.valueUsd)}`}
          />
          <Kpi label="Tổng vốn" value={formatVnd(totals?.invested)} />
          <Kpi label="SL coin đang giữ" value={`${coinCount}`} />
          <Kpi
            label="P&L (%ROI)"
            value={`${formatVnd(totals?.pnl)} (${totals?.pnlPct ?? "0"}%)`}
            tone={Number(totals?.pnl ?? 0) >= 0 ? "profit" : "loss"}
          />
        </div>
      ) : null}

      {isEmpty ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-700 p-10 text-center text-neutral-500">
          Chưa có giao dịch crypto. Nhập giao dịch đầu tiên.
        </div>
      ) : null}

      {!isEmpty && portfolio.data ? (
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
                      {formatVnd(holding.avgCostVnd)}
                    </td>
                    <td className="p-3 text-right">
                      {formatVnd(holding.currentPriceVnd)}
                    </td>
                    <td className="p-3 text-right">
                      {formatVnd(holding.valueVnd)}
                      <div className="text-xs text-neutral-500">
                        {formatUsd(holding.valueUsd)}
                      </div>
                    </td>
                    <td
                      className={`p-3 text-right ${Number(holding.change24hPct ?? 0) >= 0 ? "text-profit" : "text-loss"}`}
                    >
                      {holding.change24hPct ?? "-"}%
                    </td>
                    <td
                      className={`p-3 text-right ${Number(holding.pnlVnd ?? 0) >= 0 ? "text-profit" : "text-loss"}`}
                    >
                      {formatVnd(holding.pnlVnd)}
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
      ) : null}
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
