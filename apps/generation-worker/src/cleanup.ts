import path from 'node:path';

import { parseEnvironment } from '../../api/src/config/env.js';
import { createDatabase } from '../../../packages/database/src/client.js';
import { runRetentionCleanup } from '../../../packages/database/src/cleanup.js';
import { LocalFilesystemObjectStorage } from '../../../packages/object-storage/src/local-filesystem.js';

const environment = parseEnvironment(process.env);
const { db, pool } = createDatabase(environment.databaseUrl);
try {
  const storage = await LocalFilesystemObjectStorage.create(path.resolve(environment.objectStorageLocalRoot));
  const result = await runRetentionCleanup(db, storage);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}
