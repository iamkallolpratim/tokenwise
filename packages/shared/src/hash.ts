import { createHash } from "node:crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function shortHash(text: string, length = 12): string {
  return sha256(text).slice(0, length);
}

/** Collapses all whitespace runs and trims; used for whitespace-insensitive comparison. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
