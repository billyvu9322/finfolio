import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import { resetPassword } from '@/apis/auth.api';

export function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch {
      setError('Token không hợp lệ hoặc mật khẩu chưa đủ mạnh.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-8">
        <div className="mb-6 text-center text-2xl font-bold text-brand">FinFolio</div>
        <h1 className="mb-6 text-center text-lg font-medium">Đặt lại mật khẩu</h1>
        {done && <div className="mb-4 rounded-md bg-profit/10 px-3 py-2 text-sm text-profit">Mật khẩu đã được cập nhật.</div>}
        {error && <div className="mb-4 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}
        <label className="mb-1 block text-sm text-neutral-400">Reset token</label>
        <input required value={token} onChange={(e) => setToken(e.target.value)} className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand" />
        <label className="mb-1 block text-sm text-neutral-400">Mật khẩu mới</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mb-6 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="submit" disabled={loading} className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50">
          {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
        </button>
        <Link to="/login" className="mt-4 block text-center text-sm text-brand">Đăng nhập</Link>
      </form>
    </div>
  );
}
