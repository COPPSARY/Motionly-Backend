import { describe, expect, it } from 'vitest';

import { assertRepresentativeFrames, representativeTimes } from '../../../apps/renderer/src/browser.js';

const definition = {
  width: 1920,
  height: 1080,
  fps: 10,
  duration: 10,
  scenes: Array.from({ length: 10 }, (_, index) => ({ start: index, duration: 1 })),
};

describe('representative frame selection', () => {
  it('stratifies scene midpoints and always keeps the final frame within the cap', () => {
    const times = representativeTimes(definition, 6);

    expect(times).toHaveLength(6);
    expect(times.at(-1)).toBe(9.9);
    expect(times.some((time) => time < 1)).toBe(true);
    expect(times.some((time) => time > 8)).toBe(true);
    expect(times.filter((time) => Math.abs(time % 1 - 0.5) < 0.001)).toHaveLength(5);
  });

  it('rejects missing midpoint coverage and blank final frames', () => {
    const times = representativeTimes(definition, 6);
    const visible = times.map((time) => ({ time, visibleEditableIds: ['layer'] }));
    expect(() => assertRepresentativeFrames(definition, visible, 6)).not.toThrow();
    expect(() => assertRepresentativeFrames(definition, visible.slice(1), 6)).toThrow('midpoint coverage');
    expect(() => assertRepresentativeFrames(definition, visible.map((frame) => frame.time === 9.9 ? { ...frame, visibleEditableIds: [] } : frame), 6)).toThrow('blank');
  });
});
