import { ExitCode, redact, TokenwiseError } from "@tokenwise/shared";
import { CommanderError } from "commander";
import { buildProgram } from "./program.ts";

// A reader that closes early (`tokenwise audit | head`) is not an error. Stop writing to that
// stream but let the command finish, so an `--apply` run completes instead of stopping halfway
// through its output.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE" || err.code === "ERR_STREAM_DESTROYED") return;
    throw err;
  });
}

async function main(): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
    return process.exitCode === undefined ? ExitCode.Success : Number(process.exitCode);
  } catch (err) {
    if (err instanceof CommanderError) {
      // --help and --version exit with code 0 through the same path.
      if (err.exitCode === 0) return ExitCode.Success;
      return ExitCode.Usage;
    }
    if (err instanceof TokenwiseError) {
      process.stderr.write(`error: ${redact(err.message)}\n`);
      for (const d of err.details) process.stderr.write(`  ${redact(d)}\n`);
      return err.exitCode;
    }
    const e = err as Error;
    process.stderr.write(`error: ${redact(e.message ?? String(err))}\n`);
    if (process.env.TOKENWISE_DEBUG) process.stderr.write(`${redact(e.stack ?? "")}\n`);
    return ExitCode.Runtime;
  }
}

main().then((code) => {
  process.exitCode = code;
});
