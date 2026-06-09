import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import {
  createConnection,
  deleteConnection,
  listConnections,
  syncConnection,
  type Connection,
} from '@/apis/exchange.api';

function statusColor(status: string): string {
  if (status === 'error') return 'text-loss';
  if (status === 'disabled') return 'text-neutral-500';
  return 'text-profit';
}

function formatTime(iso: string | null): string {
  if (!iso) return 'Chưa đồng bộ';
  return new Date(iso).toLocaleString('vi-VN');
}

export function ConnectionsSection() {
  const queryClient = useQueryClient();
  const connections = useQuery({ queryKey: ['connections'], queryFn: listConnections });

  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const invalidateConnections = () => queryClient.invalidateQueries({ queryKey: ['connections'] });

  const createMutation = useMutation({
    mutationFn: () => createConnection({ exchange: 'binance', label: label || undefined, apiKey, apiSecret }),
    onSuccess: () => {
      setLabel('');
      setApiKey('');
      setApiSecret('');
      setFormError(null);
      void invalidateConnections();
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Không thể kết nối. Kiểm tra lại API key.';
      setFormError(message);
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => syncConnection(id),
    onSuccess: () => {
      void invalidateConnections();
      void queryClient.invalidateQueries({ queryKey: ['crypto'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConnection(id),
    onSuccess: () => void invalidateConnections(),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    createMutation.mutate();
  };

  const inputClass =
    'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <section className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="mb-1 text-base font-semibold text-white">Kết nối sàn (Binance)</h2>
      <p className="mb-4 text-sm text-amber-400">
        Chỉ dùng API key <strong>read-only</strong> — bật &quot;Enable Reading&quot;, KHÔNG bật rút tiền/giao dịch. Key có
        quyền rút tiền sẽ bị từ chối.
      </p>

      <form onSubmit={onSubmit} className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-neutral-400">Nhãn (tùy chọn)</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} className={inputClass} placeholder="Binance chính" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-400">API Key</label>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required className={inputClass} autoComplete="off" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-400">API Secret</label>
          <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} required type="password" className={inputClass} autoComplete="off" />
        </div>
        {formError && <div className="sm:col-span-2 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{formError}</div>}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {createMutation.isPending ? 'Đang kết nối...' : 'Kết nối'}
          </button>
        </div>
      </form>

      {connections.isLoading ? (
        <p className="text-sm text-neutral-400">Đang tải...</p>
      ) : connections.data && connections.data.length > 0 ? (
        <ul className="space-y-3">
          {connections.data.map((c: Connection) => (
            <li key={c.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">
                    {c.label ?? c.exchange} <span className="text-neutral-500">· {c.apiKeyMasked}</span>
                  </p>
                  <p className="text-xs text-neutral-400">
                    <span className={statusColor(c.status)}>{c.status}</span> · Lần đồng bộ: {formatTime(c.lastSyncAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => syncMutation.mutate(c.id)}
                    disabled={syncMutation.isPending}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm transition hover:border-brand disabled:opacity-50"
                  >
                    {syncMutation.isPending && syncMutation.variables === c.id ? 'Đang đồng bộ...' : 'Đồng bộ'}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(c.id)}
                    disabled={deleteMutation.isPending}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-loss transition hover:border-loss disabled:opacity-50"
                  >
                    Ngắt kết nối
                  </button>
                </div>
              </div>
              {c.lastError && <p className="mt-2 text-xs text-loss">Lỗi: {c.lastError}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-400">Chưa có kết nối nào.</p>
      )}
    </section>
  );
}
