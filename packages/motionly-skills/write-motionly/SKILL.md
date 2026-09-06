---
name: write-motionly
description: Create and edit code-first Motionly product films with semantic HTML, scoped CSS, and timeline animation.
---

# Write Motionly compositions

Build a directed product film, not decorated slides. Every visual change should explain, intensify, or resolve the current thought.

## Source architecture

- Return the complete project fields, including `compositionHtml` and `timelineJs`.
- Put exactly one top-level `<template>` in `compositionHtml`; keep all semantic HTML/SVG and composition-scoped CSS in that template.
- In `timelineJs`, export exactly `buildTimeline({ root, timeline, register })`, query only below `root`, and add all animation to the provided timeline.
- Use unique stable `data-edit` IDs and register important editable or animated elements with the same IDs.
- Do not emit extra files, imports, dependencies, scripts, remote resources, generated DOM, a JSON animation DSL, or another renderer.

## Story structure & code pattern

A high-converting motion composition follows a progression: **Hook -> Proof / Product Turn -> Resolution / Call to Action**.

### Complete template example (`compositionHtml`)

```html
<template>
  <style>
    .viewport {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: radial-gradient(circle at 50% 30%, #1e1b4b 0%, #09090b 100%);
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .carrier {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      max-width: 900px;
      padding: 40px;
    }
    .badge {
      display: inline-flex;
      padding: 8px 18px;
      border-radius: 9999px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(129, 140, 248, 0.35);
      color: #a5b4fc;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 24px;
    }
    .headline {
      font-size: 56px;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.02em;
      margin: 0 0 20px 0;
    }
    .headline span {
      background: linear-gradient(135deg, #a5b4fc 0%, #38bdf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .product-card {
      position: relative;
      width: 680px;
      height: 240px;
      background: rgba(24, 24, 27, 0.85);
      border: 1px solid rgba(63, 63, 70, 0.6);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      margin-top: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .metric {
      font-size: 64px;
      font-weight: 900;
      color: #38bdf8;
    }
    .cta-button {
      margin-top: 28px;
      padding: 16px 36px;
      background: #6366f1;
      color: #ffffff;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(99, 102, 241, 0.4);
    }
  </style>
  <div class="viewport">
    <div class="carrier" data-edit="carrier">
      <div class="badge" data-edit="badge">Next-Gen Speed</div>
      <h1 class="headline" data-edit="headline">Ship animations in <span>seconds</span>.</h1>
      <div class="product-card" data-edit="product-card">
        <div class="metric" data-edit="metric">10x Faster</div>
      </div>
      <div class="cta-button" data-edit="cta">Start Creating</div>
    </div>
  </div>
</template>
```

### Complete timeline implementation (`timelineJs`)

```js
export function buildTimeline({ root, timeline, register }) {
  const get = (selector, id) => {
    const el = root.querySelector(selector);
    if (!el) throw new Error(`Missing required element: ${selector}`);
    if (id) register(id, el);
    return el;
  };

  const carrier = get('[data-edit="carrier"]', 'carrier');
  const badge = get('[data-edit="badge"]', 'badge');
  const headline = get('[data-edit="headline"]', 'headline');
  const productCard = get('[data-edit="product-card"]', 'product-card');
  const metric = get('[data-edit="metric"]', 'metric');
  const cta = get('[data-edit="cta"]', 'cta');

  // Time 0: deterministic initial state
  timeline.set([badge, headline, productCard, cta], {
    autoAlpha: 0,
    immediateRender: true,
  }, 0);
  timeline.set(badge, { y: 20 }, 0);
  timeline.set(headline, { y: 30, scale: 0.96 }, 0);
  timeline.set(productCard, { y: 40, scale: 0.9 }, 0);
  timeline.set(metric, { scale: 0.8, autoAlpha: 0 }, 0);
  timeline.set(cta, { scale: 0.9, autoAlpha: 0 }, 0);

  // Beat 1: Hook entrance (0.2s - 1.8s)
  timeline.to(badge, {
    autoAlpha: 1,
    y: 0,
    duration: 0.6,
    ease: "back.out(1.4)",
  }, 0.2);

  timeline.to(headline, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    duration: 0.8,
    ease: "power3.out",
  }, 0.45);

  // Beat 2: Product proof reveal (1.8s - 3.4s)
  timeline.to(productCard, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    duration: 0.75,
    ease: "power3.out",
  }, 1.8);

  timeline.to(metric, {
    autoAlpha: 1,
    scale: 1,
    duration: 0.6,
    ease: "back.out(1.7)",
  }, 2.1);

  // Subtle ambient camera drift during hold (1.0s - 4.5s)
  timeline.to(carrier, {
    scale: 1.03,
    duration: 3.5,
    ease: "sine.inOut",
  }, 1.0);

  // Beat 3: Resolution & CTA (3.4s - 5.0s)
  timeline.to(cta, {
    autoAlpha: 1,
    scale: 1,
    duration: 0.65,
    ease: "back.out(1.5)",
  }, 3.4);

  // Final hold before loop / completion
}
```

## Motion and determinism rules

- Set every hidden, transformed, and layered initial state at time zero using `timeline.set(..., { immediateRender: true }, 0)`.
- Use tactile easing (`back.out(1.4)`, `power3.out`, `expo.out`) for UI cards and text.
- Give each beat an arrival, settle, readable hold, and departure.
- Keep scene metadata truthful to timeline positions and total duration.
