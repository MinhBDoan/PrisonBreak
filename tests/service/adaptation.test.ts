import { describe, expect, it, vi } from "vitest";
import {
  adaptationAllowlist,
  adaptationCaps,
  type AdaptationDecision,
} from "../../shared/adaptations";
import { AdaptationValidator } from "../../service/src/services/AdaptationValidator";
import {
  BlockingCodexError,
  CodexService,
  type ProcessResult,
  type ProcessRunner,
} from "../../service/src/services/CodexService";
import type { BehaviorSummary } from "../../shared/contracts";

const behaviorSummary: BehaviorSummary = {
  corridorScores: { east_corridor: 4 },
  hidingSpotScores: { locker_2: 3 },
  mostUsedCorridor: "east_corridor",
  favoriteHidingSpot: "locker_2",
  sprintRatio: 0.5,
  frequentSprinting: true,
  detections: 2,
  successfulEscapes: 3,
};

function decision(overrides: Partial<AdaptationDecision> = {}): AdaptationDecision {
  return {
    action: "increase_corridor_patrol",
    target: "east_corridor",
    rationale: "Player repeatedly used the east corridor.",
    ...overrides,
  };
}

function runner(result: ProcessResult): ProcessRunner {
  return vi.fn(async () => result);
}

describe("adaptation shared contract", () => {
  it("defines exact adaptation caps and allowlisted actions", () => {
    expect(adaptationCaps).toEqual({
      increase_corridor_patrol: 3,
      inspect_hiding_spot: 2,
      increase_noise_sensitivity: 2,
      activate_reserve_guard: 1,
    });
    expect(adaptationAllowlist.map((entry) => entry.action)).toEqual([
      "increase_corridor_patrol",
      "inspect_hiding_spot",
      "increase_noise_sensitivity",
      "activate_reserve_guard",
    ]);
  });
});

describe("AdaptationValidator", () => {
  it("accepts valid decisions whose target matches the behavior summary", () => {
    const validator = new AdaptationValidator();

    expect(validator.validate(decision(), behaviorSummary, [])).toEqual(decision());
    expect(
      validator.validate(decision({ action: "inspect_hiding_spot", target: "locker_2" }), behaviorSummary, []),
    ).toEqual(decision({ action: "inspect_hiding_spot", target: "locker_2" }));
    expect(
      validator.validate(decision({ action: "increase_noise_sensitivity", target: "global" }), behaviorSummary, []),
    ).toEqual(decision({ action: "increase_noise_sensitivity", target: "global" }));
  });

  it("rejects unknown actions and malformed JSON as typed blocking errors", () => {
    const validator = new AdaptationValidator();

    expect(() =>
      validator.validate(
        { action: "teleport_guard", target: "east_corridor", rationale: "Nope." },
        behaviorSummary,
        [],
      ),
    ).toThrow(BlockingCodexError);
    expect(() => validator.parseAndValidate("{ nope", behaviorSummary, [])).toThrow(BlockingCodexError);
  });

  it("rejects choices at capped levels", () => {
    const validator = new AdaptationValidator();

    expect(() =>
      validator.validate(decision(), behaviorSummary, [
        decision(),
        decision(),
        decision(),
      ]),
    ).toThrow(/cap/i);
  });

  it("requires repeated successful escapes before activating the reserve guard", () => {
    const validator = new AdaptationValidator();

    expect(() =>
      validator.validate(
        decision({ action: "activate_reserve_guard", target: "exit" }),
        { ...behaviorSummary, successfulEscapes: 1 },
        [],
      ),
    ).toThrow(/successful escape/i);
    expect(
      validator.validate(decision({ action: "activate_reserve_guard", target: "exit" }), behaviorSummary, []),
    ).toEqual(decision({ action: "activate_reserve_guard", target: "exit" }));
  });
});

describe("CodexService", () => {
  it("spawns the configured executable with a prompt containing only summary and allowlist", async () => {
    const processRunner = runner({
      exitCode: 0,
      stdout: JSON.stringify(decision()),
      stderr: "",
      timedOut: false,
    });
    const service = new CodexService({ executable: "codex-test", processRunner });

    await expect(service.selectAdaptation(behaviorSummary)).resolves.toEqual(decision());
    expect(processRunner).toHaveBeenCalledWith(
      "codex-test",
      [],
      expect.stringContaining(JSON.stringify(behaviorSummary)),
      20_000,
    );
    const prompt = vi.mocked(processRunner).mock.calls[0][2];
    expect(prompt).toContain(JSON.stringify(adaptationAllowlist));
    expect(prompt).not.toContain("localStorage");
  });

  it("blocks malformed JSON, CLI timeout, and non-zero CLI exit", async () => {
    await expect(
      new CodexService({
        executable: "codex-test",
        processRunner: runner({ exitCode: 0, stdout: "{ no", stderr: "", timedOut: false }),
      }).selectAdaptation(behaviorSummary),
    ).rejects.toThrow(BlockingCodexError);

    await expect(
      new CodexService({
        executable: "codex-test",
        processRunner: runner({ exitCode: null, stdout: "", stderr: "", timedOut: true }),
      }).selectAdaptation(behaviorSummary),
    ).rejects.toThrow(/timed out/i);

    await expect(
      new CodexService({
        executable: "codex-test",
        processRunner: runner({ exitCode: 2, stdout: "", stderr: "bad auth", timedOut: false }),
      }).selectAdaptation(behaviorSummary),
    ).rejects.toThrow(/bad auth/i);
  });
});
