import { createInterface } from "node:readline/promises";
import { AbortedError, formatInt, type TokenwiseConfig } from "@tokenwise/shared";

export interface EgressRequest {
  purpose: string;
  destination: string;
  files: { path: string; tokens: number }[];
}

export interface ConsentFlags {
  allowExternal?: boolean;
  yes?: boolean;
}

/**
 * Invariant I1. Content leaves the machine only when all of these hold:
 * config privacy.externalModelCalls, the --allow-external flag, and an interactive confirmation
 * listing files and token total (or --yes when stdin is not a TTY).
 */
export async function requireEgressConsent(
  config: TokenwiseConfig,
  flags: ConsentFlags,
  req: EgressRequest,
  io: { isTTY: boolean; stderr: NodeJS.WritableStream; stdin: NodeJS.ReadableStream } = {
    isTTY: Boolean(process.stdin.isTTY && process.stderr.isTTY),
    stderr: process.stderr,
    stdin: process.stdin,
  },
): Promise<void> {
  if (!flags.allowExternal)
    throw new AbortedError(
      `${req.purpose} sends file content off this machine; pass --allow-external to permit it.`,
    );
  if (!config.privacy.externalModelCalls) {
    throw new AbortedError(
      `${req.purpose} requires "privacy.externalModelCalls": true in tokenwise.config.json (run: tokenwise config set privacy.externalModelCalls true).`,
    );
  }
  const total = req.files.reduce((s, f) => s + f.tokens, 0);
  const listing = [
    `${req.purpose} will send the following content (secrets redacted) to ${req.destination}:`,
    ...req.files.slice(0, 50).map((f) => `  ${f.path}  (~${formatInt(f.tokens)} tokens)`),
    ...(req.files.length > 50 ? [`  …and ${req.files.length - 50} more files`] : []),
    `  Total: ${req.files.length} files, ~${formatInt(total)} tokens (estimated)`,
  ].join("\n");
  if (!io.isTTY) {
    io.stderr.write(`${listing}\n`);
    if (flags.yes) {
      io.stderr.write("Proceeding because --yes was given.\n");
      return;
    }
    throw new AbortedError("External call needs confirmation; stdin is not a TTY, so pass --yes to confirm.");
  }
  io.stderr.write(`${listing}\n`);
  const rl = createInterface({ input: io.stdin, output: io.stderr });
  try {
    const answer = (await rl.question("Send this content? [y/N] ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") throw new AbortedError("Consent declined; nothing was sent.");
  } finally {
    rl.close();
  }
}

/** Yes/no confirmation for applying changes: prompts on a TTY, otherwise requires --yes. */
export async function confirm(question: string, flags: { yes?: boolean }): Promise<boolean> {
  if (flags.yes) return true;
  if (!(process.stdin.isTTY && process.stderr.isTTY)) {
    throw new AbortedError(`${question} Not a TTY: pass --yes to confirm.`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const a = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return a === "y" || a === "yes";
  } finally {
    rl.close();
  }
}
