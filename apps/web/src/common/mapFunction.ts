
export const formatVnd = (value: string) =>
  `${new Intl.NumberFormat("vi-VN").format(Math.round(Number(value)))} d`;
export const COLORS: Record<string, string> = {
  gold: "#F59E0B",
  stock: "#3B82F6",
  crypto: "#A855F7",
  cash: "#64748B",
};

export const ASSET_LABELS: Record<string, string> = {
  gold: "Vàng",
  stock: "Chứng khoán",
  crypto: "Crypto",
};

export const PERIODS = ["7d", "1m", "3m", "1y", "all"] as const;

export function assetLabel(assetClass: string) {
  return ASSET_LABELS[assetClass] ?? assetClass;
}