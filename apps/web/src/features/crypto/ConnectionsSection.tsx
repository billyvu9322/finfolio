import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  createConnection,
  deleteConnection,
  healthConnection,
  listConnections,
  syncConnection,
} from "@/apis/exchange.api";

const inputClass =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand";

function formatTime(iso: string | null): string {
  if (!iso) return "Chưa đồng bộ";
  return new Date(iso).toLocaleString("vi-VN");
}

function BinanceHelp() {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label="Hướng dẫn kết nối Binance" className="text-neutral-400 hover:text-brand">
        <HelpCircle className="h-4 w-4 cursor-help" />
      </button>
      <div className="invisible absolute left-1/2 top-6 z-10 w-72 -translate-x-1/2 rounded-md border border-neutral-700 bg-neutral-950 p-3 text-xs text-neutral-300 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
        <p className="mb-2 font-semibold text-white">Tạo API key read-only trên Binance:</p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Binance → Account → API Management.</li>
          <li>Create API → chọn &quot;System generated&quot;.</li>
          <li>Xác thực 2FA, đặt tên cho key.</li>
          <li>
            <strong className="text-amber-400">CHỈ bật &quot;Enable Reading&quot;</strong>; TẮT &quot;Spot
            Trading&quot; và &quot;Withdrawals&quot;.
          </li>
          <li>(Khuyến nghị) Restrict access — chỉ cho IP tin cậy.</li>
          <li>Copy API Key + Secret Key (secret chỉ hiện 1 lần) → dán vào form.</li>
        </ol>
      </div>
    </span>
  );
}

export function ConnectionsSection() {
  const queryClient = useQueryClient();
  const connections = useQuery({ queryKey: ["connections"], queryFn: listConnections });
  const conn = connections.data?.[0];

  // Health-check the stored Binance config on every mount of the Crypto screen.
  const health = useQuery({
    queryKey: ["connections", "health", conn?.id],
    queryFn: () => healthConnection(conn!.id),
    enabled: !!conn?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["connections"] });

  const createMutation = useMutation({
    mutationFn: () => createConnection({ exchange: "binance", label: label || undefined, apiKey, apiSecret }),
    onSuccess: () => {
      setLabel("");
      setApiKey("");
      setApiSecret("");
      setFormError(null);
      setModalOpen(false);
      void invalidate();
      toast.success("Đã kết nối Binance.");
    },
    onError: (err: unknown) => {
      setFormError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Không thể kết nối. Kiểm tra lại API key.",
      );
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => syncConnection(id),
    onSuccess: (r) => {
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ["crypto"] });
      toast.success(`Đồng bộ xong: +${r.imported} giao dịch.`);
    },
    onError: () => toast.error("Đồng bộ thất bại."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConnection(id),
    onSuccess: () => {
      void invalidate();
      toast.success("Đã ngắt kết nối.");
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    createMutation.mutate();
  };

  return (
    <section className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Kết nối sàn (Binance)</h2>
        {!connections.isLoading && !conn ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Connect
          </button>
        ) : null}
      </div>

      {connections.isLoading ? (
        <p className="mt-3 text-sm text-neutral-400">Đang tải...</p>
      ) : conn ? (
        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                <span className="inline-flex items-center gap-1 rounded-full bg-profit/10 px-2 py-0.5 text-xs text-profit">
                  ● Đã kết nối
                </span>
                {conn.label ?? conn.exchange}
                <span className="text-neutral-500">· {conn.apiKeyMasked}</span>
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                {health.isFetching ? (
                  <span className="text-neutral-400">Đang kiểm tra kết nối…</span>
                ) : health.data?.ok ? (
                  <span className="text-profit">Hoạt động tốt</span>
                ) : health.data ? (
                  <span className="text-loss">Lỗi key: {health.data.error ?? "không xác thực được"}</span>
                ) : (
                  <span className="text-neutral-400">{conn.status}</span>
                )}{" "}
                · Lần đồng bộ: {formatTime(conn.lastSyncAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => syncMutation.mutate(conn.id)}
                disabled={syncMutation.isPending}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm transition hover:border-brand disabled:opacity-50"
              >
                {syncMutation.isPending ? "Đang đồng bộ..." : "Đồng bộ"}
              </button>
              <button
                onClick={() => deleteMutation.mutate(conn.id)}
                disabled={deleteMutation.isPending}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-loss transition hover:border-loss disabled:opacity-50"
              >
                Ngắt kết nối
              </button>
            </div>
          </div>
          {conn.lastError && !health.data?.ok && <p className="mt-2 text-xs text-loss">Lỗi: {conn.lastError}</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">
          Chưa kết nối sàn. Bấm Connect để liên kết API key Binance.
        </p>
      )}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">Kết nối sàn (Binance)</h3>
              <BinanceHelp />
            </div>
            <p className="mb-4 text-sm text-amber-400">
              Chỉ dùng API key <strong>read-only</strong> — bật &quot;Enable Reading&quot;, KHÔNG bật rút
              tiền/giao dịch. Key có quyền rút tiền sẽ bị từ chối.
            </p>
            <form onSubmit={onSubmit} className="grid gap-3">
              <div>
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
              {formError && <div className="rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{formError}</div>}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  {createMutation.isPending ? "Đang kết nối..." : "Kết nối"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
