// Generates the reference pages from code, so they cannot drift:
//   reference/cli.md            ← Commander definitions (apps/cli/src/program.ts)
//   reference/rules.md          ← rule registry (packages/core/src/rules/all.ts) + rule fixtures
//   reference/config-schema.md  ← Zod ConfigSchema + DEFAULT_CONFIG (packages/shared)
//   reference/report-format.md  ← Zod ReportSchema (packages/core/src/report.ts)
//   changelog.md                ← CHANGELOG.md
// plus src/data/generated/*.json (used by the site checks) and public/schemas/*.json.
// Any error exits non-zero, which fails the website build.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Argument, Command, Option } from "commander";
import { z } from "zod";
import { buildProgram } from "../../apps/cli/src/program.ts";
import {
  ALL_RULES,
  buildFileContexts,
  discover,
  discoverCode,
  ReportSchema,
  runAudit,
  TokenCounter,
} from "../../packages/core/src/index.ts";
import { ConfigSchema, DEFAULT_CONFIG, redact } from "../../packages/shared/src/index.ts";
import { DOCS, GENERATED_DATA, PUBLIC, REPO } from "./lib/paths.ts";

const NOTE = (source: string) =>
  `:::note[Generated]\nThis page is generated from ${source}. Edit the code, not this page.\n:::\n`;

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const code = (s: string) => `\`${s.replace(/`/g, "\\`")}\``;

// Generated pages are gitignored, so an "Edit page" link would point at a file that is not in the
// repository; editUrl: false removes it.
function page(title: string, description: string, body: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\neditUrl: false\n---\n\n${body.trimEnd()}\n`;
}

async function write(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

// ---------------------------------------------------------------- CLI reference

interface CliOption {
  flags: string;
  long: string | null;
  short: string | null;
  description: string;
  default: unknown;
  required: boolean;
}
interface CliCommand {
  path: string;
  usage: string;
  description: string;
  arguments: { name: string; required: boolean; variadic: boolean; description: string }[];
  options: CliOption[];
  subcommands: string[];
}

function optionInfo(o: Option): CliOption {
  return {
    flags: o.flags,
    long: o.long ?? null,
    short: o.short ?? null,
    description: o.description,
    default: o.defaultValue,
    required: Boolean(o.mandatory),
  };
}

function walk(cmd: Command, prefix: string[], out: CliCommand[]): void {
  for (const sub of cmd.commands) {
    const p = [...prefix, sub.name()];
    out.push({
      path: p.join(" "),
      usage: `tokenwise ${p.join(" ")} ${sub.usage()}`.trim(),
      description: sub.description(),
      arguments: sub.registeredArguments.map((a: Argument) => ({
        name: a.name(),
        required: a.required,
        variadic: a.variadic,
        description: a.description,
      })),
      options: sub.options.map(optionInfo),
      subcommands: sub.commands.map((c) => c.name()),
    });
    walk(sub, p, out);
  }
}

function optionTable(options: CliOption[]): string {
  if (!options.length) return "No options.\n";
  const rows = options.map(
    (o) =>
      `| ${code(o.flags)} | ${esc(o.description)}${o.required ? " **Required.**" : ""} | ${o.default === undefined ? "" : code(JSON.stringify(o.default))} |`,
  );
  return ["| Option | Description | Default |", "|---|---|---|", ...rows, ""].join("\n");
}

function cliReference(): { md: string; json: object } {
  const program = buildProgram();
  const commands: CliCommand[] = [];
  walk(program, [], commands);
  const globals = program.options.map(optionInfo);
  const parts = [
    NOTE("the Commander definitions in `apps/cli/src/program.ts` and `apps/cli/src/commands/`"),
    "Every command reads `tokenwise.config.json` and accepts the global options. Commands that analyze files take an optional `[path]` (default: the current directory).",
    "",
    "## Global options",
    "",
    optionTable(globals),
  ];
  for (const c of commands) {
    parts.push(`## tokenwise ${c.path}`, "", c.description, "", "```text", c.usage, "```", "");
    if (c.arguments.length) {
      parts.push("| Argument | Required | Description |", "|---|---|---|");
      for (const a of c.arguments)
        parts.push(
          `| ${code(a.name + (a.variadic ? "..." : ""))} | ${a.required ? "yes" : "no"} | ${esc(a.description)} |`,
        );
      parts.push("");
    }
    if (c.subcommands.length)
      parts.push(
        `Subcommands: ${c.subcommands.map((s) => `[\`${s}\`](#tokenwise-${c.path.replace(/ /g, "-")}-${s})`).join(", ")}.`,
        "",
      );
    else parts.push(optionTable(c.options));
  }
  return {
    md: page(
      "CLI reference",
      "Every TokenWise command, argument and option, generated from the CLI source.",
      parts.join("\n"),
    ),
    json: { globals, commands },
  };
}

// ---------------------------------------------------------------- Rules reference

const CATEGORY_TITLES: Record<string, string> = {
  redundancy: "Redundancy",
  format: "Formatting",
  verbosity: "Verbosity",
  context: "Context",
  security: "Security",
  tool: "Tool schemas",
  rag: "Retrieval (RAG)",
  "agent-loop": "Agent loops and caching",
};

const FIXTURES = path.join(REPO, "tests", "fixtures", "rules");
const LANG: Record<string, string> = {
  ".md": "markdown",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".ts": "ts",
  ".js": "js",
  ".py": "python",
};

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out.sort();
}

async function ruleExample(
  id: string,
): Promise<{ file: string; snippet: string; lang: string; finding: string | null }> {
  const dir = path.join(FIXTURES, id, "positive");
  const config = structuredClone(DEFAULT_CONFIG);
  const { files } = await discover({ config, target: dir, root: dir });
  const codeFiles = await discoverCode({ config, target: dir, root: dir });
  const findings = await runAudit(buildFileContexts(files, "."), {
    config,
    codeFiles,
    counter: new TokenCounter("gpt-5"),
    only: [id],
  });
  if (!findings.length) throw new Error(`${id}: the positive fixture produced no finding`);
  const first = findings[0];
  const all = await listFiles(dir);
  const target = all.find((f) => path.relative(dir, f).split(path.sep).join("/") === first?.file) ?? all[0];
  if (!target) throw new Error(`${id}: no fixture files`);
  const lines = redact(await fs.readFile(target, "utf8")).split("\n");
  const snippet = lines.length > 24 ? [...lines.slice(0, 24), "…"].join("\n") : lines.join("\n");
  return {
    file: path.relative(dir, target).split(path.sep).join("/"),
    snippet: snippet.trimEnd(),
    lang: LANG[path.extname(target)] ?? "text",
    finding: first
      ? redact(
          `${first.severity} ${first.ruleId} ${first.file}${first.range ? `:${first.range.startLine}` : ""} — ${first.description}`,
        )
      : null,
  };
}

async function rulesReference(): Promise<{ md: string; json: object }> {
  const parts = [
    NOTE("the rule registry in `packages/core/src/rules/` and the rule fixtures in `tests/fixtures/rules/`"),
    `TokenWise ships ${ALL_RULES.length} rules. Severity is the default; some rules raise it (noted under "How it detects"). Heuristic rules are never auto-fixable. Each example is the rule's positive test fixture, and the finding below it is what \`tokenwise audit\` reports for that fixture.`,
    "",
    "Disable a rule with `rules.disabled` in `tokenwise.config.json`, or run a subset with `tokenwise audit --rule <id...>` / `--exclude-rule <id...>`.",
    "",
  ];
  const json: object[] = [];
  for (const [cat, title] of Object.entries(CATEGORY_TITLES)) {
    const rules = ALL_RULES.filter((r) => r.category === cat);
    if (!rules.length) continue;
    parts.push(`## ${title}`, "");
    for (const r of rules) {
      const ex = await ruleExample(r.id);
      parts.push(
        `### ${r.id}`,
        "",
        `**${/[.!?]$/.test(r.description) ? r.description : `${r.description}.`}**`,
        "",
        `- Category: \`${r.category}\``,
        `- Default severity: **${r.defaultSeverity}**`,
        `- Auto-fixable: ${r.fixable ? "yes, for exact structural cases (every fix passes the protected-content check)" : "no"}`,
        "",
        `**How it detects:** ${r.method}`,
        "",
        `**Example** (\`${ex.file}\`):`,
        "",
        `\`\`\`${ex.lang}`,
        ex.snippet,
        "```",
        "",
        ...(ex.finding ? ["Reported as:", "", "```text", ex.finding, "```", ""] : []),
      );
      json.push({
        id: r.id,
        category: r.category,
        defaultSeverity: r.defaultSeverity,
        description: r.description,
        fixable: r.fixable,
        anchor: r.id.toLowerCase(),
      });
    }
  }
  const unknown = ALL_RULES.filter((r) => !(r.category in CATEGORY_TITLES));
  if (unknown.length)
    throw new Error(`No section for rule categories: ${unknown.map((r) => r.category).join(", ")}`);
  return {
    md: page(
      "Rules reference",
      "Every TokenWise rule: what it detects, its default severity, and a real example.",
      parts.join("\n"),
    ),
    json,
  };
}

// ---------------------------------------------------------------- Config schema

type JsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  const?: unknown;
  enum?: unknown[];
  additionalProperties?: JsonSchema | boolean;
  required?: string[];
};

function typeOf(s: JsonSchema): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((e) => JSON.stringify(e)).join(" \\| ");
  if (s.anyOf) return s.anyOf.map(typeOf).join(" \\| ");
  if (s.type === "array") return `${s.items ? typeOf(s.items) : "unknown"}[]`;
  if (
    s.type === "object" &&
    !s.properties &&
    s.additionalProperties &&
    typeof s.additionalProperties === "object"
  )
    return `Record<string, ${typeOf(s.additionalProperties)}>`;
  return Array.isArray(s.type) ? s.type.join(" \\| ") : (s.type ?? "unknown");
}

function getDefault(key: string): unknown {
  let v: unknown = DEFAULT_CONFIG;
  for (const k of key.split("."))
    v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

function flatten(
  schema: JsonSchema,
  prefix: string,
  out: { key: string; type: string; description: string }[],
): void {
  for (const [k, s] of Object.entries(schema.properties ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    out.push({ key, type: typeOf(s), description: s.description ?? "" });
    if (s.properties) flatten(s, key, out);
    if (
      s.type === "object" &&
      s.additionalProperties &&
      typeof s.additionalProperties === "object" &&
      s.additionalProperties.properties
    )
      flatten(s.additionalProperties, `${key}.<model>`, out);
  }
}

function configReference(): { md: string; json: object; schema: object } {
  const schema = z.toJSONSchema(ConfigSchema, { io: "input" }) as JsonSchema;
  const rows: { key: string; type: string; description: string }[] = [];
  flatten(schema, "", rows);
  const table = rows.map((r) => {
    const d = getDefault(r.key);
    return `| ${code(r.key)} | ${code(r.type)} | ${esc(r.description)} | ${d === undefined ? "" : code(JSON.stringify(d))} |`;
  });
  const md = page(
    "Config schema",
    "Every tokenwise.config.json key with its type, default and meaning, generated from the Zod schema.",
    [
      NOTE("`ConfigSchema` and `DEFAULT_CONFIG` in `packages/shared/src/schemas.ts`"),
      "Unknown keys are rejected. The same schema as JSON Schema: [`config.schema.json`](../../../schemas/config.schema.json). For where values come from and how they combine, see [Configuration](../../getting-started/configuration/).",
      "",
      "| Key | Type | Description | Default |",
      "|---|---|---|---|",
      ...table,
    ].join("\n"),
  );
  return { md, json: rows.map((r) => ({ ...r, default: getDefault(r.key) })), schema };
}

// ---------------------------------------------------------------- Report format

function reportReference(): { md: string; schema: object } {
  const schema = z.toJSONSchema(ReportSchema) as JsonSchema;
  const rows = Object.entries(schema.properties ?? {}).map(
    ([k, s]) => `| ${code(k)} | ${code(typeOf(s))} | ${esc(s.description ?? "")} |`,
  );
  const md = page(
    "Report format",
    "The versioned JSON report written by tokenwise report --format json, generated from its Zod schema.",
    [
      NOTE("`ReportSchema` in `packages/core/src/report.ts`"),
      "`tokenwise report --format json` writes this object; `--format markdown` and `--format html` render the same data. `schemaVersion` changes only when a field is removed or changes meaning. Secrets are redacted before any format is written.",
      "",
      "Full JSON Schema: [`report.schema.json`](../../../schemas/report.schema.json).",
      "",
      "## Top-level fields",
      "",
      "| Field | Type | Description |",
      "|---|---|---|",
      ...rows,
      "",
      "Every token count carries a `method` (`exact`, `provider_api` or `estimated`), and every saving a `basis` (`measured`, `estimated` or `potential`). Missing values are `null`, shown as `n/a`.",
      "",
      "## Schema",
      "",
      "```json",
      JSON.stringify(schema, null, 2),
      "```",
    ].join("\n"),
  );
  return { md, schema };
}

// ---------------------------------------------------------------- Changelog

async function changelog(): Promise<string> {
  const text = await fs.readFile(path.join(REPO, "CHANGELOG.md"), "utf8");
  const body = text.replace(/^# .*\n+/, "");
  return page(
    "Changelog",
    "Release history of TokenWise.",
    `${NOTE("`CHANGELOG.md` in the repository root")}\n${body}`,
  );
}

// ---------------------------------------------------------------- main

const cli = cliReference();
const rules = await rulesReference();
const config = configReference();
const report = reportReference();
await write(path.join(DOCS, "reference", "cli.md"), cli.md);
await write(path.join(DOCS, "reference", "rules.md"), rules.md);
await write(path.join(DOCS, "reference", "config-schema.md"), config.md);
await write(path.join(DOCS, "reference", "report-format.md"), report.md);
await write(path.join(DOCS, "changelog.md"), await changelog());
await write(path.join(GENERATED_DATA, "cli.json"), `${JSON.stringify(cli.json, null, 2)}\n`);
await write(path.join(GENERATED_DATA, "rules.json"), `${JSON.stringify(rules.json, null, 2)}\n`);
await write(path.join(GENERATED_DATA, "config.json"), `${JSON.stringify(config.json, null, 2)}\n`);
await write(
  path.join(PUBLIC, "schemas", "config.schema.json"),
  `${JSON.stringify(config.schema, null, 2)}\n`,
);
await write(
  path.join(PUBLIC, "schemas", "report.schema.json"),
  `${JSON.stringify(report.schema, null, 2)}\n`,
);
console.log(
  `generated: ${(cli.json as { commands: unknown[] }).commands.length} commands, ${ALL_RULES.length} rules, config and report schemas`,
);
