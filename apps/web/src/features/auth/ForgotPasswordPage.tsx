import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import { forgotPassword } from './auth.api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      setMessage(res.message);
      setPreviewToken(res.previewToken ?? null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-8">
        <div className="mb-6 text-center text-2xl font-bold text-brand">FinFolio</div>
        <h1 className="mb-6 text-center text-lg font-medium">Quên mật khẩu</h1>
        {message && <div className="mb-4 rounded-md bg-profit/10 px-3 py-2 text-sm text-profit">{message}</div>}
        {previewToken && <div className="mb-4 break-all rounded-md bg-neutral-950 px-3 py-2 text-xs text-neutral-300">Dev token: {previewToken}</div>}
        <label className="mb-1 block text-sm text-neutral-400">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mb-6 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand" />
        <button type="submit" disabled={loading} className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50">
          {loading ? 'Đang gửi...' : 'Gửi link đặt lại'}
        </button>
        <Link to="/login" className="mt-4 block text-center text-sm text-brand">Quay lại đăng nhập</Link>
      </form>
    </div>
  );
}
