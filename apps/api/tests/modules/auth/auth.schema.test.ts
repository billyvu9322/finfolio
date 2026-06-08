import { describe, expect, it } from 'vitest';

import {
  forgotPasswordBodySchema,
  profileUpdateBodySchema,
  resetPasswordBodySchema,
} from '../../../src/modules/auth/auth.schema.js';

describe('auth phase 1 schemas', () => {
  it('accepts valid profile updates', () => {
    const result = profileUpdateBodySchema.parse({
      displayName: 'Binh Nguyen',
      currency: 'USD',
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(result).toEqual({
      displayName: 'Binh Nguyen',
      currency: 'USD',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('rejects empty profile updates', () => {
    expect(() => profileUpdateBodySchema.parse({})).toThrow();
  });

  it('accepts forgot password email requests', () => {
    expect(forgotPasswordBodySchema.parse({ email: 'user@example.com' })).toEqual({
      email: 'user@example.com',
    });
  });

  it('requires strong reset passwords', () => {
    expect(() =>
      resetPasswordBodySchema.parse({ token: 'reset-token', password: 'weakpass' }),
    ).toThrow(/uppercase/);
  });
});
