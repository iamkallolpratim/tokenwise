---
title: Efficiency score
description: How the 0-100 Token Efficiency Score is computed, and why some dimensions show n/a.
---

After this page you can read a score breakdown and know what evidence would change it.

The score uses only observable evidence. Dimensions without evidence show `n/a`, the remaining weights are renormalized, and the output says so. Every dimension prints a one-line explanation of its value.

| Dimension | Weight | Formula | Evidence needed |
|---|---:|---|---|
| Prompt efficiency | 20% | 100 × (1 − 3 × waste / prose tokens); waste = savings of RED, VERB and FMT findings | Prose instruction files |
| Context efficiency | 25% | min(100, 100 × threshold / always-loaded tokens), minus 20 per HIGH, 10 per MEDIUM, 3 per LOW CTX/CACHE finding | An always-loaded file or a context finding |
| Tool efficiency | 20% | 100 − 25 per HIGH, 15 per MEDIUM, 5 per LOW TOOL finding | Tool schema files |
| Output efficiency | 15% | 100 × pass rate × min(1, baseline output / current output) | An evaluation run |
| Agent-loop efficiency | 20% | min(100, 100 × cache share / 0.8); cache share = cache-read input / total input on follow-up requests | [Imported usage logs](../../guides/usage-logs/) with at least 3 follow-up requests |

## Caps and guarantees

- Any open CRITICAL finding caps the score at 50, and the cap is shown next to the score.
- Waste is measured from findings, not from file size, and protected content cannot be removed through TokenWise. So deleting requirements cannot raise the score; a test checks this.
- Static LOOP findings never change the agent-loop score; they only lower confidence.

See it with:

```bash
tokenwise audit --verbose
```
