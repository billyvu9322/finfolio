import axios, { AxiosError } from 'axios';

import { useAuthStore } from '@/stores/auth';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/v1';

/** Shared axios instance. `withCredentials` so the refresh cookie is sent. */
export const api = axios.create({
  baseURL,
  withCredentials: true,
});

// Attach the access token to every request.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, try a one-shot refresh, then replay the original request.
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config;
    const isAuthCall = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !isAuthCall && !(original as never)['_retry']) {
      (original as unknown as Record<string, unknown>)._retry = true;
      try {
        refreshing ??= api
          .post<{ accessToken: string }>('/auth/refresh')
          .then((r) => {
            const token = r.data.accessToken;
            useAuthStore.getState().setToken(token);
            return token;
          })
          .finally(() => {
            refreshing = null;
          });

        const token = await refreshing;
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        useAuthStore.getState().clear();
      }
    }
    return Promise.reject(error);
  },
);
