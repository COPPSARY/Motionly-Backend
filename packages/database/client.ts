import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';
import { normalizeDatabaseUrl } from './connection-url.js';

export function createDatabase(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: normalizeDatabaseUrl(databaseUrl), max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}

export type Database = ReturnType<typeof createDatabase>['db'];
