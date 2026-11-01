import YAML from "yaml";
import type { TargetSpec } from "./targets.ts";

export interface FrontmatterResult {
  data: Record<string, unknown>;
  errors: string[];
}

/** Validates SKILL.md frontmatter against the verified spec for a target. */
export function validateSkillFile(spec: TargetSpec, text: string): FrontmatterResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return { data: {}, errors: ["frontmatter must start on the first line with ---"] };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { data: {}, errors: ["frontmatter is not closed with ---"] };
  let data: Record<string, unknown> = {};
  try {
    const parsed = YAML.parse(lines.slice(1, end).join("\n"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      data = parsed as Record<string, unknown>;
    else errors.push("frontmatter must be a YAML mapping");
  } catch (e) {
    errors.push(`frontmatter is not valid YAML: ${(e as Error).message}`);
  }
  for (const field of spec.requiredFrontmatter) {
    const v = data[field];
    if (typeof v !== "string" || v.trim() === "") errors.push(`missing required field: ${field}`);
  }
  const desc = typeof data.description === "string" ? data.description : "";
  const when = typeof data.when_to_use === "string" ? data.when_to_use : "";
  if (spec.descriptionLimit && desc.length + when.length > spec.descriptionLimit) {
    errors.push(
      `description${when ? " + when_to_use" : ""} is ${desc.length + when.length} chars; limit ${spec.descriptionLimit}`,
    );
  }
  if (typeof data.name === "string" && hasForbiddenNameChars(data.name)) {
    errors.push("name contains characters the spec forbids");
  }
  if (lines.slice(end + 1).length > 500) errors.push("SKILL.md body exceeds the recommended 500 lines");
  return { data, errors };
}

/** Claude Code forbids zero-width spaces, control characters, `<`, `>`, and leading/trailing/repeated spaces. */
function hasForbiddenNameChars(name: string): boolean {
  for (const ch of name) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp === 0x7f || cp === 0x200b || ch === "<" || ch === ">") return true;
  }
  return /^\s|\s$|\s{2}/.test(name);
}
