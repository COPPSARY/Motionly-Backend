---
name: transitions
description: Create continuous Motionly scene handoffs with morphs, match-cuts, or particles.
---

# Transitions

Maintain visible ownership across scene boundaries with a morph, match-cut, or meaningful particle reassembly. Opacity may clean up internal faces only after continuity exists; a fade, hard cut, wipe, or fade-to-black cannot be the primary handoff.

Prefer a persistent carrier whose geometry and role evolve: statement frame to symbolic object to prompt surface to product window to brand token. Align silhouette, position, dimensions, and motion before a match-cut.

## Scene handoff code example

```html
<template>
  <style>
    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #09090b;
      color: #fafafa;
      font-family: system-ui, sans-serif;
    }
    .scene-a, .scene-b {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .title {
      font-size: 44px;
      font-weight: 700;
    }
  </style>

  <div class="stage" data-edit="stage">
    <div class="scene-a" data-edit="scene-one">
      <h1 class="title" data-edit="title-one">First Chapter</h1>
    </div>
    <div class="scene-b" data-edit="scene-two">
      <h1 class="title" data-edit="title-two">Next Destination</h1>
    </div>
  </div>
</template>
```

```js
export function buildTimeline({ root, timeline, register }) {
  const sceneA = register('scene-one', root.querySelector('[data-edit="scene-one"]'));
  const titleA = register('title-one', root.querySelector('[data-edit="title-one"]'));
  const sceneB = register('scene-two', root.querySelector('[data-edit="scene-two"]'));
  const titleB = register('title-two', root.querySelector('[data-edit="title-two"]'));

  // Zero-time baseline
  timeline.set([sceneA, titleA, sceneB, titleB], { transformOrigin: '50% 50%' }, 0);
  timeline.set(sceneB, { autoAlpha: 0, x: 80 }, 0);

  // Scene 1 Entrance & Hold
  timeline.fromTo(titleA, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.2);

  // Continuous Overlapping Handoff at 2.4s
  timeline.to(sceneA, { autoAlpha: 0, x: -80, duration: 0.55, ease: 'power2.in' }, 2.4);
  timeline.to(sceneB, { autoAlpha: 1, x: 0, duration: 0.65, ease: 'power3.out' }, 2.5);
  timeline.fromTo(titleB, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.55, ease: 'back.out(1.2)' }, 2.65);
}
```
