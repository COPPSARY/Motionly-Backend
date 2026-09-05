export interface StoredObject {
  key: string;
  byteSize: number;
  checksum: string;
  contentType: string;
}

export interface PrivateObjectStorage {
  putFile(key: string, sourcePath: string, contentType: string): Promise<StoredObject>;
  putBuffer(key: string, content: Buffer, contentType: string): Promise<StoredObject>;
  putStream(key: string, content: Readable, contentType: string, maxBytes: number): Promise<StoredObject>;
  resolvePath(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}
import type { Readable } from 'node:stream';
