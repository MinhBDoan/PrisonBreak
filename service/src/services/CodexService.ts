import { spawn } from "node:child_process";
import {
  adaptationAllowlist,
  type AdaptationDecision,
} from "../../../shared/adaptations";
import type { BehaviorSummary } from "../../../shared/contracts";
import { AdaptationValidator } from "./AdaptationValidator";

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type ProcessRunner = (
  executable: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
) => Promise<ProcessResult>;

export class BlockingCodexError extends Error {
  constructor(
    message: string,
    readonly code:
      | "malformed_json"
      | "invalid_decision"
      | "cli_timeout"
      | "cli_exit"
      | "spawn_error",
  ) {
    super(message);
    this.name = "BlockingCodexError";
  }
}

export interface CodexServiceOptions {
  executable?: string;
  processRunner?: ProcessRunner;
  timeoutMs?: number;
  validator?: AdaptationValidator;
}

export class CodexService {
  private readonly executable: string;
  private readonly processRunner: ProcessRunner;
  private readonly timeoutMs: number;
  private readonly validator: AdaptationValidator;

  constructor(options: CodexServiceOptions = {}) {
    this.executable = options.executable ?? process.env.CODEX_EXECUTABLE ?? "codex";
    this.processRunner = options.processRunner ?? spawnProcess;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.validator = options.validator ?? new AdaptationValidator();
  }

  async selectAdaptation(
    behaviorSummary: BehaviorSummary,
    activeAdaptations: AdaptationDecision[] = [],
  ): Promise<AdaptationDecision> {
    const result = await this.processRunner(
      this.executable,
      [],
      buildPrompt(behaviorSummary),
      this.timeoutMs,
    );

    if (result.timedOut) {
      throw new BlockingCodexError("Codex CLI timed out after 20 seconds.", "cli_timeout");
    }
    if (result.exitCode !== 0) {
      const stderr = result.stderr.trim();
      throw new BlockingCodexError(
        `Codex CLI exited with code ${result.exitCode}.${stderr ? ` stderr: ${stderr}` : ""}`,
        "cli_exit",
      );
    }

    return this.validator.parseAndValidate(result.stdout, behaviorSummary, activeAdaptations);
  }
}

function buildPrompt(behaviorSummary: BehaviorSummary): string {
  return [
    "Choose exactly one prison guard adaptation.",
    "Return only JSON with shape {\"action\":\"...\",\"target\":\"...\",\"rationale\":\"...\"}.",
    `Behavior summary: ${JSON.stringify(behaviorSummary)}`,
    `Allowlist: ${JSON.stringify(adaptationAllowlist)}`,
  ].join("\n");
}

export const spawnProcess: ProcessRunner = (executable, args, stdin, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      resolve({ exitCode: null, stdout, stderr, timedOut: true });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new BlockingCodexError(error.message, "spawn_error"));
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut: false });
    });
    child.stdin.end(stdin);
  });
