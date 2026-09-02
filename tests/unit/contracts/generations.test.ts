import { describe, expect, it } from 'vitest';

import {
  assertGenerationTransition,
  canTransitionGeneration,
  createGenerationRequestSchema,
  editGenerationRequestSchema,
  isTerminalGenerationStatus,
} from '../../../packages/contracts/src/generations.js';

describe('generation contracts', () => {
  it('validates create and edit requests without provider-specific fields', () => {
    expect(createGenerationRequestSchema.parse({
      prompt: 'Create a launch film',
      project: { name: 'Launch', width: 1920, height: 1080, fps: 60, duration: 20 },
    })).toMatchObject({ presetId: 'motionly-product-promo', assetIds: [] });

    expect(editGenerationRequestSchema.parse({
      prompt: 'Improve the CTA',
      baseSourceHash: 'a'.repeat(64),
      baseRevision: 2,
    })).toMatchObject({ assetIds: [] });

    expect(() => editGenerationRequestSchema.parse({
      prompt: 'Improve the CTA',
      baseSourceHash: 'a'.repeat(64),
      baseRevision: 2,
      providerResponseId: 'must-not-leak',
    })).toThrow();
  });

  it('rejects create requests that exceed render pixel or frame budgets', () => {
    expect(() => createGenerationRequestSchema.parse({
      prompt: 'Create a launch film', project: { name: 'Huge', width: 16_384, height: 16_384, fps: 60, duration: 20 },
    })).toThrow('renderer safety limit');
    expect(() => createGenerationRequestSchema.parse({
      prompt: 'Create a launch film', project: { name: 'Long', width: 1920, height: 1080, fps: 60, duration: 301 },
    })).toThrow('18,000-frame export limit');
    expect(() => createGenerationRequestSchema.parse({
      prompt: 'Create a launch film', project: { name: 'Expensive', width: 3840, height: 2160, fps: 60, duration: 30 },
    })).toThrow('pixel-frame render budget');
  });

  it('allows the worker lifecycle and rejects illegal terminal transitions', () => {
    const path = [
      'QUEUED', 'PREPARING', 'GENERATING', 'VALIDATING', 'PUBLISHING', 'COMPLETED',
    ] as const;
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionGeneration(path[index]!, path[index + 1]!)).toBe(true);
    }

    expect(isTerminalGenerationStatus('COMPLETED')).toBe(true);
    expect(isTerminalGenerationStatus('GENERATING')).toBe(false);
    expect(() => assertGenerationTransition('COMPLETED', 'GENERATING')).toThrow(
      'Illegal generation transition: COMPLETED -> GENERATING',
    );
    expect(canTransitionGeneration('GENERATING', 'PUBLISHING')).toBe(false);
    expect(canTransitionGeneration('VALIDATING', 'COMPLETED')).toBe(false);
  });
});
