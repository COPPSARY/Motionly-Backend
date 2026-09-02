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
    .motionly-stage { position: relative; width: 100%; height: 100%; overflow: hidden; background: #080b14; color: #f8fafc; font-family: Inter, sans-serif; }
    .motionly-title { position: absolute; left: 50%; top: 50%; margin: 0; font-size: 96px; line-height: 1; transform: translate(-50%, -50%); text-align: center; }
  </style>
  <main class="motionly-stage" data-edit="stage">
    <h1 class="motionly-title" data-edit="title">Make your product move.</h1>
  </main>
</template>`,
  'styles.css': '',
  'timeline.js': `export function buildTimeline({ root, timeline, register }) {
  const title = root.querySelector("[data-edit='title']");
  const stage = root.querySelector("[data-edit='stage']");
  if (!stage) throw new Error('Starter stage was not found.');
  if (!title) throw new Error('Starter title was not found.');
  register('stage', stage);
  register('title', title);
  timeline.fromTo(title, { opacity: 0, scale: 1.35 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'power4.out' }, 0);
  timeline.to(title, { scale: 1.03, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0.8);
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
  description: 'Motionly cloud generation starter',
  width: ${settings.width},
  height: ${settings.height},
  fps: ${settings.fps},
  duration: ${duration},
  scenes: [{ id: 'main', label: 'Main', start: 0, duration: ${duration}, accent: '#7657ff', tracks: [{ id: 'title', label: 'Title', kind: 'Text', start: 0, end: ${duration} }] }],
  sourcePreview: compositionHtml,
  build(context) { mount(context); buildTimeline(context); },
});`,
  };
}

export const STARTER_SOURCE_FILES = createStarterSource({
  name: 'Generated composition', width: 1920, height: 1080, fps: 60, duration: 5,
});
