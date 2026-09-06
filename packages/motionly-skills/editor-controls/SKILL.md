---
name: editor-controls
description: Make semantic Motionly layers selectable and compatible with website visual and animation controls.
---

# Website editor controls

Expose every user-meaningful visual or animated layer to the editor. Give the element a unique, descriptive, stable `data-edit` ID in `compositionHtml`. In `timelineJs`, query that element below `root`, verify it exists, then call `register(id, element)` with the exact same ID. Register semantic parent layers rather than anonymous decorative fragments; register a meaningful child separately when users should edit it independently.

## Supported visual overrides
The website editor directly overrides properties on registered elements (`data-motionly-id`):
- **Position (`x`, `y`)**: Translated via `element.style.translate` (e.g. `12px -8px`).
- **Scale (`scale`)**: Scaled via `element.style.scale` (e.g. `1.15`).
- **Rotation (`rotation`)**: Rotated via `element.style.rotate` (e.g. `12deg`).
- **Opacity / Capacity (`opacity`)**: Opacity via `element.style.opacity` (e.g. `0.85`).
- **Text content (`text`)**: Direct string content replacement.
- **Text Color (`color`)**: Foreground text color via `element.style.color`.
- **Background Color (`backgroundColor`)**: Surface background via `element.style.backgroundColor`.
- **SVG Fill & Stroke (`fill`, `stroke`)**: Vector colors via `element.style.fill` and `element.style.stroke`.
- **Font Size (`fontSize`)**: Text size via `element.style.fontSize` (in pixels).
- **Border Radius (`borderRadius`)**: Corner rounding via `element.style.borderRadius` (in pixels).
- **Visibility / Hidden (`hidden`)**: Element toggling via `element.hidden`.

## Supported animation overrides
- **Speed & Ease**: The editor queries `timeline.getTweensOf([element, ...element.querySelectorAll('*')])` and modifies tween `timeScale` and `ease`.
- Always author positive duration tweens directly targeting the registered element or its children so the editor can control their timing.

## Code example: HTML & Timeline with visual & animation controls

```html
<template>
  <style>
    .card-layer {
      position: absolute;
      left: 50%;
      top: 50%;
      translate: -50% -50%;
      width: 480px;
      padding: 32px;
      border-radius: 16px;
      background-color: #161922;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-sizing: border-box;
    }
    .card-title {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 12px;
      line-height: 1.25;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      color: #38bdf8;
      background-color: rgba(56, 189, 248, 0.15);
      margin-bottom: 16px;
    }
    .badge-icon {
      width: 16px;
      height: 16px;
      margin-right: 6px;
      fill: #38bdf8;
    }
  </style>

  <div class="stage">
    <!-- Card container layer: editable scale, background, opacity, borderRadius, translate -->
    <article class="card-layer" data-edit="feature-card">
      <!-- Badge: editable background, text color, fill -->
      <div class="badge" data-edit="feature-badge">
        <svg class="badge-icon" data-edit="badge-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
        </svg>
        <span>Active Feature</span>
      </div>

      <!-- Title: editable text, color, fontSize -->
      <h2 class="card-title" data-edit="feature-title">Fast, clear motion.</h2>
    </article>
  </div>
</template>
```

```js
export function buildTimeline({ root, timeline, register }) {
  const required = (selector) => {
    const el = root.querySelector(selector);
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) {
      throw new Error(`Missing required Motionly element: ${selector}`);
    }
    return el;
  };

  // Register layers for website visual and animation controls
  const card = register('feature-card', required('[data-edit="feature-card"]'));
  const badge = register('feature-badge', required('[data-edit="feature-badge"]'));
  const title = register('feature-title', required('[data-edit="feature-title"]'));

  // 1. Initial zero-time state
  timeline.set(card, {
    autoAlpha: 0,
    y: 36,
    scale: 0.92,
    transformOrigin: '50% 50%',
  }, 0);

  timeline.set([badge, title], {
    autoAlpha: 0,
    y: 16,
  }, 0);

  // 2. Card entrance with scale & opacity
  timeline.to(card, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    duration: 0.65,
    ease: 'power4.out',
  }, 0.15);

  // 3. Staggered inner content reveal
  timeline.to([badge, title], {
    autoAlpha: 1,
    y: 0,
    duration: 0.5,
    stagger: 0.12,
    ease: 'power3.out',
  }, 0.35);
}
```
