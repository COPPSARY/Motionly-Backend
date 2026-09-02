import { describe, expect, it } from 'vitest';

import { projectSettingsFromValidation } from '../../../packages/generation-tools/src/validation-report.js';

describe('generation validation metadata', () => {
  it('extracts the browser-validated project settings used during publication', () => {
    expect(projectSettingsFromValidation({
      runtime: { runtime: { definition: { width: 1080, height: 1920, fps: 30, duration: 12 } } },
    })).toEqual({ width: 1080, height: 1920, fps: 30, duration: 12 });
  });

  it('rejects incomplete reports instead of publishing stale project metadata', () => {
    expect(() => projectSettingsFromValidation({ runtime: {} })).toThrow('missing runtime metadata');
  });
});
