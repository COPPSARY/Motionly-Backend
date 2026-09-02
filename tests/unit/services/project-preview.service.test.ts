import { describe, expect, it } from 'vitest';

import { bundleProjectPreview } from '../../../apps/api/src/services/project-preview.service.js';
import type { ProjectSourceFiles } from '../../../apps/api/src/services/project.service.js';

function projectFiles(overrides: Partial<ProjectSourceFiles> = {}): ProjectSourceFiles {
  return {
    'composition.html': '<template id="motionly-promo-template"><main data-edit="stage">Promo</main></template>',
    'styles.css': 'main { color: white; }',
    'timeline.js': `
import { ambientWaves, blurReveal, charSpringBounce, continuousTextGradient, gradientSweep, morph, textReveal, wordSlideRotate } from "../../../composition/presets";
import { MOTIONLY_PROMO_TIME_SCALE } from "./timing";
export function buildPromoTimeline(context) {
  const element = context.root.querySelector('[data-edit="stage"]');
  ambientWaves(context.timeline, [element]);
  blurReveal(context.timeline, element);
  charSpringBounce(context.timeline, element);
  continuousTextGradient(element);
  gradientSweep(context.timeline, element);
  morph(context.timeline, element, { opacity: 1 });
  textReveal(context.timeline, element);
  wordSlideRotate(context.timeline, element);
  context.timeline.timeScale(MOTIONLY_PROMO_TIME_SCALE);
}`,
    'index.ts': `
import { defineComposition, type CompositionContext } from "../../../composition/types";
import compositionHtml from "./composition.html?raw";
import logoUrl from "./logo.svg?url";
import uiScreenshotUrl from "./ui-screenshot.png?url";
import { buildPromoTimeline } from "./timeline.js";
import { MOTIONLY_PROMO_DURATION } from "./timing";
export const motionlyPromoPreset = defineComposition({
  id: 'legacy-promo', title: 'Legacy promo', description: logoUrl + uiScreenshotUrl,
  width: 1920, height: 1080, fps: 60, duration: MOTIONLY_PROMO_DURATION,
  scenes: [{ id: 'main', label: 'Main', start: 0, duration: MOTIONLY_PROMO_DURATION, accent: '#7657ff' }],
  sourcePreview: compositionHtml,
  build(context: CompositionContext) { buildPromoTimeline(context); },
});`,
    ...overrides,
  };
}

describe('project preview bundling', () => {
  it('bundles the legacy built-in promo imports through explicit compatibility modules', async () => {
    const preview = await bundleProjectPreview(projectFiles());

    expect(preview.bundle).toContain('__MOTIONLY_BUILTIN_ASSET_LOGO__');
    expect(preview.bundle).toContain('__MOTIONLY_BUILTIN_ASSET_UI_SCREENSHOT__');
    expect(preview.bundle).toMatch(/export\s*\{[^}]*default/);
    expect(preview.bundle).not.toContain('../../../composition/presets');
  });

  it('continues to reject unapproved project imports', async () => {
    await expect(bundleProjectPreview(projectFiles({
      'timeline.js': 'import value from "./private-module"; export function buildPromoTimeline() { return value; }',
    }))).rejects.toThrow('Unsupported project preview import: ./private-module');
  });
});
