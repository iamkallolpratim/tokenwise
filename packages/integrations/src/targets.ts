import os from "node:os";
import path from "node:path";

/**
 * Skill install locations, verified against official docs on 2026-10-30 (website: Project > Sources):
 * - Claude Code: https://code.claude.com/docs/en/skills
 * - Codex: https://developers.openai.com/codex/skills
 */
export type SkillTarget = "claude" | "codex";
export type SkillScope = "project" | "user";

export interface TargetSpec {
  target: SkillTarget;
  /** Directory under skills/ in the TokenWise package. */
  sourceDir: string;
  /** Installed skill directory name. */
  skillName: string;
  projectSkillsDir: string;
  userSkillsDir: (home: string) => string;
  requiredFrontmatter: readonly string[];
  /** Max characters for the description shown in the skill listing, if documented. */
  descriptionLimit?: number;
}

export const TARGETS: Readonly<Record<SkillTarget, TargetSpec>> = {
  claude: {
    target: "claude",
    sourceDir: "claude-tokenwise",
    skillName: "tokenwise",
    projectSkillsDir: path.join(".claude", "skills"),
    userSkillsDir: (home) => path.join(home, ".claude", "skills"),
    // No field is strictly required by Claude Code; TokenWise ships both and requires description.
    requiredFrontmatter: ["description"],
    // description + when_to_use are truncated at 1,536 characters in the listing.
    descriptionLimit: 1536,
  },
  codex: {
    target: "codex",
    sourceDir: "codex-tokenwise",
    skillName: "tokenwise",
    projectSkillsDir: path.join(".agents", "skills"),
    userSkillsDir: (home) => path.join(home, ".agents", "skills"),
    requiredFrontmatter: ["name", "description"],
  },
};

export function destinationDir(
  spec: TargetSpec,
  scope: SkillScope,
  projectRoot: string,
  home = os.homedir(),
): string {
  const base = scope === "project" ? path.join(projectRoot, spec.projectSkillsDir) : spec.userSkillsDir(home);
  return path.join(base, spec.skillName);
}
