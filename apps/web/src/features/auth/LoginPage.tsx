import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import { login } from './auth.api';
import { useAuthStore } from '@/stores/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(email, password);
      setAuth(res.accessToken, res.user);
      void navigate({ to: '/dashboard' });
    } catch {
      setError('Email hoặc mật khẩu không đúng.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-8"
      >
        <div className="mb-6 text-center text-2xl font-bold text-brand">FinFolio</div>
        <h1 className="mb-6 text-center text-lg font-medium">Đăng nhập</h1>

        {error && (
          <div className="mb-4 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>
        )}

        <label className="mb-1 block text-sm text-neutral-400">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <label className="mb-1 block text-sm text-neutral-400">Mật khẩu</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
