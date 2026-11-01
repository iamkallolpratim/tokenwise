/**
 * Model providers for evaluation runs and AI-assisted optimization. Every call sends content off the
 * machine (or to a user command), so callers MUST obtain I1 consent first. Keys come only from env.
 */
import { spawn } from "node:child_process";
import { redact, TokenwiseError, UsageError } from "@tokenwise/shared";
import { isAnthropicModel, openaiEncodingFor } from "@tokenwise/tokenizers";

export interface GenerateRequest {
  model: string;
  system: string;
  input: string;
  maxOutputTokens: number;
}

export interface GenerateResult {
  text: string;
  /** Provider-reported usage; `null` when the provider gave none. */
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ModelProvider {
  readonly name: string;
  readonly destination: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

type FetchFn = typeof fetch;

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  readonly destination = "api.anthropic.com (POST /v1/messages)";
  private readonly apiKey: string;
  private readonly fetchImpl: FetchFn;
  constructor(apiKey: string, fetchImpl: FetchFn = fetch) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: [{ role: "user", content: req.input }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new TokenwiseError(`Anthropic request failed with HTTP ${res.status}`);
    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: (body.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join(""),
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
    };
  }
}

export class OpenAIProvider implements ModelProvider {
  readonly name = "openai";
  readonly destination = "api.openai.com (POST /v1/chat/completions)";
  private readonly apiKey: string;
  private readonly fetchImpl: FetchFn;
  constructor(apiKey: string, fetchImpl: FetchFn = fetch) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const res = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        max_completion_tokens: req.maxOutputTokens,
        messages: [
          { role: "developer", content: req.system },
          { role: "user", content: req.input },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new TokenwiseError(`OpenAI request failed with HTTP ${res.status}`);
    const body = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: body.choices?.[0]?.message?.content ?? "",
      inputTokens: body.usage?.prompt_tokens ?? null,
      outputTokens: body.usage?.completion_tokens ?? null,
    };
  }
}

/**
 * Custom provider: a local command configured in `providers.custom.command`. It receives the request
 * as JSON on stdin and prints `{ "text": string, "inputTokens"?: number, "outputTokens"?: number }`.
 * TokenWise cannot know where the command sends content, so it is treated as external (I1).
 */
export class CommandProvider implements ModelProvider {
  readonly name = "custom";
  readonly destination: string;
  private readonly command: string[];
  private readonly cwd: string;
  constructor(command: string[], cwd: string) {
    this.command = command;
    this.cwd = cwd;
    this.destination = `local command: ${command.join(" ")}`;
  }

  generate(req: GenerateRequest): Promise<GenerateResult> {
    const [bin, ...args] = this.command;
    if (!bin) return Promise.reject(new UsageError("providers.custom.command is empty"));
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd: this.cwd, stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill(), 120_000);
      child.stdout.on("data", (d) => {
        out += d;
      });
      child.stderr.on("data", (d) => {
        err += d;
      });
      child.on("error", (e) => reject(new TokenwiseError(`custom provider failed to start: ${e.message}`)));
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0)
          return reject(
            new TokenwiseError(`custom provider exited with ${code}: ${redact(err.trim()).slice(0, 300)}`),
          );
        try {
          const r = JSON.parse(out) as { text?: unknown; inputTokens?: unknown; outputTokens?: unknown };
          if (typeof r.text !== "string") throw new Error("missing text");
          resolve({
            text: r.text,
            inputTokens: typeof r.inputTokens === "number" ? r.inputTokens : null,
            outputTokens: typeof r.outputTokens === "number" ? r.outputTokens : null,
          });
        } catch (e) {
          reject(new TokenwiseError(`custom provider printed invalid JSON: ${(e as Error).message}`));
        }
      });
      child.stdin.end(JSON.stringify(req));
    });
  }
}

export interface ProviderConfig {
  custom?: { command: string[] } | undefined;
}

/** Picks a provider from the model id. Keys are read from the environment only. */
export function providerFor(
  model: string,
  providers: ProviderConfig,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): ModelProvider {
  if (model.startsWith("custom:") || model === "custom") {
    if (!providers.custom)
      throw new UsageError(`Model "${model}" needs providers.custom.command in tokenwise.config.json`);
    return new CommandProvider(providers.custom.command, cwd);
  }
  if (isAnthropicModel(model)) {
    if (!env.ANTHROPIC_API_KEY) throw new UsageError("ANTHROPIC_API_KEY is not set");
    return new AnthropicProvider(env.ANTHROPIC_API_KEY);
  }
  if (openaiEncodingFor(model)) {
    if (!env.OPENAI_API_KEY) throw new UsageError("OPENAI_API_KEY is not set");
    return new OpenAIProvider(env.OPENAI_API_KEY);
  }
  throw new UsageError(
    `No provider for model "${model}". Use a claude-*, OpenAI, or custom:<name> model id.`,
  );
}
