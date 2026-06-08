import { api } from '@/lib/api';
import type { AuthUser } from '@/stores/auth';

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', {
    email,
    password,
    displayName,
  });
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function forgotPassword(email: string): Promise<{ message: string; previewToken?: string }> {
  const { data } = await api.post<{ message: string; previewToken?: string }>('/auth/forgot', { email });
  return data;
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post('/auth/reset', { token, password });
}

export async function updateProfile(input: {
  displayName?: string | null;
  currency?: 'VND' | 'USD';
  timezone?: string;
}): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>('/auth/profile', input);
  return data;
}

export async function me(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}
