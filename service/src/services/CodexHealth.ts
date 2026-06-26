import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnProcess, type ProcessRunner } from "./CodexService";

export interface CodexHealthOptions {
  executable?: string;
  processRunner?: ProcessRunner;
  timeoutMs?: number;
}

export interface CodexExecutableFinderFs {
  existsSync(path: string): boolean;
  readdirSync(path: string): Array<{ name: string; isDirectory(): boolean }>;
  statSync(path: string): { mtimeMs: number; isFile(): boolean };
}

const nodeFs: CodexExecutableFinderFs = {
  existsSync,
  readdirSync: (directory) => readdirSync(directory, { withFileTypes: true }),
  statSync,
};

export function resolveCodexExecutable(
  env: { CODEX_EXECUTABLE?: string; LOCALAPPDATA?: string },
  findExecutable: () => string | null = () => findBundledCodexExecutable(env),
): string {
  return env.CODEX_EXECUTABLE ?? findExecutable() ?? "codex";
}

export function findBundledCodexExecutable(
  env: { LOCALAPPDATA?: string },
  fs: CodexExecutableFinderFs = nodeFs,
): string | null {
  if (!env.LOCALAPPDATA) {
    return null;
  }

  const codexBinRoot = path.join(env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
  if (!fs.existsSync(codexBinRoot)) {
    return null;
  }

  const candidates = fs
    .readdirSync(codexBinRoot)
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const executable = path.join(codexBinRoot, entry.name, "codex.exe");
      try {
        const stat = fs.statSync(executable);
        if (!stat.isFile()) {
          return null;
        }
        return { executable, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is { executable: string; mtimeMs: number } => candidate !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return candidates[0]?.executable ?? null;
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
