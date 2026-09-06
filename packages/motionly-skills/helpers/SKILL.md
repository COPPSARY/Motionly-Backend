---
name: helpers
description: Apply reviewed Motionly motion patterns inline on the caller-owned timeline.
---

# Motionly motion patterns

Implement motion directly with the provided `timeline`; generated `timelineJs` cannot import helper packages. The snippets below assume targets were queried below `root` and registered when user-editable.

## Reveal

```js
timeline.set(target, { autoAlpha: 0, y: 28 }, 0);
timeline.to(target, {
  autoAlpha: 1,
  y: 0,
  duration: 0.6,
  ease: 'power3.out',
}, 0.2);
```

## Scale and rotation pop

```js
timeline.set(target, {
  autoAlpha: 0,
  scale: 0.82,
  rotation: -6,
  transformOrigin: '50% 50%',
}, 0);
timeline.to(target, {
  autoAlpha: 1,
  scale: 1,
  rotation: 0,
  duration: 0.68,
  ease: 'back.out(1.3)',
}, 0.25);
```

## Reading-order stagger

```js
timeline.set(items, { autoAlpha: 0, y: 42, scale: 0.96 }, 0);
timeline.to(items, {
  autoAlpha: 1,
  y: 0,
  scale: 1,
  duration: 0.58,
  stagger: 0.08,
  ease: 'power4.out',
}, 0.3);
```

## Camera push

Animate a scene wrapper, not the whole document. Leave enough hold time after arrival.

```js
timeline.set(scene, { transformOrigin: '50% 50%' }, 0);
timeline.to(scene, {
  scale: 1.16,
  x: -36,
  y: 18,
  duration: 1.25,
  ease: 'power3.inOut',
}, 1.4);
```

## Overlapping scene handoff

```js
timeline.set(incoming, { autoAlpha: 0, xPercent: 100 }, 0);
timeline.set(incoming, { autoAlpha: 1 }, handoffAt);
timeline.to(outgoing, {
  xPercent: -18,
  scale: 1.035,
  autoAlpha: 0,
  duration: 0.82,
  ease: 'power3.inOut',
}, handoffAt);
timeline.to(incoming, {
  xPercent: 0,
  duration: 0.82,
  ease: 'power3.inOut',
}, handoffAt);
```

Use explicit durations and positions. Initialize hidden/transformed state at time zero, preserve a readable hold between arrival and departure, resolve outgoing layers, and keep scene metadata aligned with actual timing. Prefer existing semantic spans for text stagger; do not rebuild registered text at runtime merely to split it.