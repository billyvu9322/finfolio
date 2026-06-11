import Decimal from 'decimal.js';
import { and, eq, like, notInArray, sql } from 'drizzle-orm';

import { db } from '../../../db/index.js';
import { cryptoTransactions, exchangeConnections, type ExchangeConnection } from '../../../db/schema/index.js';
import { decryptSecret, encryptSecret, maskSecret } from '../../../lib/crypto-secret.js';
import { findCoin } from '../crypto.coins.js';
import { CryptoError } from '../crypto.service.js';
import { fetchUsdVndRate } from '../market/FxRateProvider.js';
import { adapterFor } from './factory.js';
import { normalizeTrade } from './normalize.js';

export { normalizeTrade };

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
      // Snapshot current holdings (incl. Simple Earn). Each coin is upserted as a
      // single synthetic 'buy' keyed `balance:<coin>` so re-syncing updates the
      // position in place rather than duplicating. Cost basis = current price
      // (the exchange doesn't expose original cost for Earn balances).
      const holdings = await adapter.fetchHoldings(creds);
      const rate = await fetchUsdVndRate();
      const wallet = conn.label ?? conn.exchange;
      const now = new Date();
      let imported = 0;
      for (const h of holdings) {
        const priceVnd = new Decimal(h.priceUsd).mul(rate).toFixed(2);
        await db
          .insert(cryptoTransactions)
          .values({
            userId,
            coinId: findCoin(h.coinSymbol)?.coinId ?? h.coinSymbol.toLowerCase(),
            coinSymbol: h.coinSymbol,
            action: 'buy',
            quantity: h.qty,
            priceVnd,
            priceUsd: h.priceUsd,
            usdVndRate: String(rate),
            fee: '0',
            feeCurrency: 'USDT',
            wallet,
            transactionAt: now,
            source: conn.exchange,
            externalTradeId: `balance:${h.coinSymbol}`,
          })
          .onConflictDoUpdate({
            target: [cryptoTransactions.userId, cryptoTransactions.source, cryptoTransactions.externalTradeId],
            targetWhere: sql`${cryptoTransactions.externalTradeId} is not null`,
            set: { quantity: h.qty, priceVnd, priceUsd: h.priceUsd, usdVndRate: String(rate), transactionAt: now },
          });
        imported++;
      }
      // Remove stale snapshot rows for coins no longer held (or that an earlier
      // buggy sync wrote) — otherwise an old `balance:<coin>` lingers with a wrong
      // quantity because the upsert above only touches currently-returned coins.
      const keep = holdings.map((h) => `balance:${h.coinSymbol}`);
      await db.delete(cryptoTransactions).where(
        and(
          eq(cryptoTransactions.userId, userId),
          eq(cryptoTransactions.source, conn.exchange),
          like(cryptoTransactions.externalTradeId, 'balance:%'),
          ...(keep.length ? [notInArray(cryptoTransactions.externalTradeId, keep)] : []),
        ),
      );
      console.info(`[sync] ${conn.exchange} snapshot: ${imported} coins [${keep.join(', ')}]`);
      // Pull fresh Binance prices for the newly-held coins so the portfolio shows
      // real current price / P&L instead of seed fallback. Non-fatal: the snapshot
      // already succeeded, so a price-fetch hiccup must not fail the sync.
      const { cryptoPriceService } = await import('../crypto-price.service.js');
      await cryptoPriceService.refreshCryptoPrices().catch(() => undefined);
      await db
        .update(exchangeConnections)
        .set({ lastSyncAt: now, status: 'active', lastError: null })
        .where(eq(exchangeConnections.id, id));
      return { imported, skipped: 0, lastSyncAt: now };
    } catch (err) {
      if (err instanceof CryptoError) throw err;
      const reason = (err as Error).message;
      await db
        .update(exchangeConnections)
        .set({ status: 'error', lastError: reason })
        .where(eq(exchangeConnections.id, id));
      // 422 (not 5xx) so the central error handler forwards the real reason to the client.
      throw new CryptoError(422, `Đồng bộ sàn thất bại: ${reason}`);
    }
  },
};
