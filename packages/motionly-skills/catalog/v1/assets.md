# Assets

Use only staged assets from the provided manifest. Preserve exact copy, intrinsic aspect ratios, and credible product media. Do not fetch remote URLs at runtime.

Import each staged asset in `index.ts` from its exact manifest path with `?url`, for example `import heroUrl from './assets/<asset-id>.png?url'`. Put a stable placeholder such as `__MOTIONLY_HERO__` in `composition.html`, replace it with the imported URL during the thin mount step, then parse/mount the HTML. Never place a raw staged path directly in HTML because Vite cannot rewrite URLs inside the raw template. The frontend must hydrate the same virtual asset paths before compiling the returned source.

Size/crop deliberately, avoid tainted cross-origin sources, wait for media readiness during validation, and remove filters/backdrop layers that should not survive into later scenes or the final brand frame.
