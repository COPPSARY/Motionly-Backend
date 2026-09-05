# Cloud generation evaluation

Run deterministic structural and adversarial gates with:

```powershell
npm.cmd run eval:cloud-generation
```

When the sibling frontend checkout is available, verify that the pinned reference commit and source/runtime/skill hashes still match with:

```powershell
npm.cmd run verify:motionly-baseline
```

An alternate frontend path may be passed after `--`. Production workers never execute this developer-only verification command and never read the sibling checkout.

Credentialed provider evaluations are opt-in and must record provider, model, skill bundle, runtime, prompt-set version, cost, latency, repair count, and the fixed baseline manifest. Never place provider keys or customer source in a report.

Before a full generation run, verify the configured Gemini model supports both function calling and visual input with the synthetic, metadata-only probe:

```powershell
$env:GEMINI_API_KEY = 'server-only-test-key'
npm.cmd run eval:gemini-smoke
```

`AI_MODEL` selects the model. The probe never prints the key, model response text, source, or user assets. It does contact Gemini and may incur a small provider charge, so it is never part of the default test suite.

Human reviewers score each anonymous output from 1–5 on prompt adherence, story clarity, hierarchy/readability, motion/transition quality, product authenticity, edit locality, and overall finish. The V1 release target is a median no more than 0.5 below the reference preset and no category median below 3.5.

The baseline manifest pins the current Motionly frontend reference by commit and hashes without creating a production runtime dependency on the sibling checkout.
