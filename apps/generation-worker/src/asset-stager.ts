import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { PrivateObjectStorage } from '../../../packages/object-storage/src/types.js';
import { inspectFileIntegrity } from '../../../packages/object-storage/src/file-integrity.js';

export interface GenerationAsset {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  checksum: string;
  objectKey: string;
}

export interface StagedAsset {
  id: string;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  checksum: string;
  relativePath: string;
}

export interface AssetStager {
  stage(assets: GenerationAsset[], workspacePath: string): Promise<StagedAsset[]>;
}

export class ObjectStorageAssetStager implements AssetStager {
  constructor(private readonly storage: PrivateObjectStorage) {}

  async stage(assets: GenerationAsset[], workspacePath: string) {
    const directory = path.join(workspacePath, 'assets');
    await mkdir(directory, { recursive: true });
    const staged: StagedAsset[] = [];
    for (const asset of assets) {
      const extension = safeExtension(asset.fileName);
      const fileName = `${asset.id}${extension}`;
      const destination = path.join(directory, fileName);
      await copyFile(await this.storage.resolvePath(asset.objectKey), destination);
      const integrity = await inspectFileIntegrity(destination);
      if (integrity.byteSize !== asset.byteSize || integrity.checksum !== asset.checksum) {
        throw new Error(`Staged asset failed integrity validation: ${asset.id}`);
      }
      staged.push({
        id: asset.id,
        originalFileName: asset.fileName,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        checksum: asset.checksum,
        relativePath: `./assets/${fileName}`,
      });
    }
    return staged;
  }
}

function safeExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
}
