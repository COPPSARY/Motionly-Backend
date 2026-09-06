---
name: core
description: Apply the core code-first Motionly composition and runtime rules to every generation.
---

# Motionly generation core

Return the complete schema-constrained project. `compositionHtml` contains exactly one top-level `<template>` with semantic HTML/SVG and one embedded, composition-scoped `<style>` element. `timelineJs` exports exactly `export function buildTimeline({ root, timeline, register })`. Do not produce separate source files, scripts, imports, dependencies, generated DOM, a JSON animation DSL, a conversion layer, or a second renderer.

## Canonical contract

### `compositionHtml`

```html
<template>
  <style>
    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0b0f19;
      color: #f8fafc;
      font-family: system-ui, sans-serif;
    }
    .headline {
      font-size: 48px;
      font-weight: 700;
      letter-spacing: -0.02em;
      opacity: 0;
      transform: translateY(16px);
    }
  </style>

  <div class="stage" data-edit="stage">
    <h1 class="headline" data-edit="headline">Instant clarity</h1>
  </div>
</template>
```

### `timelineJs`

```js
export function buildTimeline({ root, timeline, register }) {
  const stage = register('stage', root.querySelector('[data-edit="stage"]'));
  const headline = register('headline', root.querySelector('[data-edit="headline"]'));

  timeline.set([stage, headline], { transformOrigin: '50% 50%' }, 0);

  timeline.fromTo(
    headline,
    { autoAlpha: 0, y: 16 },
    { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' },
    0.2,
  );

  timeline.to(
    headline,
    { autoAlpha: 0, y: -12, duration: 0.45, ease: 'power2.in' },
    2.4,
  );
}
```

## Rules

1. Query every target under `root`, fail clearly when a required target is absent, and add all motion to the provided caller-owned `timeline`.
2. Give every meaningful editable or animated layer a unique stable `data-edit` ID, then register that same ID: `register(id, element)`.
3. Give each scene an arrival, active transformation, readable hold, and resolve.
4. Preserve supplied copy and aspect ratios. Use one focal subject per shot.
5. Initialize hidden and transformed states deterministically at time zero (`timeline.set(...)` at position `0`).
6. Keep playback seek-safe, resolve outgoing layers, and preserve preview/export parity.
