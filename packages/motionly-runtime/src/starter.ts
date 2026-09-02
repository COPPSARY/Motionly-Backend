export const MOTIONLY_RUNTIME_VERSION = '2.0.0';
export const MOTIONLY_SKILL_BUNDLE_VERSION = '1.0.0';

export interface StarterProjectSettings {
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
}

export function createStarterSource(settings: StarterProjectSettings) {
  const title = JSON.stringify(settings.name);
  const duration = Number(settings.duration);
  return {
  'composition.html': `<template id="motionly-template">
  <style>
    .motionly-stage { position: relative; width: 100%; height: 100%; overflow: hidden; background: #080b14; }
  </style>
  <main class="motionly-stage" data-edit="stage"></main>
</template>`,
  'styles.css': '',
  'timeline.js': `export function buildTimeline({ root, timeline, register }) {
  const stage = root.querySelector("[data-edit='stage']");
  if (!stage) throw new Error('Starter stage was not found.');
  register('stage', stage);
}`,
  'index.ts': `import { defineComposition, type CompositionContext } from '@motionly/runtime';
import compositionHtml from './composition.html?raw';
import { buildTimeline } from './timeline.js';

function mount(context: CompositionContext) {
  const documentNode = new DOMParser().parseFromString(compositionHtml, 'text/html');
  const template = documentNode.querySelector<HTMLTemplateElement>('#motionly-template');
  if (!template) throw new Error('Motionly template was not found.');
  context.root.replaceChildren(template.content.cloneNode(true));
}

export default defineComposition({
  id: 'generated-composition',
  title: ${title},
  description: 'Blank Motionly cloud generation starter',
  width: ${settings.width},
  height: ${settings.height},
  fps: ${settings.fps},
  duration: ${duration},
  scenes: [{ id: 'main', label: 'Main', start: 0, duration: ${duration}, accent: '#7657ff', tracks: [{ id: 'stage', label: 'Stage', kind: 'Background', start: 0, end: ${duration} }] }],
  sourcePreview: compositionHtml,
  build(context) { mount(context); buildTimeline(context); },
});`,
  };
}

export const STARTER_SOURCE_FILES = createStarterSource({
  name: 'Generated composition', width: 1920, height: 1080, fps: 60, duration: 5,
});
