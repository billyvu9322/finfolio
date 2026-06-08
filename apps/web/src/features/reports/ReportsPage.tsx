import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { exportCsv, getPnlReport, getSnapshot, type SnapshotView } from './reports.api';

const formatVnd = (value: string) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value)))} d`;

export function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [module, setModule] = useState<'gold' | 'stock'>('gold');
  const [snapDate, setSnapDate] = useState('');
  const [snap, setSnap] = useState<SnapshotView | null>(null);
  const [snapErr, setSnapErr] = useState<string | null>(null);
  const report = useQuery({ queryKey: ['reports', 'pnl', from, to], queryFn: () => getPnlReport(from || undefined, to || undefined) });
  const input = 'rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand';

  const loadSnapshot = async () => {
    setSnapErr(null);
    try {
      setSnap(await getSnapshot(snapDate));
    } catch {
      setSnap(null);
      setSnapErr('Không có snapshot vào/trước ngày này.');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Báo cáo P&L</h1>
      <p className="mt-1 text-sm text-neutral-400">P&L theo loại tài sản, AUM theo tháng, export CSV và xem snapshot lịch sử.</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-neutral-400">Từ<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`mt-1 block ${input}`} /></label>
        <label className="text-sm text-neutral-400">Đến<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`mt-1 block ${input}`} /></label>
        <select value={module} onChange={(event) => setModule(event.target.value as 'gold' | 'stock')} className={input}><option value="gold">Vàng</option><option value="stock">Cổ phiếu</option></select>
        <button onClick={() => exportCsv(module, from || undefined, to || undefined)} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800">Export CSV</button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-base font-semibold">P&L theo loại tài sản</h2>
          <table className="w-full text-sm"><thead className="text-neutral-400"><tr className="text-left"><th className="py-2">Loại</th><th className="py-2 text-right">Giá trị</th><th className="py-2 text-right">Vốn</th><th className="py-2 text-right">P&L</th><th className="py-2 text-right">%ROI</th></tr></thead><tbody className="font-mono">{report.data?.byAsset.map((asset) => <tr key={asset.assetClass} className="border-t border-neutral-800/50"><td className="py-2 font-sans">{asset.assetClass}</td><td className="py-2 text-right">{formatVnd(asset.value)}</td><td className="py-2 text-right">{formatVnd(asset.invested)}</td><td className={`py-2 text-right ${Number(asset.pnl) >= 0 ? 'text-profit' : 'text-loss'}`}>{formatVnd(asset.pnl)}</td><td className={`py-2 text-right ${Number(asset.pnlPct) >= 0 ? 'text-profit' : 'text-loss'}`}>{asset.pnlPct}%</td></tr>)}</tbody></table>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-3 text-base font-semibold">AUM theo tháng</h2>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={(report.data?.byMonth ?? []).map((item) => ({ month: item.month, aum: Number(item.aum) }))}><XAxis dataKey="month" stroke="#71717A" fontSize={11} /><YAxis stroke="#71717A" fontSize={11} width={80} /><Tooltip formatter={(value) => formatVnd(String(value))} contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} /><Bar dataKey="aum" fill="#10B981" /></BarChart></ResponsiveContainer></div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-3 text-base font-semibold">Xem danh mục theo ngày (Snapshot)</h2>
        <div className="flex items-end gap-3"><input type="date" value={snapDate} onChange={(event) => setSnapDate(event.target.value)} className={input} /><button onClick={loadSnapshot} disabled={!snapDate} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">Xem</button></div>
        {snapErr ? <p className="mt-3 text-sm text-loss">{snapErr}</p> : null}
        {snap ? <div className="mt-3 grid grid-cols-1 gap-4 font-mono text-sm sm:grid-cols-3"><div><div className="text-neutral-400">Ngày</div>{snap.snapshotDate}</div><div><div className="text-neutral-400">Giá trị</div>{formatVnd(snap.totalValue)}</div><div><div className="text-neutral-400">Vốn</div>{formatVnd(snap.totalInvested)}</div></div> : null}
      </div>
    </div>
  );
}
