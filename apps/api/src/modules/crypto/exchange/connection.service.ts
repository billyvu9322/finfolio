import { and, eq, sql } from 'drizzle-orm';

import { db } from '../../../db/index.js';
import { cryptoTransactions, exchangeConnections, type ExchangeConnection } from '../../../db/schema/index.js';
import { decryptSecret, encryptSecret, maskSecret } from '../../../lib/crypto-secret.js';
import { CryptoError } from '../crypto.service.js';
import { SeedCryptoDataProvider } from '../market/SeedCryptoDataProvider.js';
import { adapterFor } from './factory.js';
import { normalizeTrade } from './normalize.js';

export { normalizeTrade };

const fx = new SeedCryptoDataProvider();

function mask(c: ExchangeConnection) {
  return {
    id: c.id,
    exchange: c.exchange,
    label: c.label,
    apiKeyMasked: maskSecret(decryptSecret(c.apiKeyEnc)),
    readOnly: c.readOnly,
    status: c.status,
    lastSyncAt: c.lastSyncAt,
    lastError: c.lastError,
  };
}

export const connectionService = {
  async create(userId: string, body: { exchange: 'binance'; label?: string; apiKey: string; apiSecret: string }) {
    const adapter = adapterFor(body.exchange);
    const perms = await adapter.verifyKey({ apiKey: body.apiKey, apiSecret: body.apiSecret }).catch(() => {
      throw new CryptoError(400, 'Không xác thực được API key');
    });
    
    const [row] = await db
      .insert(exchangeConnections)
      .values({
        userId,
        exchange: body.exchange,
        label: body.label,
        apiKeyEnc: encryptSecret(body.apiKey),
        apiSecretEnc: encryptSecret(body.apiSecret),
        readOnly: !perms.canTrade,
        status: 'active',
      })
      .returning();
    return mask(row!);
  },

  async list(userId: string) {
    const rows = await db.select().from(exchangeConnections).where(eq(exchangeConnections.userId, userId));
    return { connections: rows.map(mask) };
  },

  async remove(userId: string, id: string) {
    const [row] = await db
      .delete(exchangeConnections)
      .where(and(eq(exchangeConnections.id, id), eq(exchangeConnections.userId, userId)))
      .returning();
    if (!row) throw new CryptoError(404, 'Connection not found');
  },

  /** Re-verify the stored key still works (live Binance call). Updates status. */
  async health(userId: string, id: string) {
    const [conn] = await db
      .select()
      .from(exchangeConnections)
      .where(and(eq(exchangeConnections.id, id), eq(exchangeConnections.userId, userId)));
    if (!conn) throw new CryptoError(404, 'Connection not found');

    const adapter = adapterFor(conn.exchange);
    const creds = { apiKey: decryptSecret(conn.apiKeyEnc), apiSecret: decryptSecret(conn.apiSecretEnc) };
    try {
      const perms = await adapter.verifyKey(creds);
      await db
        .update(exchangeConnections)
        .set({ status: 'active', lastError: null })
        .where(eq(exchangeConnections.id, id));
      return { ok: true, status: 'active' as const, canTrade: perms.canTrade, canWithdraw: perms.canWithdraw };
    } catch (err) {
      const message = (err as Error).message;
      await db
        .update(exchangeConnections)
        .set({ status: 'error', lastError: message })
        .where(eq(exchangeConnections.id, id));
      return { ok: false, status: 'error' as const, error: message };
    }
  },

  async sync(userId: string, id: string) {
    const [conn] = await db
      .select()
      .from(exchangeConnections)
      .where(and(eq(exchangeConnections.id, id), eq(exchangeConnections.userId, userId)));
    if (!conn) throw new CryptoError(404, 'Connection not found');

    const adapter = adapterFor(conn.exchange);
    const creds = { apiKey: decryptSecret(conn.apiKeyEnc), apiSecret: decryptSecret(conn.apiSecretEnc) };
    try {
      const trades = await adapter.fetchTrades(creds, conn.lastSyncAt ?? undefined);
      const rate = await fx.fetchFxRate();
      const wallet = conn.label ?? conn.exchange;
      let imported = 0;
      for (const t of trades) {
        const res = await db
          .insert(cryptoTransactions)
          .values(normalizeTrade(userId, conn.exchange, wallet, t, rate))
          .onConflictDoNothing({
            target: [cryptoTransactions.userId, cryptoTransactions.source, cryptoTransactions.externalTradeId],
            where: sql`${cryptoTransactions.externalTradeId} is not null`,
          })
          .returning({ id: cryptoTransactions.id });
        if (res.length) imported++;
      }
      const now = new Date();
      await db
        .update(exchangeConnections)
        .set({ lastSyncAt: now, status: 'active', lastError: null })
        .where(eq(exchangeConnections.id, id));
      return { imported, skipped: trades.length - imported, lastSyncAt: now };
    } catch (err) {
      if (err instanceof CryptoError) throw err;
      await db
        .update(exchangeConnections)
        .set({ status: 'error', lastError: (err as Error).message })
        .where(eq(exchangeConnections.id, id));
      throw new CryptoError(502, 'Đồng bộ sàn thất bại');
    }
  },
};
