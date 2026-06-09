import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import {
  Coins,
  LayoutDashboard,
  LineChart,
  Bitcoin,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react';

import { logout } from '@/apis/auth.api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/gold', label: 'Vàng', icon: Coins },
  { to: '/stocks', label: 'Chứng khoán', icon: LineChart },
  { to: '/crypto', label: 'Crypto', icon: Bitcoin },
  { to: '/reports', label: 'Báo cáo', icon: FileText },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
] as const;

export function AppLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clear();
      void navigate({ to: '/login' });
    }
  };

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="skip-link">
        Bỏ qua tới nội dung
      </a>
      <aside className="flex w-60 flex-col border-r border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-8 px-2 text-xl font-bold text-brand">FinFolio</div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800"
              activeProps={{ className: cn('bg-neutral-800 text-white') }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-neutral-800 pt-4">
          <div className="px-3 text-xs text-neutral-500">{user?.email}</div>
          <button
            onClick={handleLogout}
            aria-label="Đăng xuất"
            className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>
      </aside>
      <main id="main" className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
