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

  it('accepts project dimensions without video export budgets', () => {
    expect(createGenerationRequestSchema.parse({
      prompt: 'Create a launch film', project: { name: 'Long', width: 1920, height: 1080, fps: 60, duration: 301 },
    })).toMatchObject({ project: { duration: 301 } });
  });

  it('allows the worker lifecycle and rejects illegal terminal transitions', () => {
    const path = [
      'QUEUED', 'PREPARING', 'GENERATING', 'VALIDATING', 'REPAIRING',
      'GENERATING', 'VALIDATING', 'PUBLISHING', 'COMPLETED',
    ] as const;
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionGeneration(path[index]!, path[index + 1]!)).toBe(true);
    }

    expect(isTerminalGenerationStatus('COMPLETED')).toBe(true);
    expect(isTerminalGenerationStatus('REPAIRING')).toBe(false);
    expect(() => assertGenerationTransition('COMPLETED', 'GENERATING')).toThrow(
      'Illegal generation transition: COMPLETED -> GENERATING',
    );
    expect(canTransitionGeneration('AWAITING_APPLY', 'PUBLISHING')).toBe(true);
    expect(canTransitionGeneration('AWAITING_APPLY', 'COMPLETED')).toBe(true);
    expect(canTransitionGeneration('GENERATING', 'REPAIRING')).toBe(true);
  });
});
