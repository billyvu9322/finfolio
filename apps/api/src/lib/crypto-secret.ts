import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Reads ENCRYPTION_KEY straight from process.env (no config/env import) so unit
 * tests can exercise this without triggering full env validation. Throws only
 * when the feature is actually used (a key is needed) — see Phase 7 spec.
 */
function key(): Buffer {
  const k = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
  if (k.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be base64-encoded 32 bytes');
  }
  return k;
}

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const [ivb, tagb, ctb] = payload.split('.');
  if (!ivb || !tagb || !ctb) throw new Error('Malformed encrypted payload');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivb, 'base64'));
  d.setAuthTag(Buffer.from(tagb, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ctb, 'base64')), d.final()]).toString('utf8');
}

export function maskSecret(s: string): string {
  return '••••' + s.slice(-4);
}
