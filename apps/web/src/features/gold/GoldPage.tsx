import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteGoldTransaction,
  getGoldPortfolio,
  getGoldPrices,
  listGoldTransactions,
  refreshGoldPrices,
  type GoldPrice,
} from "@/apis/gold.api";
import { confirmToast } from "@/lib/confirm";

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

function formatMoney(value: string) {
  return money.format(Number(value));
}

const usdMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatPrice(value: string, currency: string, unit: string) {
  if (currency === "USD") return `${usdMoney.format(Number(value))} / ${unit}`;
  return formatMoney(value);
}

const CHI_SCALE = 10_000n;

function toScaledChi(value: string) {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * CHI_SCALE + BigInt((fraction + "0000").slice(0, 4));
}

function formatChi(value: bigint) {
  const roundedTenths = (value + 500n) / 1_000n;
  const whole = roundedTenths / 10n;
  const fraction = roundedTenths % 10n;
  return `${whole}.${fraction}`;
}

function groupBySource(prices: GoldPrice[]): [string, GoldPrice[]][] {
  const map = new Map<string, GoldPrice[]>();
  for (const price of prices) {
    const rows = map.get(price.source) ?? [];
    rows.push(price);
    map.set(price.source, rows);
  }
  return [...map.entries()];
}

export function GoldPage() {
  const queryClient = useQueryClient();
  const portfolio = useQuery({
    queryKey: ["gold", "portfolio"],
    queryFn: getGoldPortfolio,
  });
  const transactions = useQuery({
    queryKey: ["gold", "transactions"],
    queryFn: listGoldTransactions,
  });
  const prices = useQuery({
    queryKey: ["gold", "prices"],
    queryFn: getGoldPrices,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteGoldTransaction,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gold", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["gold", "portfolio"] }),
      ]);
      toast.success("Đã xóa giao dịch vàng.");
    },
    onError: () => toast.error("Không thể xóa giao dịch."),
  });
  const refreshMutation = useMutation({
    mutationFn: refreshGoldPrices,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["gold"] });
      const failed = result.sources.filter((s) => s.error);
      if (failed.length) {
        toast.warning(
          `Cập nhật xong (${result.total} giá). Lỗi: ${failed.map((s) => s.label).join(", ")}`,
        );
      } else {
        toast.success(`Đã cập nhật ${result.total} giá vàng.`);
      }
    },
    onError: () => toast.error("Không thể cập nhật giá vàng."),
  });

  const holdings = portfolio.data?.holdings ?? [];
  const history = transactions.data?.data ?? [];
  const totalQuantityChi = formatChi(
    holdings.reduce((total, item) => total + toScaledChi(item.quantityChi), 0n),
  );

  return (
    <section className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand">
            Gold Module
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Quản lý Vàng
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            DCA, giá mua lại và P&L theo từng loại vàng.
          </p>
        </div>
        <Link
          to="/gold/add"
          className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          <Plus className="h-4 w-4" /> Nhập giao dịch
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi
          label="Tổng giá trị"
          value={formatMoney(portfolio.data?.totalValue ?? "0")}
        />
        <Kpi
          label="P&L chưa thực hiện"
          value={formatMoney(portfolio.data?.totalUnrealizedPnl ?? "0")}
          tone={
            Number(portfolio.data?.totalUnrealizedPnl ?? 0) >= 0
              ? "profit"
              : "loss"
          }
        />
        <Kpi label="Số loại đang giữ" value={`${holdings.length}`} />
        <Kpi label="Tổng SL (chỉ)" value={totalQuantityChi} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-lg font-medium text-white">Danh mục</h2>
          {holdings.length === 0 ? (
            <Empty />
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-neutral-500">
                  <tr>
                    <th>Loại</th>
                    <th>SL (chỉ)</th>
                    <th>DCA</th>
                    <th>Giá hiện tại</th>
                    <th>P&L</th>
                    <th>ROI</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {holdings.map((item) => (
                    <tr
                      key={item.goldType}
                      className="border-t border-neutral-800"
                    >
                      <td className="py-3 font-sans text-white">
                        {item.goldType}
                      </td>
                      <td>{formatChi(toScaledChi(item.quantityChi))}</td>
                      <td>{formatMoney(item.dca)}</td>
                      <td>{formatMoney(item.currentPrice)}</td>
                      <td
                        className={
                          Number(item.unrealizedPnl) >= 0
                            ? "text-profit"
                            : "text-loss"
                        }
                      >
                        {formatMoney(item.unrealizedPnl)}
                      </td>
                      <td>{item.roiPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-medium text-white">
                Giá thị trường mua lại
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                Giá crawl theo từng tiệm (VND/lượng) — định giá danh mục &amp;
                P&amp;L.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            >
              {refreshMutation.isPending ? "Đang cập nhật..." : "Cập nhật giá"}
            </button>
          </div>
          <div className="mt-4 max-h-[400px] space-y-4 overflow-y-auto pr-1">
            {groupBySource(prices.data?.prices ?? []).map(([source, rows]) => (
              <div key={source}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">
                    {source}
                  </span>
                  {rows[0]?.stale ? (
                    <span className="text-xs text-amber-400">cũ</span>
                  ) : (
                    <span className="text-xs text-profit">mới</span>
                  )}
                </div>
                <div className="space-y-2">
                  {rows.map((price) => (
                    <div
                      key={`${source}-${price.symbol}`}
                      className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                    >
                      <div className="text-sm text-neutral-200">
                        {price.symbol}
                      </div>
                      {price.currency === "USD" ? (
                        <div className="mt-1 font-mono text-sm text-brand">
                          Spot: {formatPrice(price.priceBuy ?? "0", price.currency, price.unit)}
                        </div>
                      ) : (
                        <div className="mt-1 flex justify-between font-mono text-sm">
                          <span className="text-profit">
                            Mua lại: {formatPrice(price.priceBuy ?? "0", price.currency, price.unit)}
                          </span>
                          <span className="text-neutral-400">
                            Bán: {formatPrice(price.priceSell ?? "0", price.currency, price.unit)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {(prices.data?.prices ?? []).length === 0 && (
              <div className="text-sm text-neutral-500">
                Chưa có giá. Bấm "Cập nhật giá"
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-lg font-medium text-white">Lịch sử giao dịch</h2>
        {history.length === 0 ? (
          <Empty />
        ) : (
          <div className="mt-4 space-y-2">
            {history.map((tx) => (
              <div
                key={tx.id}
                className="flex flex-col gap-3 rounded-lg bg-neutral-950 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between"
              >
                <span>
                  {tx.goldType} · {tx.action}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono">
                    {tx.quantity} {tx.unit} · {formatMoney(tx.pricePerUnit)}
                  </span>
                  <Link
                    title="Sửa"
                    to="/gold/$transactionId"
                    params={{ transactionId: tx.id }}
                    className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:text-white"
                  >
                    <Pencil className="h-3 w-3" />
                  </Link>
                  <button
                    title="Xóa"
                    type="button"
                    disabled={deleteMutation.isPending}
                    onClick={() =>
                      confirmToast("Xóa giao dịch vàng này?", () =>
                        deleteMutation.mutate(tx.id),
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-loss/50 px-2 py-1 text-xs text-loss hover:bg-loss/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
        className={`mt-2 font-mono text-2xl tabular-nums ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
      Chưa có giao dịch vàng. Nhập giao dịch đầu tiên để xem DCA và P&L.
    </div>
  );
}
