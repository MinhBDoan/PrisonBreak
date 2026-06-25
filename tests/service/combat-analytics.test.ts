import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import { createDatabase } from "../../service/src/db";
import { EventRepository } from "../../service/src/repositories/EventRepository";
import { RunRepository } from "../../service/src/repositories/RunRepository";
import { AnalyticsService } from "../../service/src/services/AnalyticsService";
import { AdaptationValidator } from "../../service/src/services/AdaptationValidator";
import type { AdaptationDecision } from "../../shared/adaptations";
import {
  BehaviorSummarySchema,
  type BehaviorSummary,
  type RunEvent,
  type RunOutcome,
} from "../../shared/contracts";

function event(
  type: RunEvent["type"],
  payload: Record<string, unknown> = {},
  position = { x: 1, y: 1 },
): RunEvent {
  return { type, atMs: 100, position, payload };
}

function seedCompletedRun(
  runs: RunRepository,
  events: EventRepository,
  outcome: RunOutcome,
  runEvents: RunEvent[],
) {
  const run = runs.startRun("{}");
  events.insertRunEvents(run.id, runEvents);
  runs.completeRun(run.id, outcome, 1_000, `complete-${run.id}`);
}

function summarize(runEvents: RunEvent[]): BehaviorSummary {
  const database = createDatabase(":memory:");
  const runs = new RunRepository(database);
  const events = new EventRepository(database);
  seedCompletedRun(runs, events, "capture", runEvents);
  return new AnalyticsService(events).summarize(1);
}

const combatSummary: BehaviorSummary = {
  corridorScores: {},
  hidingSpotScores: {},
  mostUsedCorridor: null,
  favoriteHidingSpot: null,
  sprintRatio: 0,
  frequentSprinting: false,
  detections: 0,
  successfulEscapes: 0,
  combat: {
    primaryStyle: "gun",
    favoriteCombatZone: "security_room",
    gunAttackCount: 3,
    meleeAttackCount: 0,
    knockoutCount: 0,
    killCount: 1,
    bodyDiscoveryCount: 1,
    healingUseCount: 1,
    armedResponseTriggers: 1,
  },
};

function decision(overrides: Partial<AdaptationDecision>): AdaptationDecision {
  return {
    action: "place_armed_response",
    target: "security_room",
    rationale: "The player relied on gun attacks in the security room.",
    ...overrides,
  };
}

describe("combat analytics", () => {
  it("summarizes heavy gun reliance and infers favorite zone from position", () => {
    const summary = summarize([
      event("attack", { attackType: "gun" }, { x: 18, y: 2 }),
      event("attack", { attackType: "gun" }, { x: 20, y: 2 }),
      event("kill", {}, { x: 20, y: 2 }),
      event("body_discovered", {}, { x: 20, y: 2 }),
      event("heal", {}, { x: 20, y: 2 }),
      event("armed_response_triggered", {}, { x: 20, y: 2 }),
    ]);

    expect(summary.combat).toEqual({
      primaryStyle: "gun",
      favoriteCombatZone: "security_room",
      gunAttackCount: 2,
      meleeAttackCount: 0,
      knockoutCount: 0,
      killCount: 1,
      bodyDiscoveryCount: 1,
      healingUseCount: 1,
      armedResponseTriggers: 1,
    });
  });

  it("summarizes melee style from melee and unarmed attacks", () => {
    expect(
      summarize([
        event("attack", { attackType: "melee", zoneId: "central_corridor" }),
        event("attack", { attackType: "unarmed", zoneId: "central_corridor" }),
        event("knockout", { zoneId: "central_corridor" }),
      ]).combat,
    ).toMatchObject({
      primaryStyle: "melee",
      favoriteCombatZone: "central_corridor",
      gunAttackCount: 0,
      meleeAttackCount: 2,
      knockoutCount: 1,
    });
  });

  it("summarizes hybrid style when both gun and melee attacks are present", () => {
    expect(
      summarize([
        event("attack", { attackType: "gun", corridorId: "east_corridor" }),
        event("attack", { attackType: "melee", corridorId: "east_corridor" }),
      ]).combat.primaryStyle,
    ).toBe("hybrid");
  });

  it("classifies production-shaped attack events by weapon id", () => {
    const summary = summarize([
      event("attack", { weaponId: "pistol", corridorId: "east_corridor" }),
      event("attack", { weaponId: "suppressed_pistol", corridorId: "east_corridor" }),
      event("attack", { weaponId: "fists", corridorId: "east_corridor" }),
      event("attack", { weaponId: "makeshift_knife", corridorId: "east_corridor" }),
    ]);

    expect(summary.combat).toMatchObject({
      primaryStyle: "hybrid",
      favoriteCombatZone: "east_corridor",
      gunAttackCount: 2,
      meleeAttackCount: 2,
    });
  });

  it("counts attack events emitted by GameSimulation", () => {
    const database = createDatabase(":memory:");
    const runs = new RunRepository(database);
    const events = new EventRepository(database);
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 5.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 3.5, y: 2.5 });

    simulation.playerAttack("guard-a", "pistol");
    seedCompletedRun(runs, events, "capture", simulation.getEvents());

    expect(new AnalyticsService(events).summarize(1).combat).toMatchObject({
      primaryStyle: "gun",
      favoriteCombatZone: "west_corridor",
      gunAttackCount: 1,
      meleeAttackCount: 0,
    });
  });

  it("defaults legacy behavior summaries without combat to stealth combat", () => {
    const parsed = BehaviorSummarySchema.parse({
      corridorScores: { east_corridor: 2 },
      hidingSpotScores: {},
      mostUsedCorridor: "east_corridor",
      favoriteHidingSpot: null,
      sprintRatio: 0,
      frequentSprinting: false,
      detections: 0,
      successfulEscapes: 0,
    });

    expect(parsed.combat).toEqual({
      primaryStyle: "stealth",
      favoriteCombatZone: null,
      gunAttackCount: 0,
      meleeAttackCount: 0,
      knockoutCount: 0,
      killCount: 0,
      bodyDiscoveryCount: 0,
      healingUseCount: 0,
      armedResponseTriggers: 0,
    });
  });
});

describe("combat adaptation validation", () => {
  it("accepts combat adaptations when evidence and target match", () => {
    const validator = new AdaptationValidator();

    expect(validator.validate(decision({}), combatSummary, [])).toEqual(decision({}));
    expect(
      validator.validate(
        decision({
          action: "reduce_ammo_availability",
          target: "global",
          rationale: "The player is relying on guns.",
        }),
        combatSummary,
        [],
      ),
    ).toMatchObject({ action: "reduce_ammo_availability", target: "global" });
    expect(
      validator.validate(
        decision({
          action: "increase_guard_durability",
          target: "global",
          rationale: "Recent combat escalated to kills and discoveries.",
        }),
        combatSummary,
        [],
      ),
    ).toMatchObject({ action: "increase_guard_durability", target: "global" });
  });

  it("rejects combat adaptations at capped levels", () => {
    const validator = new AdaptationValidator();

    expect(() =>
      validator.validate(decision({ action: "place_armed_response" }), combatSummary, [
        decision({ action: "place_armed_response" }),
        decision({ action: "place_armed_response" }),
      ]),
    ).toThrow(/cap/i);
  });

  it("rejects invalid combat adaptation targets", () => {
    const validator = new AdaptationValidator();

    expect(() =>
      validator.validate(decision({ target: "west_corridor" }), combatSummary, []),
    ).toThrow(/favorite combat zone/i);
    expect(() =>
      validator.validate(
        decision({
          action: "reduce_ammo_availability",
          target: "security_room",
        }),
        combatSummary,
        [],
      ),
    ).toThrow(/global/i);
  });
});
