import { describe, expect, it } from 'vitest';

import { compileMotionlySource } from '../../../packages/generation-tools/src/source-compiler.js';
import { STARTER_SOURCE_FILES } from '../../../packages/motionly-runtime/src/starter.js';

describe('compileMotionlySource', () => {
    it('compiles the canonical Motionly source bundle', async () => {
        await expect(compileMotionlySource({ ...STARTER_SOURCE_FILES })).resolves.toEqual({ valid: true });
    });

    it('returns bounded diagnostics when source cannot compile', async () => {
        const result = await compileMotionlySource({ ...STARTER_SOURCE_FILES, 'index.ts': 'export default {' });

        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.diagnostics).not.toBe('');
            expect(result.diagnostics).not.toContain('motionly-compile-');
        }
    });
});
