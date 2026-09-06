---
name: typography
description: Direct readable full-sentence kinetic typography in Motionly compositions.
---

# Typography

Express each editorial beat as one bold full-sentence thought. Center the thought as one unit and preserve natural spaces and punctuation. Important statements may enter giant/cropped and settle into focus. Animate words or characters in reading order with restrained stagger and a tactile settle.

Apply one continuous gradient across a sentence rather than restarting it on every word. Keep contrast high, prevent clipping/reflow, and provide a real reading hold before departure.

## Split-word kinetic reveal example

```html
<template>
  <div class="stage">
    <h1 class="headline" data-edit="hero-heading">
      <span class="word">Motion</span>
      <span class="word">graphics</span>
      <span class="word">built</span>
      <span class="word accent">like</span>
      <span class="word accent">code.</span>
    </h1>
  </div>
  <style>
    .stage {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: #090d16;
      color: #f8fafc;
      font-family: Inter, system-ui, sans-serif;
    }
    .headline {
      margin: 0;
      font-size: 64px;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      text-align: center;
      max-width: 900px;
    }
    .word {
      display: inline-block;
      margin: 0 6px;
      will-change: transform, opacity, filter;
    }
    .word.accent {
      color: #38bdf8;
    }
  </style>
</template>
```

```js
export function buildTimeline({ root, timeline, register }) {
  const heading = root.querySelector('[data-edit="hero-heading"]');
  if (!(heading instanceof HTMLElement)) {
    throw new Error('Hero heading element was not found');
  }
  register('hero-heading', heading);

  const words = Array.from(heading.querySelectorAll('.word'));

  // Zero-time setup: start words below, transparent, slightly blurred
  timeline.set(words, {
    autoAlpha: 0,
    y: 28,
    scale: 0.92,
    filter: 'blur(8px)',
  }, 0);

  // Staggered reading-order entrance with tactile ease
  timeline.to(words, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    duration: 0.6,
    ease: 'power3.out',
    stagger: 0.08,
  }, 0.2);

  // Readable hold for 2.2 seconds, then smooth departure
  timeline.to(words, {
    autoAlpha: 0,
    y: -20,
    duration: 0.45,
    ease: 'power2.in',
    stagger: 0.04,
  }, 2.8);
}
```
