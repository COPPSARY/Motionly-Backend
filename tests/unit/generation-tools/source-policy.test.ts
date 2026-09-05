import { describe, expect, it } from 'vitest';

import { validateMotionlySource } from '../../../packages/generation-tools/source-policy.js';
import { STARTER_SOURCE_FILES } from '../../../packages/motionly-runtime/starter.js';

describe('Motionly source policy', () => {
  it('reports registered and editable layers from source files', () => {
    const report = validateMotionlySource({ ...STARTER_SOURCE_FILES });

    expect(report.valid).toBe(true);
    expect(report.registeredIds).toContain('stage');
    expect(report.editableIds).toContain('stage');
  });
});
