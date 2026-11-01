// Deterministic stand-in for a model provider (custom provider protocol: JSON request on stdin,
// JSON {text, inputTokens, outputTokens} on stdout). Used by eval and AI-optimize tests.
// MOCK_MODE=bad makes AI rewrites drop protected lines; MOCK_LOG appends each request to a file.
import { appendFileSync } from "node:fs";

let raw = "";
process.stdin.on("data", (d) => {
  raw += d;
});
process.stdin.on("end", () => {
  const req = JSON.parse(raw);
  if (process.env.MOCK_LOG) appendFileSync(process.env.MOCK_LOG, `${raw}\n`);
  let text;
  if (req.system.startsWith("You rewrite")) {
    const file = /<<<FILE\n([\s\S]*)\nFILE>>>/.exec(req.input)?.[1] ?? "";
    const paragraphs = file.split(/\n{2,}/);
    const kept =
      process.env.MOCK_MODE === "bad"
        ? paragraphs.map((p) =>
            p
              .split("\n")
              .filter((l) => !/\b(MUST|Never|never)\b/.test(l))
              .join("\n"),
          )
        : paragraphs.filter((p) => !/^(Hello|Thanks again)\b/.test(p));
    text = "```markdown\n" + kept.join("\n\n") + "\n```";
  } else {
    const escalates = /human agent will review/i.test(req.system) && /\$\d{3,}/.test(req.input);
    text = JSON.stringify({
      answer: escalates ? "A human agent will review your refund request." : "Your order has shipped.",
      escalate: escalates,
    });
  }
  process.stdout.write(
    JSON.stringify({
      text,
      inputTokens: Math.ceil((req.system.length + req.input.length) / 4),
      outputTokens: Math.ceil(text.length / 4),
    }),
  );
});
