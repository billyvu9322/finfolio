import { randomBytes } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret, maskSecret } from '../../src/lib/crypto-secret.js';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('crypto-secret', () => {
  it('round-trips', () => {
    const enc = encryptSecret('super-secret-value');
    expect(enc).not.toContain('super-secret');
    expect(decryptSecret(enc)).toBe('super-secret-value');
  });

  it('rejects a tampered payload', () => {
    const enc = encryptSecret('x');
    const parts = enc.split('.');
    parts[2] = Buffer.from('zzzz').toString('base64');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('masks', () => expect(maskSecret('abcd1234efgh5678')).toBe('••••5678'));
});
