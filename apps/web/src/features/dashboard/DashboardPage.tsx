import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { createSnapshot, getGrowth, getRecentTransactions, getSummary, getTopHoldings, getTopMovers } from '@/apis/dashboard.api';

const formatVnd = (value: string) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value)))} d`;
const COLORS: Record<string, string> = { gold: '#F59E0B', stock: '#3B82F6', crypto: '#A855F7', cash: '#64748B' };
const PERIODS = ['7d', '1m', '3m', '1y', 'all'] as const;

export function DashboardPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('1m');
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ['dash', 'summary'], queryFn: getSummary });
  const growth = useQuery({ queryKey: ['dash', 'growth', period], queryFn: () => getGrowth(period) });
  const holdings = useQuery({ queryKey: ['dash', 'top'], queryFn: () => getTopHoldings(5) });
  const recent = useQuery({ queryKey: ['dash', 'recent'], queryFn: () => getRecentTransactions(8) });
  const movers = useQuery({ queryKey: ['dash', 'movers'], queryFn: getTopMovers });
  const data = summary.data;
  const isEmpty = data && Number(data.aum) === 0;

  const snapshot = async () => {
    await createSnapshot();
    await Promise.all([growth.refetch(), queryClient.invalidateQueries({ queryKey: ['dash'] })]);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tổng quan</h1>
          <p className="mt-1 text-sm text-neutral-400">Cockpit AUM, phân bổ, dòng tăng trưởng và biến động theo tài sản.</p>
        </div>
        <button onClick={snapshot} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Chụp snapshot</button>
      </div>

      {summary.isError ? <div className="mt-6 rounded border border-loss/30 bg-loss/10 p-3 text-sm text-loss">Không tải được dashboard.</div> : null}
      {isEmpty ? <div className="mt-6 rounded-xl border border-dashed border-neutral-700 p-8 text-center text-neutral-500">Chưa có dữ liệu tài sản. Thêm giao dịch vàng, cổ phiếu hoặc crypto để xem dashboard.</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Kpi label="Tổng tài sản (AUM)" value={data ? formatVnd(data.aum) : '-'} />
        <Kpi label="Tổng vốn" value={data ? formatVnd(data.invested) : '-'} />
        <Kpi label="P&L (%ROI)" value={data ? `${formatVnd(data.pnl)} (${data.pnlPct}%)` : '-'} tone={data && Number(data.pnl) >= 0 ? 'profit' : 'loss'} />
        <Kpi label="Cash" value="0 d" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Hiệu suất danh mục</h2>
            <div className="flex gap-1">
              {PERIODS.map((item) => <button key={item} onClick={() => setPeriod(item)} className={`rounded px-2 py-1 text-xs ${period === item ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:bg-neutral-800'}`}>{item}</button>)}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(growth.data ?? []).map((point) => ({ date: point.date, value: Number(point.value) }))}>
                <defs><linearGradient id="portfolioGrowth" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10B981" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" stroke="#71717A" fontSize={11} />
                <YAxis stroke="#71717A" fontSize={11} width={80} />
                <Tooltip formatter={(value) => formatVnd(String(value))} contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} />
                <Area type="monotone" dataKey="value" stroke="#10B981" fill="url(#portfolioGrowth)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-base font-semibold">Phân bổ tài sản</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={(data?.breakdown ?? []).filter((item) => Number(item.value) > 0).map((item) => ({ name: item.assetClass, value: Number(item.value) }))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                  {(data?.breakdown ?? []).map((item) => <Cell key={item.assetClass} fill={COLORS[item.assetClass] ?? '#64748B'} />)}
                </Pie>
                <Tooltip formatter={(value) => formatVnd(String(value))} contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {data?.breakdown.map((item) => <li key={item.assetClass} className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[item.assetClass] ?? '#64748B' }} />{item.assetClass}</span><span className="font-mono">{item.pct}%</span></li>)}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Top nắm giữ" className="lg:col-span-1">
          <ul className="space-y-3">{holdings.data?.map((holding) => <li key={`${holding.assetClass}-${holding.label}`}><div className="flex justify-between text-sm"><span>{holding.label} <span className="text-xs text-neutral-500">{holding.assetClass}</span></span><span className="font-mono">{formatVnd(holding.value)}</span></div><div className="mt-1 h-1.5 rounded-full bg-neutral-800"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min(100, Number(data?.aum ?? 0) ? (Number(holding.value) / Number(data?.aum)) * 100 : 0)}%` }} /></div></li>)}</ul>
        </Panel>
        <Panel title="Giao dịch gần đây" className="lg:col-span-1">
          <ul className="space-y-2 text-sm">{recent.data?.map((item) => <li key={`${item.assetClass}-${item.title}-${item.date}`} className="flex justify-between gap-3"><span><span className="font-medium">{item.title}</span><span className="block text-xs text-neutral-500">{item.assetClass} · {item.subtitle}</span></span><span className={`font-mono ${Number(item.amount) >= 0 ? 'text-profit' : 'text-loss'}`}>{formatVnd(item.amount)}</span></li>)}</ul>
        </Panel>
        <Panel title="Top movers" className="lg:col-span-1">
          <div className="grid grid-cols-2 gap-4 text-sm"><div><div className="mb-2 text-xs text-neutral-500">Gainers</div>{movers.data?.gainers.map((item) => <div key={`${item.assetClass}-${item.label}`} className="flex justify-between"><span>{item.label}</span><span className="font-mono text-profit">{item.pnlPct}%</span></div>)}</div><div><div className="mb-2 text-xs text-neutral-500">Losers</div>{movers.data?.losers.map((item) => <div key={`${item.assetClass}-${item.label}`} className="flex justify-between"><span>{item.label}</span><span className="font-mono text-loss">{item.pnlPct}%</span></div>)}</div></div>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'profit' | 'loss' }) {
  return <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"><div className="text-sm text-neutral-400">{label}</div><div className={`mt-1 font-mono text-xl font-bold ${tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : ''}`}>{value}</div></div>;
}

function Panel({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return <div className={`rounded-xl border border-neutral-800 bg-neutral-900 p-5 ${className}`}><h2 className="mb-3 text-base font-semibold">{title}</h2>{children}</div>;
}
