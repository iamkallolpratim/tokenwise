export type LineEnding = "\n" | "\r\n";

export function detectLineEnding(text: string): LineEnding {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? "\r\n" : "\n";
}

/** Truncate for display, never mid-surrogate. */
export function truncate(text: string, max = 200): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}
