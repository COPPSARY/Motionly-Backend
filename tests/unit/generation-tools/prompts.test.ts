import { describe, expect, it } from 'vitest';

import { buildCompileRepairPrompt } from '../../../packages/generation-tools/src/prompts/repair-prompt.js';
import { buildMotionlySourceContext } from '../../../packages/generation-tools/src/prompts/source-context.js';
import { buildMotionlySystemPrompt } from '../../../packages/generation-tools/src/prompts/system-prompt.js';

describe('Motionly generation prompts', () => {
    it('uses explicit Bolt-inspired constraints and a patch-only workflow', () => {
        const prompt = buildMotionlySystemPrompt(['<skill id="typography">Use readable contrast.</skill>']);

        expect(prompt).toContain('<system_constraints>');
        expect(prompt).toContain('<project_source_rules>');
        expect(prompt).toContain('<patch_workflow>');
        expect(prompt).toContain('apply_project_patch');
        expect(prompt).toContain('Use readable contrast.');
        expect(prompt).toContain('Never use shell commands');
    });

    it('delimits the four canonical files as source data', () => {
        const context = buildMotionlySourceContext({
            'composition.html': '<main>Example</main>',
            'styles.css': '.stage { color: white; }',
            'timeline.js': 'export const timeline = {};',
            'index.ts': "import './styles.css';",
        });

        expect(context).toContain('<project_source>');
        expect(context).toContain('<file path="composition.html">');
        expect(context).toContain('<file path="styles.css">');
        expect(context).toContain('<file path="timeline.js">');
        expect(context).toContain('<file path="index.ts">');
        expect(context).toContain('<main>Example</main>');
    });

    it('asks for a localized repair using only compiler diagnostics', () => {
        const prompt = buildCompileRepairPrompt('timeline.js:12 Unexpected token');

        expect(prompt).toContain('<compile_diagnostics>');
        expect(prompt).toContain('timeline.js:12 Unexpected token');
        expect(prompt).toContain('localized patch');
    });
});
