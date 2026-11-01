import { z } from "zod";

export const TokenMethodSchema = z.enum(["exact", "provider_api", "estimated"]);
export type TokenMethod = z.infer<typeof TokenMethodSchema>;

export const TokenCountResultSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  method: TokenMethodSchema,
  model: z.string().optional(),
  /** Encoding or estimator that produced the count, e.g. "o200k_base". */
  encoding: z.string().optional(),
  scope: z.enum(["text", "full_request"]),
  warnings: z.array(z.string()).optional(),
});
export type TokenCountResult = z.infer<typeof TokenCountResultSchema>;

export const FileCategorySchema = z.enum([
  "agent-instructions",
  "skill",
  "subagent",
  "prompt-template",
  "tool-schema",
  "agent-config",
  "rag-config",
  "other-relevant",
]);
export type FileCategory = z.infer<typeof FileCategorySchema>;

export const SeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export type Severity = z.infer<typeof SeveritySchema>;
export const SEVERITY_ORDER: readonly Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/** Returns true when `s` is at least as severe as `min`. */
export function severityAtLeast(s: Severity, min: Severity): boolean {
  return SEVERITY_ORDER.indexOf(s) <= SEVERITY_ORDER.indexOf(min);
}

export const FindingCategorySchema = z.enum([
  "redundancy",
  "verbosity",
  "context",
  "tool",
  "rag",
  "agent-loop",
  "security",
  "format",
]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

export const SavingsBasisSchema = z.enum(["measured", "estimated", "potential"]);
export type SavingsBasis = z.infer<typeof SavingsBasisSchema>;

const LocationSchema = z.object({
  file: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});

export const FindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  severity: SeveritySchema,
  category: FindingCategorySchema,
  file: z.string(),
  range: z
    .object({ startLine: z.number().int().positive(), endLine: z.number().int().positive() })
    .optional(),
  relatedLocations: z.array(LocationSchema).optional(),
  description: z.string(),
  evidence: z.string(),
  estimatedSavings: z
    .object({
      tokens: z.number().int().nonnegative(),
      basis: SavingsBasisSchema,
      confidence: z.enum(["high", "medium", "low"]),
      method: TokenMethodSchema.optional(),
    })
    .optional(),
  risk: z.string(),
  recommendation: z.string(),
  autoFixable: z.boolean(),
  kind: z.enum(["verified", "recommendation"]),
  /** What evidence would confirm a recommendation-kind finding. */
  confirmWith: z.string().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

const PricingEntrySchema = z.strictObject({
  inputPerMillion: z.number().nonnegative().describe("Price per million input tokens, in your currency."),
  outputPerMillion: z.number().nonnegative().optional().describe("Price per million output tokens."),
});

// Descriptions here are the source of the generated config reference on the website.
export const ConfigSchema = z.strictObject({
  version: z.literal(1).describe("Config format version. Always 1."),
  defaultModel: z
    .string()
    .min(1)
    .nullable()
    .describe(
      "Model whose tokenizer is used when --model is not given. null counts with the generic estimator (estimated).",
    ),
  include: z.array(z.string()).describe("Globs of files to discover, relative to the project root."),
  exclude: z
    .array(z.string())
    .describe("Globs to skip, in addition to every .gitignore and .tokenwiseignore."),
  maxFileSizeBytes: z.number().int().positive().describe("Files larger than this are skipped."),
  /** Source files scanned by LOOP-* and CACHE-* rules (JS/TS/Python only). */
  codeInclude: z
    .array(z.string())
    .default(["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,py}"])
    .describe("Source files scanned by the LOOP and CACHE rules (JS/TS/Python only)."),
  thresholds: z
    .strictObject({
      rootInstructionTokens: z
        .number()
        .int()
        .positive()
        .describe("CTX-001 fires when an always-loaded root instruction file exceeds this many tokens."),
      nearDuplicateJaccard: z
        .number()
        .min(0)
        .max(1)
        .describe("RED-003 similarity threshold (Jaccard over word 5-shingles)."),
      largeBlockTokens: z
        .number()
        .int()
        .positive()
        .default(400)
        .describe("CTX-002 fires on embedded logs, data dumps or tables of at least this many tokens."),
      toolSchemaTokens: z
        .number()
        .int()
        .positive()
        .default(300)
        .describe("TOOL-001 fires when one tool definition exceeds this many tokens."),
      toolCount: z
        .number()
        .int()
        .positive()
        .default(20)
        .describe("TOOL-004 fires when one file defines more tools than this."),
      ragTopK: z
        .number()
        .int()
        .positive()
        .default(10)
        .describe("RAG-001 fires when a retrieval top_k is larger than this."),
    })
    .describe("Rule thresholds."),
  rules: z
    .strictObject({ disabled: z.array(z.string()).describe('Rule IDs that never run, e.g. ["VERB-001"].') })
    .describe("Rule selection."),
  pricing: z
    .record(z.string(), PricingEntrySchema)
    .describe(
      "Optional prices per model ID. benchmark shows a cost difference only when the model has an entry.",
    ),
  /** Custom model provider: a local command speaking JSON on stdin/stdout. */
  providers: z
    .strictObject({
      custom: z
        .strictObject({
          command: z
            .array(z.string().min(1))
            .min(1)
            .describe("Command and arguments; receives a JSON request on stdin, prints a JSON reply."),
        })
        .optional()
        .describe("A local command used as the model provider. Treated as external (needs consent)."),
    })
    .default({})
    .describe("Model providers for evals and AI-assisted optimization."),
  privacy: z
    .strictObject({
      telemetry: z
        .literal(false)
        .describe("Always false. TokenWise has no telemetry; the schema rejects true."),
      externalModelCalls: z
        .boolean()
        .describe(
          "Allow features that send content to a model provider. Each run also needs --allow-external and a confirmation. Cannot be set from environment variables.",
        ),
    })
    .describe("What may leave the machine."),
});
export type TokenwiseConfig = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: TokenwiseConfig = {
  version: 1,
  defaultModel: null,
  include: ["**/*.md", "**/*.mdc", "**/*.txt", "**/*.json", "**/*.yaml", "**/*.yml"],
  exclude: [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    ".next/**",
    "vendor/**",
    "coverage/**",
    ".tokenwise/**",
  ],
  maxFileSizeBytes: 1_048_576,
  codeInclude: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,py}"],
  thresholds: {
    rootInstructionTokens: 2000,
    nearDuplicateJaccard: 0.8,
    largeBlockTokens: 400,
    toolSchemaTokens: 300,
    toolCount: 20,
    ragTopK: 10,
  },
  rules: { disabled: [] },
  pricing: {},
  providers: {},
  privacy: { telemetry: false, externalModelCalls: false },
};

/** The subset of defaults written by `tokenwise init` (matches the documented file). */
export const INIT_CONFIG = {
  version: 1,
  defaultModel: null,
  include: DEFAULT_CONFIG.include,
  exclude: DEFAULT_CONFIG.exclude,
  maxFileSizeBytes: DEFAULT_CONFIG.maxFileSizeBytes,
  thresholds: { rootInstructionTokens: 2000, nearDuplicateJaccard: 0.8 },
  rules: { disabled: [] },
  pricing: {},
  privacy: { telemetry: false, externalModelCalls: false },
} as const;
