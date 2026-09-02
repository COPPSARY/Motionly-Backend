import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ObjectStorageAssetStager } from '../../../apps/generation-worker/src/asset-stager.js';
import { LocalFilesystemObjectStorage } from '../../../packages/object-storage/src/local-filesystem.js';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('ObjectStorageAssetStager', () => {
  it('advertises the exact source-policy-compatible virtual import path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'motionly-assets-'));
    const workspace = await mkdtemp(path.join(tmpdir(), 'motionly-workspace-'));
    temporaryDirectories.push(root, workspace);
    const source = path.join(root, 'source.png');
    await writeFile(source, Buffer.from('asset-bytes'));
    const storage = await LocalFilesystemObjectStorage.create(path.join(root, 'objects'));
    const stored = await storage.putFile('workspace/assets/object', source, 'image/png');
    const id = '00000000-0000-4000-8000-000000000001';

    const [staged] = await new ObjectStorageAssetStager(storage).stage([{
      id,
      fileName: 'Dashboard.PNG',
      contentType: 'image/png',
      byteSize: stored.byteSize,
      checksum: stored.checksum,
      objectKey: stored.key,
    }], workspace);

    expect(staged?.relativePath).toBe(`./assets/${id}.png`);
  });
});
