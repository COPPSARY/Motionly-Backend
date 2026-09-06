---
name: timeline
description: Choreograph explicit, readable GSAP timing and truthful Motionly scene metadata.
---

# Timeline & Scene Choreography

Choreograph motion with explicit timeline positions in seconds. Keep scene starts, durations, and track bounds strictly aligned with authored GSAP operations.

## Core Rules

1. **Deterministic Time-Zero**: Initialize all hidden, transformed, and layered initial values on the provided `timeline` at `0` using `immediateRender: true`.
2. **Explicit Positions**: Use absolute second timestamps (e.g., `0.4`, `1.8`, `3.2`) or explicit relative offsets (`"<0.15"`, `"+=0.2"`). Never rely on default sequential accumulation without explicit timing.
3. **Readable Holds**: Hold completed statements and product states for at least `1.2s - 2.0s` so the viewer can absorb the message before departures begin.
4. **Handoff Overlaps**: Overlap scene exits and entrances by `0.2s - 0.4s` to maintain momentum without competing for focal attention.
5. **No Detached Timelines**: Add all animations directly to the caller-owned `timeline` passed to `buildTimeline({ root, timeline, register })`. Never create an unattached `gsap.timeline()`.

## Executable Scene & Timeline Code Pattern

### HTML Structure with Scene & Track Semantics (`compositionHtml`)

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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .scene-1, .scene-2 {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
    }
    .hero-title {
      font-size: 56px;
      font-weight: 800;
      line-height: 1.1;
      text-align: center;
      margin-bottom: 24px;
    }
    .hero-badge {
      padding: 8px 16px;
      border-radius: 9999px;
      background: #3b82f6;
      color: #ffffff;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .feature-card {
      width: 540px;
      padding: 32px;
      border-radius: 16px;
      background: #18181b;
      border: 1px solid #27272a;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
  </style>
  <div class="stage">
    <!-- Scene 1: Hook / Intro (0.0s - 2.5s) -->
    <div class="scene-1" data-edit="scene-1">
      <div class="hero-badge" data-edit="hero-badge">Announcing v2.0</div>
      <h1 class="hero-title" data-edit="hero-title">Automate your motion graphics.</h1>
    </div>

    <!-- Scene 2: Feature Proof & CTA (2.2s - 5.0s) -->
    <div class="scene-2" data-edit="scene-2">
      <div class="feature-card" data-edit="feature-card">
        <h2>10x Faster Export</h2>
        <p>Programmatic rendering powered by code.</p>
      </div>
    </div>
  </div>
</template>
```

### Timeline Choreography (`timelineJs`)

```js
export function buildTimeline({ root, timeline, register }) {
  const get = (selector, id) => {
    const el = root.querySelector(selector);
    if (!el) throw new Error(`Missing required element: ${selector}`);
    if (id) register(id, el);
    return el;
  };

  const scene1 = get('[data-edit="scene-1"]', 'scene-1');
  const badge = get('[data-edit="hero-badge"]', 'hero-badge');
  const title = get('[data-edit="hero-title"]', 'hero-title');
  const scene2 = get('[data-edit="scene-2"]', 'scene-2');
  const card = get('[data-edit="feature-card"]', 'feature-card');

  // Time 0: Deterministic initial states
  timeline.set([scene1, scene2], { autoAlpha: 1, immediateRender: true }, 0);
  timeline.set([badge, title], { autoAlpha: 0, y: 30 }, 0);
  timeline.set(scene2, { autoAlpha: 0 }, 0);
  timeline.set(card, { autoAlpha: 0, scale: 0.9, y: 40 }, 0);

  // --- SCENE 1: Hook (0.0s - 2.5s) ---
  // Entrance: 0.2s - 1.0s
  timeline.to(badge, {
    autoAlpha: 1,
    y: 0,
    duration: 0.6,
    ease: "back.out(1.5)",
  }, 0.2);

  timeline.to(title, {
    autoAlpha: 1,
    y: 0,
    duration: 0.75,
    ease: "power3.out",
  }, 0.4);

  // Readable Hold: 1.0s - 2.1s (1.1s of quiet focus)

  // Exit / Scene Transition: 2.1s - 2.5s
  timeline.to(scene1, {
    autoAlpha: 0,
    y: -30,
    scale: 0.98,
    duration: 0.45,
    ease: "power2.inOut",
  }, 2.1);

  // --- SCENE 2: Proof & Feature (2.3s - 5.0s, overlapping handoff at 2.3s) ---
  // Entrance
  timeline.to(scene2, {
    autoAlpha: 1,
    duration: 0.3,
    ease: "power1.out",
  }, 2.3);

  timeline.to(card, {
    autoAlpha: 1,
    scale: 1,
    y: 0,
    duration: 0.7,
    ease: "back.out(1.4)",
  }, 2.4);

  // Readable Hold: 3.1s - 5.0s (holds card in focus until end of composition)
}
```

## Timing Checklist

- [ ] All elements have initial properties set at `0` with `immediateRender: true`.
- [ ] Entrances last 0.45s - 0.8s with smooth deceleration eases (`power3.out`, `back.out(1.4)`).
- [ ] Every message beat has at least 1.2s of undisturbed reading hold.
- [ ] Scene exits start before scene entrances finish, creating seamless overlapping continuity.
