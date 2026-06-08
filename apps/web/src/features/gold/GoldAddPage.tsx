import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent, type ReactNode } from 'react';

import { createGoldTransaction, getGoldPrices, type GoldTransactionInput } from './gold.api';

export function GoldAddPage() {
  const navigate = useNavigate();
  const prices = useQuery({ queryKey: ['gold', 'prices'], queryFn: getGoldPrices });
  const [form, setForm] = useState<GoldTransactionInput>({
    goldType: 'SJC 9999',
    action: 'buy',
    quantity: '1',
    unit: 'chi',
    pricePerUnit: '',
    fee: '0',
    storage: 'Nhà',
    note: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setField = <K extends keyof GoldTransactionInput>(key: K, value: GoldTransactionInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const fillMarketPrice = () => {
    const price = prices.data?.prices.find((item) => item.symbol === form.goldType);
    if (price?.priceBuy || price?.priceSell) setField('pricePerUnit', price.priceBuy ?? price.priceSell ?? '');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createGoldTransaction({ ...form, note: form.note || null });
      void navigate({ to: '/gold' });
    } catch {
      setError('Không thể lưu giao dịch. Kiểm tra số lượng bán hoặc dữ liệu nhập.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="max-w-3xl">
      <p className="text-sm uppercase tracking-[0.3em] text-brand">Gold Transaction</p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Nhập GD Vàng</h1>
      <form onSubmit={onSubmit} className="mt-8 grid gap-5 rounded-xl border border-neutral-800 bg-neutral-900 p-6 md:grid-cols-2">
        {error && <div className="rounded-md bg-loss/10 px-3 py-2 text-sm text-loss md:col-span-2">{error}</div>}
        <Field label="Loại vàng"><input required value={form.goldType} onChange={(e) => setField('goldType', e.target.value)} className="input" /></Field>
        <Field label="Hành động"><select value={form.action} onChange={(e) => setField('action', e.target.value as 'buy' | 'sell')} className="input"><option value="buy">Mua</option><option value="sell">Bán</option></select></Field>
        <Field label="Số lượng"><input required value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} className="input" /></Field>
        <Field label="Đơn vị"><select value={form.unit} onChange={(e) => setField('unit', e.target.value as 'chi' | 'luong' | 'cay')} className="input"><option value="chi">Chỉ</option><option value="luong">Lượng</option><option value="cay">Cây</option></select></Field>
        <Field label="Giá / chỉ"><div className="flex gap-2"><input required value={form.pricePerUnit} onChange={(e) => setField('pricePerUnit', e.target.value)} className="input" /><button type="button" onClick={fillMarketPrice} className="rounded-md border border-neutral-700 px-3 text-sm text-neutral-300">Giá</button></div></Field>
        <Field label="Phí"><input required value={form.fee} onChange={(e) => setField('fee', e.target.value)} className="input" /></Field>
        <Field label="Lưu trữ"><input required value={form.storage} onChange={(e) => setField('storage', e.target.value)} className="input" /></Field>
        <Field label="Ngày giao dịch"><input type="datetime-local" onChange={(e) => setField('transactionAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)} className="input" /></Field>
        <Field label="Ghi chú" wide><textarea value={form.note ?? ''} onChange={(e) => setField('note', e.target.value)} className="input min-h-24" /></Field>
        <div className="md:col-span-2"><button type="submit" disabled={loading} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">{loading ? 'Đang lưu...' : 'Lưu giao dịch'}</button></div>
      </form>
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? 'md:col-span-2' : ''}><span className="mb-1 block text-sm text-neutral-400">{label}</span>{children}</label>;
}
