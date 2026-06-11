import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import {
  getStockPortfolio,
  getStockPrices,
  refreshStockPrices,
} from "@/apis/stock.api";

const vnd = (value: string | null | undefined) =>
  value == null
    ? "-"
    : new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(Number(value));

// Up/down trend arrow for a signed metric. Green up / red down; hidden for null.
function TrendIcon({ value }: { value: string | null | undefined }) {
  if (value == null || value === "") return null;
  const up = Number(value) >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Icon className={`h-3.5 w-3.5 shrink-0 ${up ? "text-profit" : "text-loss"}`} />
  );
}

export function StockPortfolioPage() {
  const queryClient = useQueryClient();
  const portfolio = useQuery({
    queryKey: ["stock", "portfolio"],
    queryFn: getStockPortfolio,
  });
  const prices = useQuery({
    queryKey: ["stock", "prices"],
    queryFn: getStockPrices,
  });
  const refreshMutation = useMutation({
    mutationFn: refreshStockPrices,
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      toast.success(`Đã cập nhật ${r.refreshed} giá cổ phiếu.`);
    },
    onError: () => toast.error("Không thể cập nhật giá cổ phiếu."),
  });
  const totals = portfolio.data?.totals;

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-semibold text-white">
            Quản lý Chứng khoán
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            WAVG, cổ tức và P&L theo mã.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            {refreshMutation.isPending ? "Đang cập nhật..." : "Cập nhật giá"}
          </button>
          <Link
            to="/stocks/add"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Thêm giao dịch
          </Link>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Giá trị" value={vnd(totals?.value)} />
        <Kpi label="Tổng vốn" value={vnd(totals?.invested)} />
        <Kpi
          label="P&L"
          value={`${vnd(totals?.pnl)} (${totals?.pnlPct ?? "0"}%)`}
          tone={Number(totals?.pnl ?? 0) >= 0 ? "profit" : "loss"}
        />
        <Kpi label="Cổ tức" value={vnd(totals?.dividendIncome)} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="text-neutral-400">
            <tr className="border-b border-neutral-800 text-left">
              <th className="p-3">Mã</th>
              <th className="p-3 text-right">SL</th>
              <th className="p-3 text-right">WAVG</th>
              <th className="p-3 text-right">Giá</th>
              <th className="p-3 text-right">Giá trị</th>
              <th className="p-3 text-right">P&L</th>
              <th className="p-3 text-right">%P&L</th>
              <th className="p-3 text-right">Cổ tức</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(portfolio.data?.holdings.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-neutral-500">
                  Không có dữ liệu
                </td>
              </tr>
            ) : null}
            {portfolio.data?.holdings.map((holding) => (
              <tr
                key={holding.symbol}
                className="border-b border-neutral-800/50"
              >
                <td className="p-3 font-sans">
                  <Link
                    to="/stocks/$symbol"
                    params={{ symbol: holding.symbol }}
                    className="text-brand hover:underline"
                  >
                    {holding.symbol}
                  </Link>
                  <span className="ml-2 text-xs text-neutral-500">
                    {holding.exchange}
                  </span>
                </td>
                <td className="p-3 text-right">{holding.qty}</td>
                <td className="p-3 text-right">{vnd(holding.avgCost)}</td>
                <td className="p-3 text-right">{vnd(holding.currentPrice)}</td>
                <td className="p-3 text-right">{vnd(holding.value)}</td>
                <td
                  className={`p-3 text-right ${Number(holding.pnl ?? 0) >= 0 ? "text-profit" : "text-loss"}`}
                >
                  {vnd(holding.pnl)}
                </td>
                <td
                  className={`p-3 text-right ${Number(holding.pnlPct ?? 0) >= 0 ? "text-profit" : "text-loss"}`}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    <TrendIcon value={holding.pnlPct} />
                    {holding.pnlPct ?? "-"}%
                  </span>
                </td>
                <td className="p-3 text-right">
                  {vnd(holding.dividendIncome)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Giá thị trường (VCI) */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium text-white">Giá thị trường</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Giá thật từ VCI/Vietcap (VND) cho mã đang giữ — định giá danh mục.
              {prices.data?.stale ? (
                <span className="ml-2 text-amber-400">giá có thể cũ</span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {prices.isLoading ? (
            <p className="text-sm text-neutral-500">Đang tải...</p>
          ) : (prices.data?.prices.length ?? 0) === 0 ? (
            <p className="text-sm text-neutral-500">
              Chưa có giá. Bấm &quot;Cập nhật giá&quot; để lấy giá VCI.
            </p>
          ) : (
            prices.data!.prices.map((p) => (
              <div
                key={p.symbol}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-3"
              >
                <span className="text-sm font-semibold text-white">
                  {p.symbol}
                </span>
                <span className="font-mono text-sm text-neutral-200">
                  {vnd(p.price)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
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
      <div className="text-sm text-neutral-500">{label}</div>
      <div
        className={`mt-2 font-mono text-xl font-semibold ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}
