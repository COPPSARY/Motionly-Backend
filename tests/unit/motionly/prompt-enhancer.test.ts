import { describe, expect, it } from 'vitest';

import { enhanceMotionlyPrompt } from '../../../packages/motionly-skills/src/prompt-enhancer.js';

describe('Motionly prompt enhancer', () => {
  it('adds the SaaS film structure without changing the original request', () => {
    const enhanced = enhanceMotionlyPrompt('Launch our analytics app with this headline.', 'CREATE');

    expect(enhanced).toContain('Original user request:\nLaunch our analytics app with this headline.');
    expect(enhanced).toContain('3-6 connected beats');
    expect(enhanced).toContain('giant-to-readable zoom or slide entrances');
    expect(enhanced).toContain('shape morph or match-cut');
  });

  it('keeps edits focused on the existing composition', () => {
    const enhanced = enhanceMotionlyPrompt('Make the headline yellow.', 'EDIT');

    expect(enhanced).toContain('Original user request:\nMake the headline yellow.');
    expect(enhanced).toContain('preserving the existing visual language');
    expect(enhanced).not.toContain('Build 3-6 connected beats');
  });
});
