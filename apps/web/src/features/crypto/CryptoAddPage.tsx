import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import {
  createCryptoTx,
  searchCoins,
  swapCrypto,
  type Coin,
} from "@/apis/crypto.api";

const WALLETS = [
  "Binance",
  "OKX",
  "Bybit",
  "MetaMask",
  "Trust Wallet",
  "Ledger",
  "Khác",
];
type Mode = "buy" | "sell" | "swap";

const inputClass =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand";

export function CryptoAddPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("buy");
  const [wallet, setWallet] = useState(WALLETS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [coin, setCoin] = useState("");
  const [coinOpen, setCoinOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const priceCurrency = "USDT" as const; // crypto priced in USDT (not VND)
  const [fee, setFee] = useState("0");
  const [feeCurrency, setFeeCurrency] = useState<"USDT" | "COIN">("USDT");
  const [transactionAt, setTransactionAt] = useState("");
  const [srcCoin, setSrcCoin] = useState("");
  const [srcQty, setSrcQty] = useState("");
  const [dstCoin, setDstCoin] = useState("");
  const [dstQty, setDstQty] = useState("");
  const [valueVnd, setValueVnd] = useState("");

  const coinQuery = useQuery({
    queryKey: ["crypto", "coins", coin],
    queryFn: () => searchCoins(coin),
    enabled: mode !== "swap" && coin.length > 0,
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (mode === "swap") {
        const [source, dest] = await Promise.all([
          resolveCoin(srcCoin),
          resolveCoin(dstCoin),
        ]);
        await swapCrypto({
          sourceCoinId: source.coinId,
          sourceSymbol: source.symbol,
          sourceQty: Number(srcQty),
          destCoinId: dest.coinId,
          destSymbol: dest.symbol,
          destQty: Number(dstQty),
          valueVnd: Number(valueVnd),
          wallet,
          ...(transactionAt
            ? { transactionAt: new Date(transactionAt).toISOString() }
            : {}),
        });
      } else {
        const selected = await resolveCoin(coin);
        await createCryptoTx({
          coinId: selected.coinId,
          coinSymbol: selected.symbol,
          action: mode,
          quantity: Number(quantity),
          price: Number(price),
          priceCurrency,
          fee: Number(fee || 0),
          feeCurrency,
          wallet,
          ...(transactionAt
            ? { transactionAt: new Date(transactionAt).toISOString() }
            : {}),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["crypto"] });
      void navigate({ to: "/crypto" });
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ??
          "Lưu giao dịch thất bại. Kiểm tra coin, số lượng và số dư ví.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Nhập giao dịch crypto</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Mua/bán theo giá USDT, hoặc swap thành một lệnh bán + một lệnh mua.
      </p>

      <form
        onSubmit={submit}
        className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6"
      >
        {error ? (
          <div className="mb-4 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">
            {error}
          </div>
        ) : null}

        <div className="mb-5 flex gap-2">
          {(["buy", "sell", "swap"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`flex-1 rounded-md px-3 py-2 text-sm ${mode === item ? "bg-brand text-white" : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800"}`}
            >
              {item === "buy" ? "Mua" : item === "sell" ? "Bán" : "Swap"}
            </button>
          ))}
        </div>

        {mode !== "swap" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="relative sm:col-span-2">
              <label className="mb-1 block text-sm text-neutral-400">
                Coin
              </label>
              <input
                value={coin}
                onChange={(event) => {
                  setCoin(event.target.value.toUpperCase());
                  setCoinOpen(true);
                }}
                onFocus={() => setCoinOpen(true)}
                onBlur={() => setTimeout(() => setCoinOpen(false), 120)}
                className={`${inputClass} font-mono`}
                placeholder="BTC"
                required
              />
              {coinOpen && coinQuery.data && coin.length > 0 ? (
                <CoinMenu
                  coins={coinQuery.data}
                  onPick={(picked) => {
                    setCoin(picked.symbol);
                    setCoinOpen(false);
                  }}
                />
              ) : null}
            </div>
            <Field label="Số lượng">
              <input
                type="number"
                step="0.00000001"
                min="0"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="Giá (USDT)">
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  required
                  className={`${inputClass} font-mono`}
                  placeholder="Giá theo USDT"
                />
                <span className="flex items-center rounded-md border border-neutral-700 px-3 text-sm text-neutral-400">
                  USDT
                </span>
              </div>
            </Field>
            <Field label="Phí">
              <input
                type="number"
                min="0"
                value={fee}
                onChange={(event) => setFee(event.target.value)}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="Loại phí">
              <select
                value={feeCurrency}
                onChange={(event) =>
                  setFeeCurrency(event.target.value as "USDT" | "COIN")
                }
                className={inputClass}
              >
                <option value="USDT">USDT</option>
                <option value="COIN">COIN</option>
              </select>
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-neutral-800 p-3">
              <div className="mb-2 text-sm text-neutral-400">Từ</div>
              <input
                value={srcCoin}
                onChange={(event) =>
                  setSrcCoin(event.target.value.toUpperCase())
                }
                placeholder="Coin nguồn"
                required
                className={`${inputClass} mb-2 font-mono`}
              />
              <input
                type="number"
                step="0.00000001"
                min="0"
                value={srcQty}
                onChange={(event) => setSrcQty(event.target.value)}
                placeholder="Số lượng"
                required
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="rounded-md border border-neutral-800 p-3">
              <div className="mb-2 text-sm text-neutral-400">Đến</div>
              <input
                value={dstCoin}
                onChange={(event) =>
                  setDstCoin(event.target.value.toUpperCase())
                }
                placeholder="Coin đích"
                required
                className={`${inputClass} mb-2 font-mono`}
              />
              <input
                type="number"
                step="0.00000001"
                min="0"
                value={dstQty}
                onChange={(event) => setDstQty(event.target.value)}
                placeholder="Số lượng nhận"
                required
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-neutral-400">
                Giá trị giao dịch (VND)
              </label>
              <input
                type="number"
                min="0"
                value={valueVnd}
                onChange={(event) => setValueVnd(event.target.value)}
                required
                className={`${inputClass} font-mono`}
              />
              <p className="mt-1 text-xs text-neutral-500">= 1 Bán + 1 Mua</p>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nơi lưu trữ">
            <select
              value={wallet}
              onChange={(event) => setWallet(event.target.value)}
              className={inputClass}
            >
              {WALLETS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Thời gian giao dịch">
            <input
              type="datetime-local"
              value={transactionAt}
              onChange={(event) => setTransactionAt(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu giao dịch"}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/crypto" })}
            className="rounded-md border border-neutral-700 px-5 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Huỷ
          </button>
        </div>
      </form>
    </div>
  );
}

async function resolveCoin(query: string): Promise<Coin> {
  const coin = (await searchCoins(query))[0];
  if (!coin) throw new Error("coin");
  return coin;
}

function CoinMenu({
  coins,
  onPick,
}: {
  coins: Coin[];
  onPick: (coin: Coin) => void;
}) {
  return (
    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-neutral-700 bg-neutral-900 shadow-xl">
      {coins.map((coin) => (
        <button
          type="button"
          key={coin.coinId}
          onClick={() => onPick(coin)}
          className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800"
        >
          <span className="font-mono">{coin.symbol}</span>
          <span className="text-xs text-neutral-500">{coin.name}</span>
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-1 block text-sm text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
