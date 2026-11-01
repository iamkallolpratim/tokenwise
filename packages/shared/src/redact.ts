/**
 * Secret detection and redaction (invariant I5).
 *
 * Two tiers:
 * - KNOWN_SECRET_PATTERNS: well-known credential formats. High precision; used by SEC-001.
 * - High-entropy tokens: broader, used only for redacting output (never as a finding on its own).
 */

export interface SecretPattern {
  name: string;
  regex: RegExp;
}

export const KNOWN_SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    name: "private-key",
    regex:
      /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|$)/g,
  },
  { name: "anthropic-api-key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "openai-api-key", regex: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g },
  { name: "aws-access-key-id", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "github-token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g },
  { name: "slack-token", regex: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "stripe-live-key", regex: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/g },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  {
    name: "credential-assignment",
    // key = "value" style assignments where the value looks random (checked by entropy below).
    regex:
      /\b(?:api[_-]?key|secret|token|password|passwd|access[_-]?key|client[_-]?secret)["']?\s*[:=]\s*["']([A-Za-z0-9_\-+/=.]{20,})["']/gi,
  },
];

const PLACEHOLDER_WORDS = /(?:example|placeholder|your[_-]|xxxx|changeme|dummy|redacted|<|\$\{|test)/i;

export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export interface SecretMatch {
  name: string;
  index: number;
  length: number;
}

/** Finds well-known secret formats. Placeholder-looking values are skipped (precision over recall). */
export function findSecrets(text: string): SecretMatch[] {
  const out: SecretMatch[] = [];
  for (const { name, regex } of KNOWN_SECRET_PATTERNS) {
    regex.lastIndex = 0;
    for (const m of text.matchAll(regex)) {
      const value = m[1] ?? m[0];
      if (PLACEHOLDER_WORDS.test(value)) continue;
      if (name === "credential-assignment" && shannonEntropy(value) < 3.5) continue;
      out.push({ name, index: m.index ?? 0, length: m[0].length });
    }
  }
  // Overlapping matches (e.g. an Anthropic key also matching the generic sk- pattern) report once,
  // keeping the earliest pattern in KNOWN_SECRET_PATTERNS order, which lists specific formats first.
  const kept: SecretMatch[] = [];
  for (const m of out) {
    if (!kept.some((k) => m.index < k.index + k.length && k.index < m.index + m.length)) kept.push(m);
  }
  return kept.sort((a, b) => a.index - b.index);
}

const HIGH_ENTROPY_TOKEN = /[A-Za-z0-9_\-+/=]{32,}/g;

function looksLikeHighEntropySecret(token: string): boolean {
  if (/^[0-9a-f]+$/i.test(token)) return false; // hex digests (commit SHAs, checksums) are not secrets
  if (/^[A-Za-z]+$/.test(token)) return false;
  if (token.includes("/") && /^[\w./-]+$/.test(token) && !/[+=]/.test(token)) return false; // paths
  return shannonEntropy(token) >= 4.5;
}

/** Redacts known secrets and high-entropy tokens. Safe to call on any user-visible string. */
export function redact(text: string): string {
  let result = text;
  const matches = findSecrets(result);
  for (const m of [...matches].reverse()) {
    result = `${result.slice(0, m.index)}[REDACTED:${m.name}]${result.slice(m.index + m.length)}`;
  }
  return result.replace(HIGH_ENTROPY_TOKEN, (tok) =>
    looksLikeHighEntropySecret(tok) ? "[REDACTED:high-entropy]" : tok,
  );
}

/** Looks like an API key value (used to refuse storing keys in config). */
export function looksLikeApiKey(value: string): boolean {
  return findSecrets(value).length > 0 || (value.length >= 24 && looksLikeHighEntropySecret(value));
}

/** Path patterns for files never read unless explicitly included (I5). Matched against the basename. */
const SECRET_FILE_PATTERNS: readonly RegExp[] = [
  /^\.env(?:\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.keychain(?:-db)?$/i,
  /^credentials(?:\..*)?$/i,
  /credentials\.json$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/,
  /^\.netrc$/,
  /^\.npmrc$/,
  /^\.pypirc$/,
  /secrets?\.(?:json|ya?ml|toml)$/i,
];

export function isSecretFile(repoPath: string): boolean {
  const base = repoPath.split("/").pop() ?? repoPath;
  return SECRET_FILE_PATTERNS.some((re) => re.test(base));
}
