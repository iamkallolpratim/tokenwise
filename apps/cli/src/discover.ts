import { type CodeFile, type DiscoveryResult, discover, discoverCode } from "@tokenwise/core";
import type { CommandContext } from "./context.ts";

export async function discoverFor(ctx: CommandContext): Promise<DiscoveryResult> {
  const result = await discover({
    config: ctx.loaded.config,
    target: ctx.target,
    root: ctx.root,
    onProgress: (d, t) => ctx.out.progress(d, t, "scanning"),
  });
  ctx.out.endProgress();
  for (const s of result.skipped)
    if (s.reason !== "ignored") ctx.out.debug(`skipped ${s.path} (${s.reason})`);
  return result;
}

export async function discoverCodeFor(ctx: CommandContext): Promise<CodeFile[]> {
  const files = await discoverCode({ config: ctx.loaded.config, target: ctx.target, root: ctx.root });
  for (const f of files) ctx.out.debug(`code file with model calls: ${f.path}`);
  return files;
}
