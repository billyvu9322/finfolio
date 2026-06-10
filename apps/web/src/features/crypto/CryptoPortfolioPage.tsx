import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  deleteCryptoTx,
  getCoinPrices,
  getCryptoAlerts,
  getCryptoPortfolio,
  listCryptoTx,
  refreshCoinPrices,
} from "@/apis/crypto.api";
import { confirmToast } from "@/lib/confirm";

import { ConnectionsSection } from "./ConnectionsSection";

const usdt = (value: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} USDT`;

export function CryptoPortfolioPage() {
  const [walletFilter, setWalletFilter] = useState("");
  const queryClient = useQueryClient();
  const portfolio = useQuery({
    queryKey: ["crypto", "portfolio"],
    queryFn: () => getCryptoPortfolio(),
  });
  const alerts = useQuery({
    queryKey: ["crypto", "alerts"],
    queryFn: getCryptoAlerts,
  });
  const coinPrices = useQuery({
    queryKey: ["crypto", "coin-prices"],
    queryFn: getCoinPrices,
  });
  const refreshPricesMutation = useMutation({
    mutationFn: refreshCoinPrices,
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["crypto"] });
      toast.success(`Đã cập nhật ${r.updated} giá coin.`);
    },
    onError: () => toast.error("Không thể cập nhật giá coin."),
  });
  const transactions = useQuery({
    queryKey: ["crypto", "transactions"],
    queryFn: () => listCryptoTx(),
  });
  const deleteTxMutation = useMutation({
    mutationFn: deleteCryptoTx,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crypto"] });
      toast.success("Đã xóa giao dịch.");
    },
    onError: () => toast.error("Không thể xóa giao dịch."),
  });

  const fxRate = portfolio.data?.fxRate ?? 25000;
  // API returns VND; show everything in USDT (≈ USD) = VND / fxRate.
  const fmt = (value: string | null | undefined) => {
    if (value == null) return "-";
    return usdt(Number(value) / fxRate);
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
            Theo dõi coin theo từng ví/sàn, giá trị quy đổi theo USDT và P&L chưa
            thực hiện.
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
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
                    <p className="whitespace-pre-line text-sm text-neutral-400">
                      {a.message}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        {/* Danh mục */}
        <div className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-lg font-medium text-white">Danh mục</h2>
          {wallets.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
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
          <div className="mt-4 overflow-x-auto">
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
                {holdings.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-neutral-500">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : null}
                {holdings.map((holding) => (
                  <tr
                    key={`${holding.coinSymbol}-${holding.wallet}`}
                    className="border-b border-neutral-800/50"
                  >
                    <td className="p-3 font-sans font-semibold">{holding.coinSymbol}</td>
                    <td className="p-3">
                      <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                        {holding.wallet}
                      </span>
                    </td>
                    <td className="p-3 text-right">{holding.qty}</td>
                    <td className="p-3 text-right">{fmt(holding.avgCostVnd)}</td>
                    <td className="p-3 text-right">{fmt(holding.currentPriceVnd)}</td>
                    <td className="p-3 text-right">{fmt(holding.valueVnd)}</td>
                    <td className={`p-3 text-right ${Number(holding.change24hPct ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                      {holding.change24hPct ?? "-"}%
                    </td>
                    <td className={`p-3 text-right ${Number(holding.pnlVnd ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                      {fmt(holding.pnlVnd)}
                    </td>
                    <td className={`p-3 text-right ${Number(holding.pnlPct ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>
                      {holding.pnlPct ?? "-"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Giá Coin (Binance) */}
        <div className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-medium text-white">Giá Coin (Binance)</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Giá thật từ Binance (USDT) cho coin đang giữ — định giá danh mục.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshPricesMutation.mutate()}
              disabled={refreshPricesMutation.isPending}
              className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            >
              {refreshPricesMutation.isPending ? "Đang cập nhật..." : "Cập nhật giá"}
            </button>
          </div>
          <div className="mt-4 max-h-[400px] space-y-2 overflow-y-auto pr-1">
            {coinPrices.isLoading ? (
              <p className="text-sm text-neutral-500">Đang tải...</p>
            ) : (coinPrices.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-neutral-500">
                Chưa có giá. Thêm giao dịch rồi bấm &quot;Cập nhật giá&quot; để lấy giá Binance.
              </p>
            ) : (
              coinPrices.data!.map((p) => (
                <div
                  key={p.coinSymbol}
                  className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                >
                  <span className="text-sm font-semibold text-white">
                    {p.coinSymbol}
                    {p.stale ? <span className="ml-2 text-xs text-amber-400">cũ</span> : null}
                  </span>
                  <span className="flex items-center gap-3 font-mono text-sm">
                    <span className="text-neutral-200">
                      {new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(Number(p.priceUsdt))} USDT
                    </span>
                    {p.change24hPct != null ? (
                      <span className={Number(p.change24hPct) >= 0 ? "text-profit" : "text-loss"}>
                        {Number(p.change24hPct) >= 0 ? "+" : ""}
                        {p.change24hPct}%
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Lịch sử giao dịch */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
        <h2 className="p-5 pb-0 text-lg font-medium text-white">Lịch sử giao dịch</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-neutral-400">
            <tr className="border-b border-neutral-800 text-left">
              <th className="p-3">Coin</th>
              <th className="p-3">Ví/Sàn</th>
              <th className="p-3">Hành động</th>
              <th className="p-3 text-right">SL</th>
              <th className="p-3 text-right">Giá (USDT)</th>
              <th className="p-3">Thời gian</th>
              <th className="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(transactions.data?.data.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-neutral-500">
                  Không có dữ liệu
                </td>
              </tr>
            ) : null}
            {transactions.data?.data.map((tx) => (
              <tr key={tx.id} className="border-b border-neutral-800/50">
                <td className="p-3 font-sans font-semibold">{tx.coinSymbol}</td>
                <td className="p-3">
                  <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{tx.wallet}</span>
                </td>
                <td className={`p-3 font-sans ${tx.action === "sell" ? "text-loss" : "text-profit"}`}>
                  {tx.action === "sell" ? "Bán" : tx.action === "buy" ? "Mua" : tx.action}
                </td>
                <td className="p-3 text-right">{tx.quantity}</td>
                <td className="p-3 text-right">{tx.priceUsd ?? "-"}</td>
                <td className="p-3 font-sans text-neutral-400">
                  {new Date(tx.transactionAt).toLocaleString("vi-VN")}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      to="/crypto/$transactionId"
                      params={{ transactionId: tx.id }}
                      className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:text-white"
                    >
                      Sửa
                    </Link>
                    <button
                      type="button"
                      disabled={deleteTxMutation.isPending}
                      onClick={() => confirmToast("Xóa giao dịch này?", () => deleteTxMutation.mutate(tx.id))}
                      className="rounded-md border border-loss/50 px-2 py-1 text-xs text-loss hover:bg-loss/10 disabled:opacity-50"
                    >
                      Xóa
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConnectionsSection />
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
