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

export async function me(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}
