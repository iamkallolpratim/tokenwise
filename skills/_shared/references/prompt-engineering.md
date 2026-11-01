# Cheaper instructions, same behavior

Shorter is better only when nothing the model relies on is lost. Prefer these rewrites:

- **Say the rule, drop the cushioning.** `Please make sure to always run the tests` → `Always run the tests`.
- **One statement per rule.** If a rule appears in two sections, keep it where it applies and delete the other copy.
- **Lists over prose** for independent rules; prose for reasoning the model must follow.
- **Reference, don't paste.** Logs, data dumps and long tables belong in files the agent opens on demand. Leave a one-line pointer with the path.
- **One example, not three.** Keep the example that shows the edge case; drop variants that repeat the pattern.
- **Structured output once.** State the schema in one place; refer to it elsewhere.

Never shorten by:

- removing a negation, exception or condition ("unless", "only if", "except");
- paraphrasing MUST/SHOULD statements, security, privacy or approval rules;
- changing code, paths, URLs, identifiers, keys or schema text;
- merging two near-identical rules without checking what differs.

Token reduction is not success on its own. Without an evaluation run, report "Quality: not verified".
