/** Helpers for rules that read JSON/YAML configuration. */

export interface KeyHit {
  key: string;
  value: unknown;
  path: string[];
}

export function walk(
  value: unknown,
  visit: (hit: KeyHit, parent: Record<string, unknown>) => void,
  path: string[] = [],
  depth = 0,
): void {
  if (depth > 20 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      walk(v, visit, [...path, String(i)], depth + 1);
    });
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(obj)) {
    visit({ key, value: v, path: [...path, key] }, obj);
    walk(v, visit, [...path, key], depth + 1);
  }
}

/** 1-based line of the first occurrence of a JSON/YAML key at or after `fromLine`. */
export function keyLine(text: string, key: string, fromLine = 1): number {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:"${esc}"\\s*:|^\\s*-?\\s*${esc}\\s*:)`);
  const lines = text.split(/\r?\n/);
  for (let i = fromLine - 1; i < lines.length; i++) if (re.test(lines[i] ?? "")) return i + 1;
  return 1;
}

/** Line containing a literal string value (for locating a tool by name). */
export function valueLine(text: string, value: string): number {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex(
    (l) =>
      l.includes(`"${value}"`) ||
      new RegExp(`:\\s*['"]?${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]?\\s*$`).test(l),
  );
  return i === -1 ? 1 : i + 1;
}
