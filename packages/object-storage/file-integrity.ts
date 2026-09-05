import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function inspectFileIntegrity(filePath: string) {
  const hash = createHash('sha256');
  let byteSize = 0;
  for await (const chunk of createReadStream(filePath)) {
    const bytes = chunk as Buffer;
    byteSize += bytes.byteLength;
    hash.update(bytes);
  }
  return { byteSize, checksum: hash.digest('hex') };
}
