import { useQuery } from '@tanstack/react-query';
import { createChart, type IChartApi } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

import { getStockOhlc, getStockPortfolio, listStockTx } from './stock.api';

const vnd = (value: string | null | undefined) => value == null ? '-' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value));

export function StockDetailPage({ symbol }: { symbol: string }) {
  const normalized = symbol.toUpperCase();
  const chartRef = useRef<HTMLDivElement>(null);
  const ohlc = useQuery({ queryKey: ['stock', 'ohlc', normalized], queryFn: () => getStockOhlc(normalized) });
  const portfolio = useQuery({ queryKey: ['stock', 'portfolio'], queryFn: getStockPortfolio });
  const txs = useQuery({ queryKey: ['stock', 'txs', normalized], queryFn: () => listStockTx({ symbol: normalized, limit: 20 }) });
  const holding = portfolio.data?.holdings.find((item) => item.symbol === normalized);

  useEffect(() => {
    if (!chartRef.current || !ohlc.data?.candles.length) return;
    let chart: IChartApi | null = createChart(chartRef.current, { height: 360, layout: { background: { color: '#0a0a0a' }, textColor: '#d4d4d4' }, grid: { vertLines: { color: '#262626' }, horzLines: { color: '#262626' } } });
    const series = chart.addCandlestickSeries();
    series.setData(ohlc.data.candles);
    chart.timeScale().fitContent();
    return () => { chart?.remove(); chart = null; };
  }, [ohlc.data]);

  return <section className="space-y-6"><div><h1 className="text-3xl font-semibold text-white">{normalized}</h1><p className="mt-2 text-sm text-neutral-400">Candlestick giả lập và vị thế hiện tại.</p></div><div ref={chartRef} className="rounded-xl border border-neutral-800 bg-neutral-950" /><div className="grid gap-4 md:grid-cols-4"><Kpi label="SL" value={holding?.qty ?? '0'} /><Kpi label="WAVG" value={vnd(holding?.avgCost)} /><Kpi label="Giá trị" value={vnd(holding?.value)} /><Kpi label="P&L" value={`${vnd(holding?.pnl)} (${holding?.pnlPct ?? '0'}%)`} /></div><div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"><h2 className="text-lg font-medium text-white">Giao dịch</h2><div className="mt-4 space-y-2">{txs.data?.data.map((tx) => <div key={tx.id} className="flex justify-between rounded bg-neutral-950 px-3 py-2 text-sm"><span>{tx.action}</span><span className="font-mono">{tx.quantity} · {vnd(tx.price)}</span></div>)}</div></div></section>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"><div className="text-sm text-neutral-500">{label}</div><div className="mt-2 font-mono text-xl text-white">{value}</div></div>;
}
