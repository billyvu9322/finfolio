# Phase 1 (partial) — Profile & Auth Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **NO GIT this build** (per user instruction). Wherever a normal plan would `git commit`, this plan uses a **Checkpoint** step that runs typecheck/tests instead. Do not run any git command.

**Goal:** Complete the non-email part of Phase 1 — `PATCH /auth/profile`, deep `/health`, a real Register page, a real Settings profile form, `/auth/me` bootstrap, a token-hash util refactor, a dev seed script, and vitest unit tests.

**Architecture:** Extend the existing `auth` module (Zod-typed Fastify routes → service → Drizzle). No new DB tables (the `users` table already has `display_name`, `currency`, `timezone`). Pure logic (token hashing, schema validation, mapping) is unit-tested; DB-touching paths get integration tests that skip when `DATABASE_URL` is unset.

**Tech Stack:** Fastify 5, Drizzle ORM (postgres-js), Zod, `fastify-type-provider-zod`, vitest (API). React 18, TanStack Router/Query, Zustand, axios (Web). Runtime via `tsx` (no compiled build).

**Spec:** [../specs/2026-06-08-phase1-auth-profile-design.md](../specs/2026-06-08-phase1-auth-profile-design.md)

---

## File structure

**API (`apps/api`)**
- Create `vitest.config.ts` — test config + `.js`→`.ts` resolver plugin.
- Create `src/modules/auth/token.util.ts` — `hashToken`, `generateToken` (pure).
- Create `src/modules/auth/token.util.test.ts`.
- Create `src/modules/auth/auth.schema.test.ts`.
- Create `src/modules/auth/auth.service.test.ts` (pure: `toPublic`).
- Create `src/modules/auth/auth.routes.integration.test.ts` (DB-gated).
- Create `scripts/seed.ts`.
- Modify `src/modules/auth/auth.service.ts` — import util; add `updateProfile`; export `toPublic`.
- Modify `src/modules/auth/auth.schema.ts` — add `updateProfileBodySchema`.
- Modify `src/modules/auth/auth.routes.ts` — add `PATCH /profile`.
- Modify `src/routes.ts` — deep `/health` (DB ping).
- Modify `package.json` — add `vitest`, `test`, `db:seed` scripts.

**Web (`apps/web`)**
- Create `src/features/auth/RegisterPage.tsx`.
- Create `src/features/settings/SettingsPage.tsx`.
- Modify `src/features/auth/auth.api.ts` — add `updateProfile`.
- Modify `src/stores/auth.ts` — add `setUser`.
- Modify `src/router.tsx` — add public `/register`; point `/settings` at `SettingsPage`.
- Modify `src/components/layout/AppLayout.tsx` — `/auth/me` hydrate on mount.

---

## Task 1: Vitest setup (API)

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/sanity.test.ts` (temporary)

- [x] **Step 1: Add vitest dep + scripts**

In `apps/api/package.json`, add to `devDependencies`: `"vitest": "^2.1.4"`. Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest",
"db:seed": "tsx scripts/seed.ts"
```

- [x] **Step 2: Install**

Run: `pnpm install`
Expected: vitest added, no errors.

- [ ] **Step 3: Create vitest config with `.js`→`.ts` resolver**

Create `apps/api/vitest.config.ts`:
```ts
import { defineConfig, type Plugin } from 'vitest/config';

// Source uses NodeNext-style ".js" specifiers that point at ".ts" files.
// Rewrite them so Vite/vitest can resolve during tests.
const jsToTs: Plugin = {
  name: 'js-to-ts',
  enforce: 'pre',
  async resolveId(source, importer) {
    if (importer && source.startsWith('.') && source.endsWith('.js')) {
      const resolved = await this.resolve(source.slice(0, -3) + '.ts', importer, {
        skipSelf: true,
      });
      if (resolved) return resolved;
    }
    return null;
  },
};

export default defineConfig({
  plugins: [jsToTs],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 4: Temporary sanity test**

Create `apps/api/src/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [x] **Step 5: Run**

Run: `pnpm --filter @finfolio/api test`
Expected: 1 passed.

- [ ] **Step 6: Remove the sanity test**

Delete `apps/api/src/sanity.test.ts`.

- [x] **Step 7: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: no errors.

---

## Task 2: `token.util.ts` (extract + test)

**Files:**
- Create: `apps/api/src/modules/auth/token.util.ts`
- Create: `apps/api/src/modules/auth/token.util.test.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`

- [x] **Step 1: Write the failing test**

Create `apps/api/src/modules/auth/token.util.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hashToken, generateToken } from './token.util.js';

describe('hashToken', () => {
  it('is a deterministic sha256 hex', () => {
    // sha256("abc")
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('generateToken', () => {
  it('returns a 64-char base64url string for 48 bytes', () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('produces unique values', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm --filter @finfolio/api test token.util`
Expected: FAIL — cannot resolve `./token.util.js`.

- [ ] **Step 3: Implement the util**

Create `apps/api/src/modules/auth/token.util.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';

/** SHA-256 hex of a raw token. We store only the hash, never the raw value. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Cryptographically-random opaque token (base64url). 48 bytes → 64 chars. */
export function generateToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @finfolio/api test token.util`
Expected: 3 passed.

- [ ] **Step 5: Refactor `auth.service.ts` to use the util**

In `apps/api/src/modules/auth/auth.service.ts`:
- Remove the local `import { createHash, randomBytes } from 'node:crypto';`.
- Remove the local `hashToken` function.
- Replace `randomBytes(48).toString('base64url')` in `issueRefreshToken` with `generateToken()`.
- Add import at top: `import { hashToken, generateToken } from './token.util.js';`

(All existing call sites — `issueRefreshToken`, `validateRefreshToken`, `revokeRefreshToken` — keep using `hashToken(...)`, now from the util.)

- [ ] **Step 6: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`
Expected: typecheck clean, all tests pass.

---

## Task 3: Profile body schema (+ test)

**Files:**
- Modify: `apps/api/src/modules/auth/auth.schema.ts`
- Create: `apps/api/src/modules/auth/auth.schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/auth/auth.schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { registerBodySchema, updateProfileBodySchema } from './auth.schema.js';

describe('registerBodySchema', () => {
  it('accepts a valid payload', () => {
    expect(
      registerBodySchema.safeParse({ email: 'a@b.com', password: 'Abcd1234' }).success,
    ).toBe(true);
  });
  it('rejects password without uppercase', () => {
    expect(
      registerBodySchema.safeParse({ email: 'a@b.com', password: 'abcd1234' }).success,
    ).toBe(false);
  });
  it('rejects password without a number', () => {
    expect(
      registerBodySchema.safeParse({ email: 'a@b.com', password: 'Abcdefgh' }).success,
    ).toBe(false);
  });
  it('rejects password shorter than 8', () => {
    expect(
      registerBodySchema.safeParse({ email: 'a@b.com', password: 'Abc123' }).success,
    ).toBe(false);
  });
});

describe('updateProfileBodySchema', () => {
  it('accepts a single field', () => {
    expect(updateProfileBodySchema.safeParse({ currency: 'USD' }).success).toBe(true);
  });
  it('rejects an empty body', () => {
    expect(updateProfileBodySchema.safeParse({}).success).toBe(false);
  });
  it('rejects an invalid currency', () => {
    expect(updateProfileBodySchema.safeParse({ currency: 'EUR' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @finfolio/api test auth.schema`
Expected: FAIL — `updateProfileBodySchema` is not exported.

- [x] **Step 3: Add the schema**

In `apps/api/src/modules/auth/auth.schema.ts`, append:
```ts
export const updateProfileBodySchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    currency: z.enum(['VND', 'USD']).optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'At least one field is required',
  });

export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
```

- [x] **Step 4: Run to verify it passes**

Run: `pnpm --filter @finfolio/api test auth.schema`
Expected: all passed.

- [x] **Step 5: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 4: `authService.updateProfile` + `toPublic` test

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.service.test.ts`

- [ ] **Step 1: Write the failing test (pure `toPublic`)**

Create `apps/api/src/modules/auth/auth.service.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { authService } from './auth.service.js';
import type { User } from '../../db/schema/index.js';

const now = new Date('2026-06-08T00:00:00Z');
const user: User = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@b.com',
  passwordHash: 'secret-hash',
  displayName: 'Alice',
  currency: 'VND',
  timezone: 'Asia/Ho_Chi_Minh',
  createdAt: now,
  updatedAt: now,
};

describe('authService.toPublic', () => {
  it('maps fields and strips passwordHash', () => {
    const pub = authService.toPublic(user);
    expect(pub).toEqual({
      id: user.id,
      email: user.email,
      displayName: 'Alice',
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      createdAt: now,
    });
    expect('passwordHash' in pub).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails or passes**

Run: `pnpm --filter @finfolio/api test auth.service`
Expected: PASS (`toPublic` already exists and is exported on `authService`). If the `User` type import or field names mismatch, fix the test to match `db/schema/users.ts` exactly.

- [x] **Step 3: Add `updateProfile` to the service**

In `apps/api/src/modules/auth/auth.service.ts`, add a method inside the `authService` object (next to `validateAccessUser`):
```ts
  /** Updates profile fields (FR-AUTH-05) and returns the public user. */
  async updateProfile(
    userId: string,
    patch: { displayName?: string; currency?: 'VND' | 'USD'; timezone?: string },
  ): Promise<UserPublic> {
    const [updated] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) {
      throw new AuthError(401, 'User no longer exists');
    }
    return toPublic(updated);
  },
```
Ensure `eq` is imported from `drizzle-orm` (it already is) and `UserPublic`, `users`, `toPublic`, `AuthError` are in scope (they are).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @finfolio/api test auth.service`
Expected: PASS.

- [x] **Step 5: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 5: `PATCH /auth/profile` route

**Files:**
- Modify: `apps/api/src/modules/auth/auth.routes.ts`

- [x] **Step 1: Add the route**

In `apps/api/src/modules/auth/auth.routes.ts`:
- Update the schema import to include the new schema:
  `import { authResponseSchema, loginBodySchema, registerBodySchema, updateProfileBodySchema, userPublicSchema } from './auth.schema.js';`
- Add this route (after the `/me` handler, before the closing brace):
```ts
  fastify.patch(
    '/profile',
    {
      onRequest: [fastify.authenticate],
      schema: {
        tags: ['auth'],
        security: [{ bearerAuth: [] }],
        body: updateProfileBodySchema,
        response: { 200: userPublicSchema },
      },
    },
    async (request, reply) => {
      const user = await authService.updateProfile(request.user.sub, request.body);
      return reply.send(user);
    },
  );
```

- [x] **Step 2: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean (route body typed via Zod provider).

---

## Task 6: Deep `/health` (DB ping)

**Files:**
- Modify: `apps/api/src/routes.ts`

- [x] **Step 1: Replace the health handler**

In `apps/api/src/routes.ts`:
- Add imports at top: `import { sql } from 'drizzle-orm';` and `import { db } from './db/index.js';`
- Replace the existing `/health` registration with:
```ts
  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        response: {
          200: z.object({ status: z.string(), db: z.string() }),
          503: z.object({ status: z.string(), db: z.string() }),
        },
      },
    },
    async (_request, reply) => {
      try {
        await db.execute(sql`select 1`);
        return reply.send({ status: 'ok', db: 'up' });
      } catch {
        return reply.code(503).send({ status: 'degraded', db: 'down' });
      }
    },
  );
```

- [x] **Step 2: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 7: Integration tests (DB-gated)

**Files:**
- Create: `apps/api/src/modules/auth/auth.routes.integration.test.ts`

- [ ] **Step 1: Write the gated integration test**

Create `apps/api/src/modules/auth/auth.routes.integration.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const hasDb = !!process.env.DATABASE_URL;

// Skips entirely when no database is configured, so the suite runs anywhere.
describe.skipIf(!hasDb)('auth routes (integration)', () => {
  let app: FastifyInstance;
  const email = `it-${Date.now()}@finfolio.test`;
  const password = 'Abcd1234';

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /v1/health reports db up', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('register → patch profile updates currency', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password, displayName: 'IT User' },
    });
    expect(reg.statusCode).toBe(201);
    const token = reg.json().accessToken as string;

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/auth/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: { currency: 'USD', timezone: 'UTC' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ currency: 'USD', timezone: 'UTC' });
  });

  it('PATCH /auth/profile without token is 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/auth/profile',
      payload: { currency: 'USD' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH /auth/profile with empty body is 400', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: `it2-${Date.now()}@finfolio.test`, password },
    });
    const token = reg.json().accessToken as string;
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/auth/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run (no DB → skipped)**

Run: `pnpm --filter @finfolio/api test`
Expected: integration suite reported as skipped; all pure tests pass.

- [ ] **Step 3: (Optional) Run with a DB**

If a local Postgres is available: `docker compose up -d db`, set `DATABASE_URL` + run `db:push`, then `pnpm --filter @finfolio/api test`.
Expected: integration tests pass. (Skip this step if no DB in the environment.)

- [ ] **Step 4: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean.

---

## Task 8: Dev seed script

**Files:**
- Create: `apps/api/scripts/seed.ts`

- [x] **Step 1: Write the seed script**

Create `apps/api/scripts/seed.ts`:
```ts
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/index.js';
import { users } from '../src/db/schema/index.js';

const DEMO_EMAIL = 'demo@finfolio.vn';
const DEMO_PASSWORD = 'Demo1234';

async function main() {
  const existing = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Seed: demo user already exists (${DEMO_EMAIL})`);
    process.exit(0);
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await db.insert(users).values({ email: DEMO_EMAIL, passwordHash, displayName: 'Demo User' });
  // eslint-disable-next-line no-console
  console.log(`Seed: created ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
```

- [x] **Step 2: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/api typecheck`
Expected: clean. (Running `db:seed` itself needs a live DB — skip unless available.)

---

## Task 9: Web — `auth.api` + store

**Files:**
- Modify: `apps/web/src/features/auth/auth.api.ts`
- Modify: `apps/web/src/stores/auth.ts`

- [x] **Step 1: Add `updateProfile` to the API client**

In `apps/web/src/features/auth/auth.api.ts`, append:
```ts
export interface UpdateProfilePayload {
  displayName?: string;
  currency?: 'VND' | 'USD';
  timezone?: string;
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>('/auth/profile', payload);
  return data;
}
```

- [x] **Step 2: Add `setUser` to the auth store**

In `apps/web/src/stores/auth.ts`, add to the `AuthState` interface:
```ts
  setUser: (user: AuthUser) => void;
```
and to the store implementation (next to `setToken`):
```ts
      setUser: (user) => set({ user }),
```

- [x] **Step 3: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Task 10: Web — Register page + route

**Files:**
- Create: `apps/web/src/features/auth/RegisterPage.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/features/auth/LoginPage.tsx`

- [x] **Step 1: Create the Register page**

Create `apps/web/src/features/auth/RegisterPage.tsx`:
```tsx
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import { register } from './auth.api';
import { useAuthStore } from '@/stores/auth';

const rules = [
  { label: '≥ 8 ký tự', test: (p: string) => p.length >= 8 },
  { label: 'Có chữ hoa', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Có số', test: (p: string) => /[0-9]/.test(p) },
];

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passOk = rules.every((r) => r.test(password));
  const matchOk = password.length > 0 && password === confirm;
  const canSubmit = /\S+@\S+\.\S+/.test(email) && passOk && matchOk && !loading;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await register(email, password, displayName || undefined);
      setAuth(res.accessToken, res.user);
      void navigate({ to: '/dashboard' });
    } catch {
      setError('Đăng ký thất bại. Email có thể đã tồn tại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-8"
      >
        <div className="mb-6 text-center text-2xl font-bold text-brand">FinFolio</div>
        <h1 className="mb-6 text-center text-lg font-medium">Tạo tài khoản</h1>

        {error && (
          <div className="mb-4 rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>
        )}

        <label className="mb-1 block text-sm text-neutral-400">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <label className="mb-1 block text-sm text-neutral-400">Mật khẩu</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <ul className="mb-4 space-y-1">
          {rules.map((r) => {
            const ok = r.test(password);
            return (
              <li key={r.label} className={`text-xs ${ok ? 'text-profit' : 'text-neutral-500'}`}>
                {ok ? '✓' : '○'} {r.label}
              </li>
            );
          })}
        </ul>

        <label className="mb-1 block text-sm text-neutral-400">Xác nhận mật khẩu</label>
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mb-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {confirm.length > 0 && !matchOk && (
          <p className="mb-3 text-xs text-loss">Mật khẩu không khớp.</p>
        )}

        <label className="mb-1 mt-3 block text-sm text-neutral-400">Tên hiển thị (tùy chọn)</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mb-6 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? 'Đang tạo...' : 'Đăng ký'}
        </button>

        <p className="mt-4 text-center text-sm text-neutral-400">
          Đã có tài khoản?{' '}
          <a href="/login" className="text-brand hover:underline">
            Đăng nhập
          </a>
        </p>
      </form>
    </div>
  );
}
```

- [x] **Step 2: Register the route**

In `apps/web/src/router.tsx`:
- Add import: `import { RegisterPage } from '@/features/auth/RegisterPage';`
- Add a route (next to `loginRoute`):
```ts
const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
});
```
- Add `registerRoute` to the root's children array:
```ts
const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  appRoute.addChildren([
    // ...existing children unchanged
  ]),
]);
```

- [x] **Step 3: Link from Login**

In `apps/web/src/features/auth/LoginPage.tsx`, add below the submit button (inside the form):
```tsx
        <p className="mt-4 text-center text-sm text-neutral-400">
          Chưa có tài khoản?{' '}
          <a href="/register" className="text-brand hover:underline">
            Đăng ký
          </a>
        </p>
```

- [x] **Step 4: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Task 11: Web — Settings profile page + route

**Files:**
- Create: `apps/web/src/features/settings/SettingsPage.tsx`
- Modify: `apps/web/src/router.tsx`

- [x] **Step 1: Create the Settings page**

Create `apps/web/src/features/settings/SettingsPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';

import { updateProfile } from '@/features/auth/auth.api';
import { useAuthStore } from '@/stores/auth';

const TIMEZONES = ['Asia/Ho_Chi_Minh', 'UTC', 'Asia/Bangkok', 'Asia/Singapore'];

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [currency, setCurrency] = useState<'VND' | 'USD'>(user?.currency ?? 'VND');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'Asia/Ho_Chi_Minh');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    displayName !== (user?.displayName ?? '') ||
    currency !== user?.currency ||
    timezone !== user?.timezone;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateProfile({ displayName: displayName || undefined, currency, timezone });
      setUser(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Cài đặt</h1>
      <form
        onSubmit={onSubmit}
        className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6"
      >
        <h2 className="mb-4 text-base font-semibold">Hồ sơ</h2>

        <label className="mb-1 block text-sm text-neutral-400">Tên hiển thị</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mb-4 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <label className="mb-1 block text-sm text-neutral-400">Email</label>
        <input
          type="email"
          value={user?.email ?? ''}
          disabled
          className="mb-4 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-500"
        />

        <label className="mb-1 block text-sm text-neutral-400">Đơn vị tiền tệ</label>
        <div className="mb-4 flex gap-2">
          {(['VND', 'USD'] as const).map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCurrency(c)}
              className={`rounded-md px-4 py-2 text-sm transition ${
                currency === c
                  ? 'bg-brand text-white'
                  : 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm text-neutral-400">Múi giờ</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="mb-6 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || saving}
            className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
          {saved && <span className="text-sm text-profit">Đã lưu ✓</span>}
        </div>
      </form>
    </div>
  );
}
```

- [x] **Step 2: Point `/settings` at the real page**

In `apps/web/src/router.tsx`:
- Add import: `import { SettingsPage } from '@/features/settings/SettingsPage';`
- Replace the `settingsRoute` definition (currently built via the `page(...)` helper) with:
```ts
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
});
```
(Leave the other `page(...)` placeholder routes unchanged; `settingsRoute` is already in the children array.)

- [x] **Step 3: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Task 12: Web — `/auth/me` bootstrap in AppLayout

**Files:**
- Modify: `apps/web/src/components/layout/AppLayout.tsx`

- [x] **Step 1: Hydrate user from the server on mount**

In `apps/web/src/components/layout/AppLayout.tsx`:
- Add imports:
```ts
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { me } from '@/features/auth/auth.api';
```
- Inside the `AppLayout` component, after the existing store hooks, add:
```ts
  const setUser = useAuthStore((s) => s.setUser);
  const { data: freshUser } = useQuery({ queryKey: ['me'], queryFn: me, staleTime: 60_000 });
  useEffect(() => {
    if (freshUser) setUser(freshUser);
  }, [freshUser, setUser]);
```
(The axios interceptor + route guard already handle a 401 by clearing auth and redirecting to `/login`, so no extra error handling is needed here.)

- [x] **Step 2: Checkpoint (no git)**

Run: `pnpm --filter @finfolio/web typecheck`
Expected: clean.

---

## Final verification

- [x] **API:** `pnpm --filter @finfolio/api typecheck && pnpm --filter @finfolio/api test`
  Expected: typecheck clean; pure tests pass; integration suite skipped (no DB) or passing (with DB).
- [x] **Web:** `pnpm --filter @finfolio/web typecheck`
  Expected: clean.
- [ ] **Manual smoke (optional, needs DB):** `docker compose up -d db`, `db:push`, `db:seed`, run both dev servers; register a new user → lands on dashboard; Settings → change currency → reload → value persists (via `/auth/me`).

---

## Acceptance criteria (from spec)

- [x] `PATCH /auth/profile` updates fields, returns updated user, rejects empty/invalid body, requires auth. (Tasks 3–5, 7)
- [x] `GET /health` reflects real DB reachability. (Task 6, 7)
- [x] Register page creates an account, enforces strength rules client-side, lands authenticated on dashboard. (Task 10)
- [x] Settings profile loads current values, saves, persists across reload via `/auth/me`. (Tasks 11–12)
- [x] `pnpm --filter @finfolio/api test` green; pure-logic tests pass without a DB. (Tasks 1–4, 7)
- [ ] No regression to existing login/logout/refresh. (Task 2 refactor is behavior-preserving.)
