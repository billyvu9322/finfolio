import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import { getGoldPortfolio, getGoldPrices, listGoldTransactions } from '@/apis/gold.api';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

function formatMoney(value: string) {
  return money.format(Number(value));
}

export function GoldPage() {
  const portfolio = useQuery({ queryKey: ['gold', 'portfolio'], queryFn: getGoldPortfolio });
  const transactions = useQuery({ queryKey: ['gold', 'transactions'], queryFn: listGoldTransactions });
  const prices = useQuery({ queryKey: ['gold', 'prices'], queryFn: getGoldPrices });

  const holdings = portfolio.data?.holdings ?? [];
  const history = transactions.data?.data ?? [];

  return (
    <section className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand">Gold Module</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Quản lý Vàng</h1>
          <p className="mt-2 text-sm text-neutral-400">DCA, giá mua lại và P&L theo từng loại vàng.</p>
        </div>
        <Link to="/gold/add" className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          <Plus className="h-4 w-4" /> Nhập giao dịch
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi label="Tổng giá trị" value={formatMoney(portfolio.data?.totalValue ?? '0')} />
        <Kpi label="P&L chưa thực hiện" value={formatMoney(portfolio.data?.totalUnrealizedPnl ?? '0')} tone={Number(portfolio.data?.totalUnrealizedPnl ?? 0) >= 0 ? 'profit' : 'loss'} />
        <Kpi label="Số loại đang giữ" value={`${holdings.length}`} />
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
                  <tr><th>Loại</th><th>SL (chỉ)</th><th>DCA</th><th>Giá hiện tại</th><th>P&L</th><th>ROI</th></tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {holdings.map((item) => (
                    <tr key={item.goldType} className="border-t border-neutral-800">
                      <td className="py-3 font-sans text-white">{item.goldType}</td>
                      <td>{item.quantityChi}</td>
                      <td>{formatMoney(item.dca)}</td>
                      <td>{formatMoney(item.currentPrice)}</td>
                      <td className={Number(item.unrealizedPnl) >= 0 ? 'text-profit' : 'text-loss'}>{formatMoney(item.unrealizedPnl)}</td>
                      <td>{item.roiPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-lg font-medium text-white">Giá mua lại</h2>
          <div className="mt-4 space-y-3">
            {(prices.data?.prices ?? []).map((price) => (
              <div key={price.symbol} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{price.symbol}</span>
                  <span className={price.stale ? 'text-amber-400' : 'text-profit'}>{price.stale ? 'stale' : 'live'}</span>
                </div>
                <div className="mt-2 font-mono text-sm text-neutral-300">{formatMoney(price.priceBuy ?? price.priceSell ?? '0')}</div>
                <div className="mt-1 text-xs text-neutral-500">{price.source}</div>
              </div>
            ))}
            {(prices.data?.prices ?? []).length === 0 && <div className="text-sm text-neutral-500">Chưa có giá cache.</div>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-lg font-medium text-white">Lịch sử giao dịch</h2>
        {history.length === 0 ? <Empty /> : <div className="mt-4 space-y-2">{history.map((tx) => <div key={tx.id} className="flex justify-between rounded-lg bg-neutral-950 px-4 py-3 text-sm"><span>{tx.goldType} · {tx.action}</span><span className="font-mono">{tx.quantity} {tx.unit} · {formatMoney(tx.pricePerUnit)}</span></div>)}</div>}
      </div>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'profit' | 'loss' }) {
  return <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"><div className="text-sm text-neutral-500">{label}</div><div className={`mt-2 font-mono text-2xl tabular-nums ${tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white'}`}>{value}</div></div>;
}

function Empty() {
  return <div className="mt-4 rounded-lg border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">Chưa có giao dịch vàng. Nhập giao dịch đầu tiên để xem DCA và P&L.</div>;
}
