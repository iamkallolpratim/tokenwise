import { promises as fs } from "node:fs";
import path from "node:path";
import { type Finding, FindingSchema } from "@tokenwise/shared";
import { z } from "zod";

const AuditCacheSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  findings: z.array(FindingSchema),
});
export type AuditCache = z.infer<typeof AuditCacheSchema>;

export function auditCachePath(root: string): string {
  return path.join(root, ".tokenwise", "cache", "audit.json");
}

export async function writeAuditCache(root: string, findings: Finding[]): Promise<void> {
  const file = auditCachePath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const data: AuditCache = { version: 1, createdAt: new Date().toISOString(), findings };
  await fs.writeFile(file, JSON.stringify(data));
}

/** Returns null when there is no cache or it is unreadable; scan then shows findings as n/a. */
export async function readAuditCache(root: string): Promise<AuditCache | null> {
  try {
    const r = AuditCacheSchema.safeParse(JSON.parse(await fs.readFile(auditCachePath(root), "utf8")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
