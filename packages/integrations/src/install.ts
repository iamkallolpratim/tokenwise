import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { ExitCode, TokenwiseError, toPosix } from "@tokenwise/shared";
import { validateSkillFile } from "./frontmatter.ts";
import { destinationDir, type SkillScope, type SkillTarget, TARGETS } from "./targets.ts";

export interface InstallPlan {
  target: SkillTarget;
  scope: SkillScope;
  sourceDir: string;
  destination: string;
  files: { from: string; to: string }[];
  exists: boolean;
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(p)));
    else if (entry.isFile()) out.push(p);
  }
  return out.sort();
}

export async function planInstall(opts: {
  skillsRoot: string;
  target: SkillTarget;
  scope: SkillScope;
  projectRoot: string;
  home?: string;
}): Promise<InstallPlan> {
  const spec = TARGETS[opts.target];
  const sourceDir = path.join(opts.skillsRoot, spec.sourceDir);
  if (!existsSync(path.join(sourceDir, "SKILL.md"))) {
    throw new TokenwiseError(
      `Skill source not found at ${sourceDir}; the TokenWise package may be incomplete.`,
    );
  }
  const { errors } = validateSkillFile(spec, await fs.readFile(path.join(sourceDir, "SKILL.md"), "utf8"));
  if (errors.length)
    throw new TokenwiseError(`Bundled ${opts.target} skill is invalid`, ExitCode.Runtime, errors);
  const destination = destinationDir(spec, opts.scope, opts.projectRoot, opts.home);
  const files = (await listFiles(sourceDir)).map((from) => ({
    from,
    to: path.join(destination, path.relative(sourceDir, from)),
  }));
  return {
    target: opts.target,
    scope: opts.scope,
    sourceDir,
    destination,
    files,
    exists: existsSync(destination),
  };
}

export async function executeInstall(plan: InstallPlan, opts: { force?: boolean } = {}): Promise<void> {
  if (plan.exists && !opts.force) {
    throw new TokenwiseError(`${toPosix(plan.destination)} already exists; pass --force to overwrite it.`);
  }
  if (plan.exists) await fs.rm(plan.destination, { recursive: true, force: true });
  for (const f of plan.files) {
    await fs.mkdir(path.dirname(f.to), { recursive: true });
    await fs.copyFile(f.from, f.to);
  }
}

/** Reports which TokenWise skills are installed for a project and user. */
export function detectInstalled(
  projectRoot: string,
  home?: string,
): { target: SkillTarget; scope: SkillScope; path: string }[] {
  const out: { target: SkillTarget; scope: SkillScope; path: string }[] = [];
  for (const spec of Object.values(TARGETS)) {
    for (const scope of ["project", "user"] as const) {
      const p = destinationDir(spec, scope, projectRoot, home);
      if (existsSync(path.join(p, "SKILL.md"))) out.push({ target: spec.target, scope, path: p });
    }
  }
  return out;
}
