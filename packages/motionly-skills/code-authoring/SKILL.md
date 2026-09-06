---
name: code-authoring
description: Author safe website-compatible Motionly compositionHtml and timelineJs source.
---

# Code authoring

`compositionHtml` contains exactly one top-level `<template>`. Put semantic markup, inline SVG, and one composition-scoped `<style>` element inside it. Do not add `<script>` elements, event-handler attributes, remote fonts, remote styles, or remote media URLs.

`timelineJs` exports exactly `export function buildTimeline({ root, timeline, register })`. It is import-free. Query only inside `root`; use a small query helper that throws when a required selector is missing. Register each meaningful layer with the same stable ID as its `data-edit` attribute, only after the element is found. Add all animation to the supplied `timeline`; do not create another playback controller or access the global document.

Keep source deterministic and free of dynamic imports, network/navigation APIs, cookies, browser storage, credential access, cross-window messaging, dynamic scripts, filesystem APIs, and child processes. Use only asset references supplied in the generation context. Return the full schema-constrained project rather than extra source files.

## Complete source pattern

Use this shape as the minimum working reference. Adapt names, visuals, copy, and timing; preserve the source architecture.

### compositionHtml

```html
<template>
  <style>
    .motionly-stage {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #0b1020;
      color: #f8fafc;
      font-family: Inter, Arial, sans-serif;
    }
    .motionly-scene {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 8%;
    }
    .motionly-headline {
      margin: 0;
      max-width: 14ch;
      font-size: clamp(64px, 8vw, 152px);
      line-height: 0.92;
      text-align: center;
    }
    .motionly-card {
      width: min(70%, 960px);
      padding: 48px;
      border-radius: 32px;
      background: #7c3aed;
      font-size: 48px;
      text-align: center;
    }
  </style>
  <main class="motionly-stage" data-edit="stage">
    <section class="motionly-scene" data-edit="intro-scene">
      <h1 class="motionly-headline" data-edit="headline">Ideas in motion.</h1>
    </section>
    <section class="motionly-scene" data-edit="proof-scene">
      <div class="motionly-card" data-edit="proof-card">Built to move with purpose.</div>
    </section>
  </main>
</template>
```

### timelineJs

```js
export function buildTimeline({ root, timeline, register }) {
  const required = (selector) => {
    const element = root.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`Missing Motionly element: ${selector}`);
    }
    return element;
  };

  const stage = register('stage', required('[data-edit="stage"]'));
  const intro = register('intro-scene', required('[data-edit="intro-scene"]'));
  const headline = register('headline', required('[data-edit="headline"]'));
  const proof = register('proof-scene', required('[data-edit="proof-scene"]'));
  const card = register('proof-card', required('[data-edit="proof-card"]'));

  timeline.set(stage, { autoAlpha: 1 }, 0);
  timeline.set(intro, { autoAlpha: 1 }, 0);
  timeline.set(headline, {
    autoAlpha: 0,
    y: 72,
    scale: 0.88,
    rotation: -3,
    transformOrigin: '50% 50%',
  }, 0);
  timeline.set(proof, { autoAlpha: 0, xPercent: 100 }, 0);
  timeline.set(card, {
    autoAlpha: 1,
    scale: 0.92,
    transformOrigin: '50% 50%',
  }, 0);

  timeline.to(headline, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    rotation: 0,
    duration: 0.72,
    ease: 'power4.out',
  }, 0.15);
  timeline.to(headline, {
    scale: 1.04,
    duration: 0.8,
    ease: 'sine.inOut',
  }, 1.15);
  timeline.to(headline, {
    scale: 1,
    duration: 0.55,
    ease: 'sine.inOut',
  }, 1.95);

  timeline.set(proof, { autoAlpha: 1 }, 2.4);
  timeline.to(intro, {
    xPercent: -18,
    scale: 1.04,
    autoAlpha: 0,
    duration: 0.8,
    ease: 'power3.inOut',
  }, 2.4);
  timeline.to(proof, {
    xPercent: 0,
    duration: 0.8,
    ease: 'power3.inOut',
  }, 2.4);
  timeline.to(card, {
    scale: 1,
    duration: 0.65,
    ease: 'back.out(1.25)',
  }, 2.55);
  timeline.to(card, {
    autoAlpha: 0,
    y: -40,
    duration: 0.5,
    ease: 'power3.in',
  }, 4.6);

  return timeline;
}
```

Keep scene metadata synchronized with these positions. For this example, an intro scene could span `0-3.2` seconds and a proof scene `2.4-5.1` seconds within a `5.1` second project.