import type { Finding, FindingCategory, Severity, TokenwiseConfig } from "@tokenwise/shared";
import type { CodeFile, DiscoveredFile } from "../discovery.ts";
import type { ParsedDocument } from "../document.ts";
import type { LineEdit } from "../edits.ts";
import type { TokenCounter } from "../tokens.ts";

export interface FileContext {
  file: DiscoveredFile;
  doc: ParsedDocument;
  /** Markdown/text (true) vs JSON/YAML (false). */
  isProse: boolean;
  /** Always loaded into every session by an agent harness (root CLAUDE.md, AGENTS.md, …). */
  alwaysLoaded: boolean;
  /** Located at the scan target root. */
  isRoot: boolean;
  structured?: unknown;
}

export interface RuleContext {
  files: FileContext[];
  /** Source files that call a model (for static LOOP/CACHE analysis). */
  codeFiles: CodeFile[];
  config: TokenwiseConfig;
  counter: TokenCounter;
}

/** A finding before the engine assigns its id. */
export type DraftFinding = Omit<Finding, "id" | "ruleId" | "category"> & {
  /** Extra discriminator for the stable id (e.g. occurrence index for duplicates). */
  idKey?: string;
  /** Edits that fix this finding (auto-fixable rules only). */
  edits?: LineEdit[];
};

export interface Rule {
  id: string;
  category: FindingCategory;
  defaultSeverity: Severity;
  description: string;
  /** How the rule detects the issue; published on the website's rules reference. */
  method: string;
  /** Whether the rule can ever produce auto-fixable findings. */
  fixable: boolean;
  detect(ctx: RuleContext): Promise<DraftFinding[]>;
}
