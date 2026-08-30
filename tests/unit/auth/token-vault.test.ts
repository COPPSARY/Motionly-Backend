import { describe, expect, it } from 'vitest';

import { TokenVault } from '../../../packages/auth/src/token-vault.js';

describe('TokenVault', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('encrypts and decrypts token payloads', () => {
    const vault = new TokenVault(key);
    const encrypted = vault.encrypt('refresh-token');

    expect(encrypted).not.toContain('refresh-token');
    expect(vault.decrypt(encrypted)).toBe('refresh-token');
  });

  it('rejects tampered ciphertext', () => {
    const vault = new TokenVault(key);
    const encrypted = vault.encrypt('refresh-token');
    const parts = encrypted.split('.');
    const ciphertext = Buffer.from(parts[3]!, 'base64url');
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString('base64url');
    const tampered = parts.join('.');

    expect(() => vault.decrypt(tampered)).toThrow();
  });
});
