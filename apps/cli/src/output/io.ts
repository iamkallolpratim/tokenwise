import { redact } from "@tokenwise/shared";
import pc from "picocolors";

export type Colors = ReturnType<typeof pc.createColors>;

export interface Output {
  colors: Colors;
  quiet: boolean;
  verbose: boolean;
  /** Primary output (stdout). Always redacted. */
  out(text: string): void;
  /** Logs, warnings, progress (stderr). */
  info(text: string): void;
  warn(text: string): void;
  debug(text: string): void;
  progress(done: number, total: number, label: string): void;
  endProgress(): void;
}

export function colorEnabled(flag: boolean | undefined, stream: NodeJS.WriteStream): boolean {
  if (flag === false) return false;
  if ("NO_COLOR" in process.env && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  return Boolean(stream.isTTY);
}

export function createOutput(opts: { color?: boolean; quiet?: boolean; verbose?: boolean }): Output {
  const colors = pc.createColors(colorEnabled(opts.color, process.stdout));
  const errColors = pc.createColors(colorEnabled(opts.color, process.stderr));
  const quiet = Boolean(opts.quiet);
  const verbose = Boolean(opts.verbose) && !quiet;
  const showProgress = Boolean(process.stderr.isTTY) && !quiet;
  let progressShown = false;
  return {
    colors,
    quiet,
    verbose,
    out: (t) => process.stdout.write(`${redact(t)}\n`),
    info: (t) => {
      if (!quiet) process.stderr.write(`${redact(t)}\n`);
    },
    warn: (t) => {
      if (!quiet) process.stderr.write(`${errColors.yellow("warning:")} ${redact(t)}\n`);
    },
    debug: (t) => {
      if (verbose) process.stderr.write(`${errColors.dim(redact(t))}\n`);
    },
    progress: (done, total, label) => {
      if (!showProgress || total <= 200) return;
      progressShown = true;
      process.stderr.write(`\r${label} ${done}/${total}`);
    },
    endProgress: () => {
      if (progressShown) process.stderr.write("\r\x1b[K");
      progressShown = false;
    },
  };
}

/** Writes JSON to stdout with secrets redacted. */
export function printJson(value: unknown): void {
  process.stdout.write(`${redact(JSON.stringify(value, null, 2))}\n`);
}
