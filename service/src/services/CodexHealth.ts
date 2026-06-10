import { spawnProcess, type ProcessRunner } from "./CodexService";

export interface CodexHealthOptions {
  executable?: string;
  processRunner?: ProcessRunner;
  timeoutMs?: number;
}

export function resolveCodexExecutable(env: { CODEX_EXECUTABLE?: string }): string {
  return env.CODEX_EXECUTABLE ?? "codex";
}

export function createCodexHealthCheck(options: CodexHealthOptions = {}): () => Promise<boolean> {
  const executable = options.executable ?? resolveCodexExecutable(process.env);
  const processRunner = options.processRunner ?? spawnProcess;
  const timeoutMs = options.timeoutMs ?? 2_000;

  return async () => {
    try {
      const result = await processRunner(executable, ["--version"], "", timeoutMs);
      return result.exitCode === 0 && !result.timedOut && result.outputLimitExceeded === undefined;
    } catch {
      return false;
    }
  };
}
