import path from "node:path";

/** Repo-relative path with forward slashes, regardless of OS. */
export function toRepoPath(root: string, absolute: string): string {
  const rel = path.relative(root, absolute);
  return rel.split(path.sep).join("/") || ".";
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/").replaceAll("\\", "/");
}
