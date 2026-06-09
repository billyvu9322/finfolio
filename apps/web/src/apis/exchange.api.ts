import { api } from '@/lib/api';

export interface Connection {
  id: string;
  exchange: string;
  label: string | null;
  apiKeyMasked: string;
  readOnly: boolean;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
}

export async function listConnections(): Promise<Connection[]> {
  const { data } = await api.get<{ connections: Connection[] }>('/crypto/connections');
  return data.connections;
}

export async function createConnection(body: {
  exchange: 'binance';
  label?: string;
  apiKey: string;
  apiSecret: string;
}): Promise<Connection> {
  const { data } = await api.post<Connection>('/crypto/connections', body);
  return data;
}

export async function deleteConnection(id: string): Promise<void> {
  await api.delete(`/crypto/connections/${id}`);
}

export async function syncConnection(id: string): Promise<{ imported: number; skipped: number; lastSyncAt: string }> {
  const { data } = await api.post<{ imported: number; skipped: number; lastSyncAt: string }>(
    `/crypto/connections/${id}/sync`,
  );
  return data;
}
