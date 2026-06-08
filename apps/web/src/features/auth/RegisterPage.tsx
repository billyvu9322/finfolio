import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import { register } from './auth.api';
import { useAuthStore } from '@/stores/auth';

function passwordIssues(password: string): string[] {
  return [
    password.length >= 8 ? null : 'Ít nhất 8 ký tự',
    /[A-Z]/.test(password) ? null : 'Có chữ hoa',
    /[0-9]/.test(password) ? null : 'Có số',
  ].filter(Boolean) as string[];
}

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const issues = passwordIssues(password);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (issues.length > 0) return;
    setError(null);
    setLoading(true);
    try {
      const res = await register(email, password, displayName || undefined);
      setAuth(res.accessToken, res.user);
      void navigate({ to: '/dashboard' });
    } catch {
      setError('Không thể tạo tài khoản. Kiểm tra email hoặc thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-8">
        <div className="mb-6 text-center text-2xl font-bold text-brand">FinFolio</div>
        <h1 className="mb-6 text-center text-lg font-medium">Tạo tài khoản</h1>
        {error && <div className="mb-4 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}
        <label className="mb-1 block text-sm text-neutral-400">Tên hiển thị</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand" />
        <label className="mb-1 block text-sm text-neutral-400">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand" />
        <label className="mb-1 block text-sm text-neutral-400">Mật khẩu</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mb-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand" />
        <div className="mb-6 text-xs text-neutral-500">{issues.length ? issues.join(' · ') : 'Mật khẩu đủ mạnh'}</div>
        <button type="submit" disabled={loading || issues.length > 0} className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50">
          {loading ? 'Đang tạo...' : 'Đăng ký'}
        </button>
        <Link to="/login" className="mt-4 block text-center text-sm text-brand">Đã có tài khoản?</Link>
      </form>
    </div>
  );
}
