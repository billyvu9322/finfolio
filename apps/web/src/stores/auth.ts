import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  currency: 'VND' | 'USD';
  timezone: string;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  setToken: (token: string) => void;
  clear: () => void;
}

/**
 * Auth state. The access token is kept here (and mirrored to localStorage so a
 * page reload stays signed in); the refresh token lives only in an httpOnly cookie.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      setAuth: (accessToken, user) => set({ accessToken, user, isAuthenticated: true }),
      setToken: (accessToken) => set({ accessToken }),
      clear: () => set({ accessToken: null, user: null, isAuthenticated: false }),
    }),
    { name: 'finfolio-auth' },
  ),
);
