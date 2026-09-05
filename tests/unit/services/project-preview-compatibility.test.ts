import { describe, expect, it } from 'vitest';

import { bundleProjectPreview } from '../../../src/services/project-preview.service.js';
import { STARTER_SOURCE_FILES } from '../../../packages/motionly-runtime/starter.js';

describe('project preview compatibility', () => {
  it('resolves frontend-style Motionly runtime and preset imports', async () => {
    const files = {
      ...STARTER_SOURCE_FILES,
      'index.ts': STARTER_SOURCE_FILES['index.ts'].replace(
        "@motionly/runtime",
        "../../../composition/types",
      ),
      'timeline.js': [
        'import { morph } from "../../../composition/presets";',
        STARTER_SOURCE_FILES['timeline.js'],
      ].join('\n'),
    };

    const preview = await bundleProjectPreview(files);

    expect(preview.bundle).toContain('generated-composition');
  });

  it('ignores remote stylesheet imports without fetching the network', async () => {
    const files = {
      ...STARTER_SOURCE_FILES,
      'styles.css': '@import url("https://fonts.googleapis.com/css2?family=Inter");\n' + STARTER_SOURCE_FILES['styles.css'],
    };

    const preview = await bundleProjectPreview(files);

    expect(preview.styles).not.toContain('fonts.googleapis.com');
  });
});
