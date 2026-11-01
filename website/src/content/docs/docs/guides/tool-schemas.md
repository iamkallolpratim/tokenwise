---
title: Tool schemas
description: Find oversized and repetitive tool definitions, which are sent with every model request.
---

After this guide you can find the tool definitions that cost the most and shorten them without breaking calls.

Tool definitions (JSON or YAML with `name`, `description` and a parameter schema) are sent with every request that offers the tools, so their size is paid on every call.

## Audit

```bash
tokenwise audit tools/ --model gpt-5
```

| Rule | Fires when |
|---|---|
| [TOOL-001](../../reference/rules/#tool-001) | One tool definition exceeds `thresholds.toolSchemaTokens` (300) |
| [TOOL-002](../../reference/rules/#tool-002) | Sentences or parameter descriptions repeat across tools |
| [TOOL-003](../../reference/rules/#tool-003) | A description embeds JSON examples of 60+ tokens |
| [TOOL-004](../../reference/rules/#tool-004) | One file defines more than `thresholds.toolCount` (20) tools |

None of these are auto-fixed. Tool descriptions are how a model decides when and how to call a tool, so every change needs your judgment.

## What to change

- Shorten descriptions to what the model needs to choose the tool and fill its arguments. Move background into the system prompt once, instead of repeating it per tool.
- Replace inline JSON examples with one short example, or describe the shape in the schema itself.
- Keep every parameter, and keep required parameters required. TokenWise never recommends removing one.
- Offer fewer tools per request if your harness can select them by task (TOOL-004).

Validate the result with an [evaluation suite](../benchmarking-and-evals/) that exercises the tools.
