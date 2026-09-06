---
name: svg
description: Build editable inline SVG layers and animate them safely in Motionly.
---

# SVG Layers & Path Animation

Author editable inline SVGs with semantic structure, unique `data-edit` IDs, and vector-safe GSAP animations.

## Core Rules

1. **Inline Vector Structure**: Use inline `<svg viewBox="0 0 W H">` directly inside `compositionHtml`. Do not use external `.svg` files or canvas renders for vector graphics that need color or path animation.
2. **Editor Paint Compatibility**: Use semantic `fill` and `stroke` attributes or CSS variables on `<svg>` and `<path>` elements so the editor's fill/stroke overrides work directly.
3. **Registration**: Register the parent `<svg>` or semantic `<g data-edit="...">` layer via `register(id, element)`.
4. **Line Drawing & Morphing**: Animate `strokeDashoffset`, scale, rotation, and opacity on SVG elements using GSAP.

## Executable SVG Code Example

### Template (`compositionHtml`)

```html
<template>
  <style>
    .svg-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: #09090b;
    }
    .icon-wrapper {
      position: relative;
      width: 160px;
      height: 160px;
      margin-bottom: 24px;
    }
    .animated-icon {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .icon-halo {
      position: absolute;
      inset: -20px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.3) 0%, transparent 70%);
      pointer-events: none;
    }
  </style>
  <div class="svg-container">
    <div class="icon-wrapper" data-edit="icon-wrapper">
      <div class="icon-halo" data-edit="icon-halo"></div>
      <svg class="animated-icon" data-edit="logo-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Background circle path -->
        <circle cx="50" cy="50" r="44" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" data-edit="svg-circle" />
        <!-- Check / Spark path -->
        <path d="M30 50L44 64L72 36" stroke="#fafafa" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" data-edit="svg-check" />
      </svg>
    </div>
  </div>
</template>
```

### Timeline Animation (`timelineJs`)

```js
export function buildTimeline({ root, timeline, register }) {
  const get = (selector, id) => {
    const el = root.querySelector(selector);
    if (!el) throw new Error(`Missing required element: ${selector}`);
    if (id) register(id, el);
    return el;
  };

  const iconWrapper = get('[data-edit="icon-wrapper"]', 'icon-wrapper');
  const iconHalo = get('[data-edit="icon-halo"]', 'icon-halo');
  const logoSvg = get('[data-edit="logo-svg"]', 'logo-svg');
  const circle = get('[data-edit="svg-circle"]', 'svg-circle');
  const check = get('[data-edit="svg-check"]', 'svg-check');

  // SVG stroke lengths for drawing animation
  const circleLength = 2 * Math.PI * 44; // ~276.46
  const checkLength = 60; // approximate path length

  // Set initial stroke-dasharray and dashoffset
  circle.style.strokeDasharray = `${circleLength}`;
  check.style.strokeDasharray = `${checkLength}`;

  // Time 0: Initial states
  timeline.set([iconWrapper, logoSvg], { autoAlpha: 1, immediateRender: true }, 0);
  timeline.set(iconHalo, { autoAlpha: 0, scale: 0.5 }, 0);
  timeline.set(logoSvg, { scale: 0.8, rotation: -15, transformOrigin: "50% 50%" }, 0);
  timeline.set(circle, { strokeDashoffset: circleLength }, 0);
  timeline.set(check, { strokeDashoffset: checkLength }, 0);

  // Animate Circle Drawing (0.2s - 1.0s)
  timeline.to(circle, {
    strokeDashoffset: 0,
    duration: 0.8,
    ease: "power2.inOut",
  }, 0.2);

  // Scale Pop Icon & Reveal Halo (0.4s - 1.1s)
  timeline.to(logoSvg, {
    scale: 1,
    rotation: 0,
    duration: 0.7,
    ease: "back.out(1.6)",
  }, 0.4);

  timeline.to(iconHalo, {
    autoAlpha: 1,
    scale: 1.2,
    duration: 0.6,
    ease: "power2.out",
  }, 0.5);

  // Draw Check Mark (0.8s - 1.4s)
  timeline.to(check, {
    strokeDashoffset: 0,
    duration: 0.5,
    ease: "power3.out",
  }, 0.8);

  // Gentle floating pulse during hold (1.4s - 4.0s)
  timeline.to(iconWrapper, {
    y: -8,
    duration: 1.5,
    repeat: 1,
    yoyo: true,
    ease: "sine.inOut",
  }, 1.4);
}
```
