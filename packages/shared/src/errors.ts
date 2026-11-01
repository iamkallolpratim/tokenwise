export const ExitCode = {
  Success: 0,
  FindingsAboveThreshold: 1,
  Usage: 2,
  Runtime: 3,
  Aborted: 4,
} as const;
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/** An error that carries the process exit code the CLI should use. */
export class TokenwiseError extends Error {
  readonly exitCode: ExitCodeValue;
  readonly details: string[];
  constructor(message: string, exitCode: ExitCodeValue = ExitCode.Runtime, details: string[] = []) {
    super(message);
    this.name = "TokenwiseError";
    this.exitCode = exitCode;
    this.details = details;
  }
}

export class UsageError extends TokenwiseError {
  constructor(message: string, details: string[] = []) {
    super(message, ExitCode.Usage, details);
    this.name = "UsageError";
  }
}

export class AbortedError extends TokenwiseError {
  constructor(message: string) {
    super(message, ExitCode.Aborted);
    this.name = "AbortedError";
  }
}
