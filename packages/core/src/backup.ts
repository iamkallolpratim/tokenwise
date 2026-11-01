import { createHash, randomBytes } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { TokenwiseError, UsageError } from "@tokenwise/shared";
import { z } from "zod";
import { writeFileAtomic } from "./fileio.ts";

const ManifestSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  createdAt: z.string(),
  command: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      mode: z.number().int(),
      sha256Before: z.string(),
      sha256After: z.string(),
      /** The file did not exist before; restoring removes it. */
      created: z.boolean().optional(),
      /** The write removed the file; restoring recreates it. */
      deleted: z.boolean().optional(),
    }),
  ),
});
export type BackupManifest = z.infer<typeof ManifestSchema>;

export function backupsDir(root: string): string {
  return path.join(root, ".tokenwise", "backups");
}

function newBackupId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
}

function abs(root: string, repoPath: string): string {
  return path.join(root, ...repoPath.split("/"));
}

export interface PlannedWrite {
  path: string;
  /** Exact bytes currently on disk; null when the file does not exist yet. */
  before: Buffer | null;
  /** New bytes; null removes the file (used only to undo a file TokenWise created). */
  after: Buffer | null;
  mode: number;
}

const EMPTY = Buffer.alloc(0);

/**
 * Invariant I2: back up every file, write the manifest, then write each file atomically.
 * Fails before writing anything if a file changed on disk since it was read.
 */
export async function applyWithBackup(
  root: string,
  writes: PlannedWrite[],
  command: string,
): Promise<BackupManifest> {
  for (const w of writes) {
    const target = abs(root, w.path);
    const exists = existsSync(target);
    if (w.before === null ? exists : !exists || !(await fs.readFile(target)).equals(w.before))
      throw new TokenwiseError(`${w.path} changed on disk since it was read; re-run the command.`);
  }
  const id = newBackupId();
  const dir = path.join(backupsDir(root), id);
  await fs.mkdir(path.join(dir, "files"), { recursive: true });
  const manifest: BackupManifest = {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    command,
    files: writes.map((w) => ({
      path: w.path,
      mode: w.mode,
      sha256Before: sha256Buf(w.before ?? EMPTY),
      sha256After: sha256Buf(w.after ?? EMPTY),
      ...(w.before === null ? { created: true } : {}),
      ...(w.after === null ? { deleted: true } : {}),
    })),
  };
  for (const w of writes) {
    if (w.before === null) continue;
    const dest = path.join(dir, "files", ...w.path.split("/"));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, w.before);
  }
  await fs.writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const w of writes) {
    const target = abs(root, w.path);
    if (w.after === null) await fs.rm(target);
    else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await writeFileAtomic(target, w.after, w.mode);
    }
  }
  return manifest;
}

function sha256Buf(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

export async function listBackups(root: string): Promise<BackupManifest[]> {
  const dir = backupsDir(root);
  if (!existsSync(dir)) return [];
  const out: BackupManifest[] = [];
  for (const id of (await fs.readdir(dir)).sort()) {
    try {
      const m = ManifestSchema.safeParse(
        JSON.parse(await fs.readFile(path.join(dir, id, "manifest.json"), "utf8")),
      );
      if (m.success) out.push(m.data);
    } catch {
      // Not a backup directory.
    }
  }
  return out;
}

export interface RestoreResult {
  restored: string[];
  /** Backup of the pre-restore state, so restoring is itself reversible. */
  safetyBackup: BackupManifest | null;
}

export async function restoreBackup(
  root: string,
  id: string,
  opts: { force?: boolean } = {},
): Promise<RestoreResult> {
  const backups = await listBackups(root);
  const manifest = backups.find((b) => b.id === id);
  if (!manifest) throw new UsageError(`No backup with id ${id}. Run: tokenwise restore --list`);
  const dir = path.join(backupsDir(root), id);
  const writes: PlannedWrite[] = [];
  for (const f of manifest.files) {
    const original = f.created ? null : await fs.readFile(path.join(dir, "files", ...f.path.split("/")));
    if (original && sha256Buf(original) !== f.sha256Before)
      throw new TokenwiseError(`Backup copy of ${f.path} is corrupt (hash mismatch).`);
    const target = abs(root, f.path);
    const exists = existsSync(target);
    const current = exists ? await fs.readFile(target) : null;
    // A missing file is safe to recreate; anything else must still match what TokenWise wrote.
    const matchesAfter = f.deleted ? !exists : !exists || sha256Buf(current ?? EMPTY) === f.sha256After;
    if (!opts.force && !matchesAfter) {
      throw new TokenwiseError(
        `${f.path} was modified after this backup was taken; pass --force to overwrite those changes.`,
      );
    }
    if (current === null && original === null) continue;
    if (current && original && current.equals(original)) continue;
    writes.push({ path: f.path, before: current, after: original, mode: f.mode });
  }
  if (writes.length === 0) return { restored: [], safetyBackup: null };
  const safetyBackup = await applyWithBackup(root, writes, `restore ${id}`);
  return { restored: writes.map((w) => w.path), safetyBackup };
}
