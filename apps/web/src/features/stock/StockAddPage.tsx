import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { computeStockFees, type StockAction } from './fees';
import { createStockTx, searchSymbols, type Exchange } from './stock.api';

export function StockAddPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<Exchange | ''>('');
  const [action, setAction] = useState<StockAction>('buy');
  const [quantity, setQuantity] = useState('100');
  const [price, setPrice] = useState('');
  const [broker, setBroker] = useState('');
  const [error, setError] = useState<string | null>(null);
  const symbols = useQuery({ queryKey: ['stock', 'symbols', symbol], queryFn: () => searchSymbols(symbol), enabled: symbol.length > 0 });
  const fees = useMemo(() => computeStockFees(action, Number(quantity) || 0, Number(price) || 0), [action, quantity, price]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createStockTx({ symbol, exchange: exchange || undefined, action, quantity: Number(quantity), price: Number(price), broker: broker || undefined });
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
      void navigate({ to: '/stocks' });
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Lưu giao dịch thất bại.');
    }
  };

  return <section className="max-w-2xl"><h1 className="text-3xl font-semibold text-white">Nhập GD Cổ phiếu</h1><form onSubmit={submit} className="mt-8 grid gap-5 rounded-xl border border-neutral-800 bg-neutral-900 p-6 md:grid-cols-2">{error && <div className="rounded-md bg-loss/10 px-3 py-2 text-sm text-loss md:col-span-2">{error}</div>}<Field label="Mã"><input required value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="input font-mono" />{symbols.data && <div className="mt-2 space-y-1">{symbols.data.slice(0, 4).map((item) => <button type="button" key={item.symbol} onClick={() => { setSymbol(item.symbol); setExchange(item.exchange); }} className="block w-full rounded bg-neutral-950 px-2 py-1 text-left text-xs text-neutral-300">{item.symbol} · {item.name} · {item.exchange}</button>)}</div>}</Field><Field label="Sàn"><select value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)} className="input"><option value="">Auto</option><option>HOSE</option><option>HNX</option><option>UPCOM</option></select></Field><Field label="Hành động"><select value={action} onChange={(e) => setAction(e.target.value as StockAction)} className="input"><option value="buy">Mua</option><option value="sell">Bán</option><option value="cash_dividend">Cổ tức tiền</option><option value="stock_dividend">Cổ tức CP</option></select></Field><Field label="Số lượng"><input required value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input font-mono" /><p className="mt-1 text-xs text-neutral-500">HOSE mua/bán: bội số 100.</p></Field><Field label="Giá"><input required value={price} onChange={(e) => setPrice(e.target.value)} className="input font-mono" /></Field><Field label="Broker"><input value={broker} onChange={(e) => setBroker(e.target.value)} className="input" /></Field><div className="rounded-lg bg-neutral-950 p-3 text-sm text-neutral-400 md:col-span-2">Phí dự kiến: {fees.brokerageFee.toLocaleString('vi-VN')} đ · Thuế: {fees.tax.toLocaleString('vi-VN')} đ</div><button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Lưu giao dịch</button></form></section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label><span className="mb-1 block text-sm text-neutral-400">{label}</span>{children}</label>;
}
