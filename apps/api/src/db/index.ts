import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../config/env.js';
import * as schema from './schema/index.js';

/**
 * Single shared postgres-js connection pool + Drizzle instance.
 * `max` mirrors the connection-pool sizing target in the SRS (NFR 4.1).
 */
const queryClient = postgres(env.DATABASE_URL, { max: 20 });

export const db = drizzle(queryClient, { schema });

export async function pingDb(): Promise<void> {
  await queryClient`select 1`;
}

export type Database = typeof db;
export { schema };
