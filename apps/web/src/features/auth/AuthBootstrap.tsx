import { useEffect, useState, type ReactNode } from 'react';

import { me } from '@/apis/auth.api';
import { useAuthStore } from '@/stores/auth';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const [booting, setBooting] = useState(Boolean(accessToken));

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setBooting(true);
    me()
      .then((user) => {
        if (!cancelled) setUser(user);
      })
      .catch(() => {
        if (!cancelled) clear();
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, clear, setUser]);

  if (booting) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">Đang tải phiên đăng nhập...</div>;
  }

  return children;
}
