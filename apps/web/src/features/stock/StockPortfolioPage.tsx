import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { getStockPortfolio, listStockTx } from './stock.api';

const vnd = (value: string | null | undefined) => value == null ? '-' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value));

export function StockPortfolioPage() {
  const portfolio = useQuery({ queryKey: ['stock', 'portfolio'], queryFn: getStockPortfolio });
  const txs = useQuery({ queryKey: ['stock', 'txs'], queryFn: () => listStockTx({ limit: 20 }) });
  const totals = portfolio.data?.totals;
  const empty = txs.data && txs.data.data.length === 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div><h1 className="text-3xl font-semibold text-white">Quản lý Chứng khoán</h1><p className="mt-2 text-sm text-neutral-400">WAVG, cổ tức và P&L theo mã.</p></div>
        <Link to="/stocks/add" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">+ Thêm giao dịch</Link>
      </div>
      {empty ? <div className="rounded-lg border border-dashed border-neutral-700 p-10 text-center text-neutral-500">Chưa có giao dịch cổ phiếu. Nhập giao dịch đầu tiên.</div> : null}
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Giá trị" value={vnd(totals?.value)} />
        <Kpi label="Tổng vốn" value={vnd(totals?.invested)} />
        <Kpi label="P&L" value={`${vnd(totals?.pnl)} (${totals?.pnlPct ?? '0'}%)`} tone={Number(totals?.pnl ?? 0) >= 0 ? 'profit' : 'loss'} />
        <Kpi label="Cổ tức" value={vnd(totals?.dividendIncome)} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900">
        <table className="w-full text-sm"><thead className="text-neutral-400"><tr className="border-b border-neutral-800 text-left"><th className="p-3">Mã</th><th className="p-3 text-right">SL</th><th className="p-3 text-right">WAVG</th><th className="p-3 text-right">Giá</th><th className="p-3 text-right">Giá trị</th><th className="p-3 text-right">P&L</th><th className="p-3 text-right">Cổ tức</th></tr></thead>
          <tbody className="font-mono">{portfolio.data?.holdings.map((holding) => <tr key={holding.symbol} className="border-b border-neutral-800/50"><td className="p-3 font-sans"><Link to="/stocks/$symbol" params={{ symbol: holding.symbol }} className="text-brand hover:underline">{holding.symbol}</Link><span className="ml-2 text-xs text-neutral-500">{holding.exchange}</span></td><td className="p-3 text-right">{holding.qty}</td><td className="p-3 text-right">{vnd(holding.avgCost)}</td><td className="p-3 text-right">{vnd(holding.currentPrice)}</td><td className="p-3 text-right">{vnd(holding.value)}</td><td className={`p-3 text-right ${Number(holding.pnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'}`}>{vnd(holding.pnl)}</td><td className="p-3 text-right">{vnd(holding.dividendIncome)}</td></tr>)}</tbody></table>
      </div>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'profit' | 'loss' }) {
  return <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"><div className="text-sm text-neutral-500">{label}</div><div className={`mt-2 font-mono text-xl font-semibold ${tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-white'}`}>{value}</div></div>;
}
