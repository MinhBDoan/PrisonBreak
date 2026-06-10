import { describe, expect, it, vi } from "vitest";
import {
  createCodexHealthCheck,
  findBundledCodexExecutable,
  resolveCodexExecutable,
} from "../../service/src/services/CodexHealth";
import { createProductionDependencies } from "../../service/src/server";
import type { ProcessRunner } from "../../service/src/services/CodexService";

function runner(exitCode: number | null, overrides: Partial<Awaited<ReturnType<ProcessRunner>>> = {}): ProcessRunner {
  return vi.fn(async () => ({
    exitCode,
    stdout: "",
    stderr: "",
    timedOut: false,
    ...overrides,
  }));
}

describe("Codex health check", () => {
  it("reports healthy when the configured Codex executable responds successfully", async () => {
    const processRunner = runner(0);
    const health = createCodexHealthCheck({ executable: "codex-test", processRunner });

    await expect(health()).resolves.toBe(true);
    expect(processRunner).toHaveBeenCalledWith("codex-test", ["--version"], "", 2_000);
  });

  it("reports unhealthy for failed, timed out, or output-limited checks", async () => {
    await expect(createCodexHealthCheck({ processRunner: runner(1) })()).resolves.toBe(false);
    await expect(
      createCodexHealthCheck({ processRunner: runner(null, { timedOut: true }) })(),
    ).resolves.toBe(false);
    await expect(
      createCodexHealthCheck({
        processRunner: runner(null, { outputLimitExceeded: "stdout" }),
      })(),
    ).resolves.toBe(false);
  });

  it("uses CODEX_EXECUTABLE with a codex default", () => {
    expect(resolveCodexExecutable({ CODEX_EXECUTABLE: "codex-custom" })).toBe("codex-custom");
    expect(resolveCodexExecutable({}, () => null)).toBe("codex");
  });

  it("prefers the runnable user-local Codex executable when available", () => {
    expect(
      findBundledCodexExecutable(
        {
          LOCALAPPDATA: "C:\\Users\\ronny\\AppData\\Local",
        },
        {
          existsSync: (path) => path.endsWith("\\OpenAI\\Codex\\bin"),
          readdirSync: (path) =>
            path.endsWith("\\OpenAI\\Codex\\bin")
              ? [
                  { name: "older", isDirectory: () => true },
                  { name: "newer", isDirectory: () => true },
                ]
              : [],
          statSync: (path) => ({
            mtimeMs: path.includes("newer") ? 20 : 10,
            isFile: () => path.endsWith("codex.exe"),
          }),
        },
      ),
    ).toBe("C:\\Users\\ronny\\AppData\\Local\\OpenAI\\Codex\\bin\\newer\\codex.exe");
  });

  it("wires production dependencies to a real Codex health check", async () => {
    const processRunner = runner(0);
    const dependencies = createProductionDependencies({
      CODEX_EXECUTABLE: "codex-prod",
      DATABASE_PATH: ":memory:",
    }, processRunner);

    await expect(dependencies.codexHealth?.()).resolves.toBe(true);
    expect(processRunner).toHaveBeenCalledWith("codex-prod", ["--version"], "", 2_000);
    dependencies.database?.close();
  });
});
