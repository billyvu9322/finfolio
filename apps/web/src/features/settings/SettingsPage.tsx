import { useState, type FormEvent } from 'react';

import { updateProfile } from '@/features/auth/auth.api';
import { useAuthStore } from '@/stores/auth';

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [currency, setCurrency] = useState<'VND' | 'USD'>(user?.currency ?? 'VND');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'Asia/Ho_Chi_Minh');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);
    try {
      const updated = await updateProfile({ displayName: displayName || null, currency, timezone });
      setUser(updated);
      setMessage('Đã lưu hồ sơ.');
    } catch {
      setError('Không thể lưu hồ sơ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl font-semibold text-white">Cài đặt</h1>
      <p className="mt-2 text-sm text-neutral-400">Hồ sơ, đơn vị tiền tệ mặc định và múi giờ.</p>
      <form onSubmit={onSubmit} className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        {message && <div className="mb-4 rounded-md bg-profit/10 px-3 py-2 text-sm text-profit">{message}</div>}
        {error && <div className="mb-4 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}
        <label className="mb-1 block text-sm text-neutral-400">Tên hiển thị</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand" />
        <label className="mb-1 block text-sm text-neutral-400">Tiền tệ mặc định</label>
        <select value={currency} onChange={(e) => setCurrency(e.target.value as 'VND' | 'USD')} className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand">
          <option value="VND">VND</option>
          <option value="USD">USD</option>
        </select>
        <label className="mb-1 block text-sm text-neutral-400">Múi giờ</label>
        <input required value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mb-6 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="submit" disabled={loading} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50">
          {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </form>
    </section>
  );
}
