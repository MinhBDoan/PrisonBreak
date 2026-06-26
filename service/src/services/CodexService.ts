import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  adaptationAllowlist,
  adaptationCaps,
  type AdaptationDecision,
} from "../../../shared/adaptations";
import type { BehaviorSummary } from "../../../shared/contracts";
import { AdaptationValidator } from "./AdaptationValidator";

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputLimitExceeded?: "stdout" | "stderr";
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
      | "output_limit"
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
    const outputFile = path.join(
      tmpdir(),
      `prison-break-codex-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    const result = await this.processRunner(
      this.executable,
      [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        "--output-last-message",
        outputFile,
        "-",
      ],
      buildPrompt(behaviorSummary, activeAdaptations),
      this.timeoutMs,
    );

    if (result.timedOut) {
      throw new BlockingCodexError(
        `Codex CLI timed out after ${formatSeconds(this.timeoutMs)} seconds.`,
        "cli_timeout",
      );
    }
    if (result.outputLimitExceeded) {
      throw new BlockingCodexError(
        `Codex CLI exceeded ${result.outputLimitExceeded} output limit.`,
        "output_limit",
      );
    }
    if (result.exitCode !== 0) {
      const stderr = result.stderr.trim();
      throw new BlockingCodexError(
        `Codex CLI exited with code ${result.exitCode}.${stderr ? ` stderr: ${stderr}` : ""}`,
        "cli_exit",
      );
    }

    const rawDecision = await readOutputLastMessage(outputFile, result.stdout);
    return this.validator.parseAndValidate(rawDecision, behaviorSummary, activeAdaptations);
  }
}

async function readOutputLastMessage(outputFile: string, fallbackStdout: string): Promise<string> {
  try {
    return await readFile(outputFile, "utf8");
  } catch {
    return fallbackStdout;
  } finally {
    await unlink(outputFile).catch(() => {});
  }
}

function buildPrompt(
  behaviorSummary: BehaviorSummary,
  activeAdaptations: AdaptationDecision[],
): string {
  const eligibleAdaptations = buildEligibleAdaptations(behaviorSummary, activeAdaptations);
  return [
    "Choose exactly one prison guard adaptation.",
    "Return only JSON with shape {\"action\":\"...\",\"target\":\"...\",\"rationale\":\"...\"}.",
    "Choose only from Eligible adaptations. Do not invent another target or action.",
    `Behavior summary: ${JSON.stringify(behaviorSummary)}`,
    `Allowlist: ${JSON.stringify(adaptationAllowlist)}`,
    `Active adaptations: ${JSON.stringify(activeAdaptations)}`,
    `Eligible adaptations: ${JSON.stringify(eligibleAdaptations)}`,
  ].join("\n");
}

function buildEligibleAdaptations(
  behaviorSummary: BehaviorSummary,
  activeAdaptations: AdaptationDecision[],
): AdaptationDecision[] {
  const candidates: AdaptationDecision[] = [];
  const hasGunEvidence =
    behaviorSummary.combat.gunAttackCount > 0 &&
    (behaviorSummary.combat.primaryStyle === "gun" ||
      behaviorSummary.combat.primaryStyle === "hybrid");
  const hasMeleeEvidence =
    behaviorSummary.combat.meleeAttackCount > 0 &&
    (behaviorSummary.combat.primaryStyle === "melee" ||
      behaviorSummary.combat.primaryStyle === "hybrid");
  const hasBodyEvidence =
    behaviorSummary.combat.knockoutCount > 0 ||
    behaviorSummary.combat.killCount > 0 ||
    behaviorSummary.combat.bodyDiscoveryCount > 0;

  if (behaviorSummary.mostUsedCorridor) {
    candidates.push({
      action: "increase_corridor_patrol",
      target: behaviorSummary.mostUsedCorridor,
      rationale: "The player was detected in or repeatedly used this corridor.",
    });
  }
  if (behaviorSummary.favoriteHidingSpot) {
    candidates.push({
      action: "inspect_hiding_spot",
      target: behaviorSummary.favoriteHidingSpot,
      rationale: "The player repeatedly used this hiding spot.",
    });
  }
  if (behaviorSummary.frequentSprinting) {
    candidates.push({
      action: "increase_noise_sensitivity",
      target: "global",
      rationale: "The player sprinted frequently.",
    });
  }
  if (behaviorSummary.successfulEscapes >= 2) {
    candidates.push({
      action: "activate_reserve_guard",
      target: "exit",
      rationale: "The player escaped successfully multiple times.",
    });
  }
  if (behaviorSummary.combat.favoriteCombatZone && hasGunEvidence) {
    candidates.push(
      {
        action: "place_armed_response",
        target: behaviorSummary.combat.favoriteCombatZone,
        rationale: "The player relied on gun attacks in this zone.",
      },
      {
        action: "improve_guard_cover",
        target: behaviorSummary.combat.favoriteCombatZone,
        rationale: "The player used gun attacks in this zone.",
      },
    );
  }
  if (hasGunEvidence) {
    candidates.push({
      action: "reduce_ammo_availability",
      target: "global",
      rationale: "The player relied on gun attacks.",
    });
  }
  if (behaviorSummary.combat.favoriteCombatZone && hasMeleeEvidence) {
    candidates.push({
      action: "increase_melee_caution",
      target: behaviorSummary.combat.favoriteCombatZone,
      rationale: "The player relied on melee attacks in this zone.",
    });
  }
  if (behaviorSummary.combat.favoriteCombatZone && hasBodyEvidence) {
    candidates.push({
      action: "add_body_checks",
      target: behaviorSummary.combat.favoriteCombatZone,
      rationale: "Recent combat left knockout, kill, or body discovery evidence in this zone.",
    });
  }
  if (hasBodyEvidence) {
    candidates.push({
      action: "increase_guard_durability",
      target: "global",
      rationale: "Recent combat left knockout, kill, or body discovery evidence.",
    });
  }

  const eligibleSpecificAdaptations = candidates.filter(
    (candidate) =>
      activeAdaptations.filter((adaptation) => adaptation.action === candidate.action).length <
      adaptationCaps[candidate.action],
  );
  if (eligibleSpecificAdaptations.length > 0) {
    return eligibleSpecificAdaptations;
  }

  return [
    {
      action: "maintain_security_posture",
      target: "global",
      rationale: "Every specific eligible response is already capped.",
    },
  ];
}

function formatSeconds(timeoutMs: number): string {
  return (timeoutMs / 1000).toLocaleString("en-US", {
    maximumFractionDigits: 3,
    useGrouping: false,
  });
}

export const CODEX_PROCESS_OUTPUT_LIMIT_BYTES = 64 * 1024;

export const spawnProcess: ProcessRunner = (executable, args, stdin, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let outputLimitExceeded: "stdout" | "stderr" | undefined;
    let escalationTimer: NodeJS.Timeout | undefined;
    const cleanupTasks: Promise<void>[] = [];

    const terminateChild = () => {
      const terminationStarted = child.kill("SIGTERM");
      escalationTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
          cleanupTasks.push(forceKillProcessTree(child.pid));
        }
      }, 250);

      if (!terminationStarted) {
        child.kill("SIGKILL");
        cleanupTasks.push(forceKillProcessTree(child.pid));
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild();
    }, timeoutMs);

    const captureChunk = (
      streamName: "stdout" | "stderr",
      current: string,
      chunk: string,
    ): string => {
      if (outputLimitExceeded) {
        return current;
      }

      const availableBytes = CODEX_PROCESS_OUTPUT_LIMIT_BYTES - Buffer.byteLength(current, "utf8");
      if (Buffer.byteLength(chunk, "utf8") <= availableBytes) {
        return current + chunk;
      }

      outputLimitExceeded = streamName;
      clearTimeout(timer);
      terminateChild();
      return current + takeUtf8Prefix(chunk, Math.max(availableBytes, 0));
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = captureChunk("stdout", stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = captureChunk("stderr", stderr, chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (escalationTimer) clearTimeout(escalationTimer);
      reject(new BlockingCodexError(error.message, "spawn_error"));
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (escalationTimer) clearTimeout(escalationTimer);
      Promise.allSettled(cleanupTasks).then(() => {
        resolve({
          exitCode: timedOut || outputLimitExceeded ? null : exitCode,
          stdout,
          stderr,
          timedOut,
          outputLimitExceeded,
        });
      });
    });
    child.stdin.end(stdin);
  });

function forceKillProcessTree(pid: number | undefined): Promise<void> {
  if (process.platform !== "win32" || pid === undefined) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
    taskkill.on("error", () => {
      resolve();
    });
    taskkill.on("close", () => {
      resolve();
    });
  });
}

function takeUtf8Prefix(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) {
      break;
    }
    bytes += characterBytes;
    result += character;
  }
  return result;
}
