import { describe, expect, it } from "vitest";
import { createDatabase } from "../../service/src/db";
import { EventRepository } from "../../service/src/repositories/EventRepository";
import { RunRepository } from "../../service/src/repositories/RunRepository";
import { AnalyticsService } from "../../service/src/services/AnalyticsService";
import type { RunEvent, RunOutcome } from "../../shared/contracts";

function event(type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent {
  return { type, atMs: 100, position: { x: 1, y: 1 }, payload };
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
  return run.id;
}

describe("EventRepository", () => {
  it("inserts an entire open-run event buffer and exposes completed runs with events", () => {
    const database = createDatabase(":memory:");
    const runs = new RunRepository(database);
    const events = new EventRepository(database);
    const runId = seedCompletedRun(runs, events, "escape", [
      event("move", { corridorId: "east_corridor" }),
      event("escape"),
    ]);

    expect(events.getRecentCompletedRunsWithEvents(5)).toEqual([
      expect.objectContaining({
        id: runId,
        outcome: "escape",
        events: [
          expect.objectContaining({ type: "move" }),
          expect.objectContaining({ type: "escape" }),
        ],
      }),
    ]);
  });

  it("rejects unknown and already-finalized runs without partially inserting events", () => {
    const database = createDatabase(":memory:");
    const runs = new RunRepository(database);
    const events = new EventRepository(database);
    const run = runs.startRun("{}");
    runs.completeRun(run.id, "capture", 1_000, "complete");

    expect(() => events.insertRunEvents(999, [event("move")])).toThrow(/unknown/i);
    expect(() =>
      events.insertRunEvents(run.id, [event("move"), event("sprint")]),
    ).toThrow(/finalized/i);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM run_events").get(),
    ).toEqual({ count: 0 });
  });

  it("rolls back the whole event buffer when an event is invalid", () => {
    const database = createDatabase(":memory:");
    const runs = new RunRepository(database);
    const events = new EventRepository(database);
    const run = runs.startRun("{}");

    expect(() =>
      events.insertRunEvents(run.id, [
        event("move"),
        { ...event("move"), atMs: -1 },
      ]),
    ).toThrow();
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM run_events").get(),
    ).toEqual({ count: 0 });
  });
});

describe("AnalyticsService", () => {
  it("weights recent east-corridor sprinting over older west usage", () => {
    const database = createDatabase(":memory:");
    const runs = new RunRepository(database);
    const events = new EventRepository(database);
    const analytics = new AnalyticsService(events);

    seedCompletedRun(runs, events, "capture", [
      event("move", { corridorId: "west_corridor" }),
      event("move", { corridorId: "west_corridor" }),
      event("move", { corridorId: "west_corridor" }),
    ]);
    seedCompletedRun(runs, events, "escape", [
      event("move", { corridorId: "east_corridor" }),
      event("sprint", { corridorId: "east_corridor" }),
      event("hide_enter", { hidingSpotId: "locker_2" }),
    ]);
    seedCompletedRun(runs, events, "escape", [
      event("move", { corridorId: "east_corridor" }),
      event("sprint", { corridorId: "east_corridor" }),
      event("hide_enter", { hidingSpotId: "locker_2" }),
      event("detection"),
    ]);

    const summary = analytics.summarize(3);

    expect(summary.mostUsedCorridor).toBe("east_corridor");
    expect(summary.frequentSprinting).toBe(true);
    expect(summary.favoriteHidingSpot).toBe("locker_2");
    expect(summary.detections).toBeGreaterThan(0);
    expect(summary.successfulEscapes).toBeGreaterThan(0);
  });

  it("lowers an old route score when changed behavior becomes recent", () => {
    const database = createDatabase(":memory:");
    const runs = new RunRepository(database);
    const events = new EventRepository(database);
    const analytics = new AnalyticsService(events);

    seedCompletedRun(runs, events, "capture", [
      event("move", { corridorId: "west_corridor" }),
      event("move", { corridorId: "west_corridor" }),
    ]);
    const before = analytics.summarize(10).corridorScores.west_corridor;

    seedCompletedRun(runs, events, "capture", [
      event("move", { corridorId: "east_corridor" }),
      event("move", { corridorId: "east_corridor" }),
    ]);
    seedCompletedRun(runs, events, "capture", [
      event("move", { corridorId: "east_corridor" }),
      event("move", { corridorId: "east_corridor" }),
    ]);

    expect(analytics.summarize(10).corridorScores.west_corridor).toBeLessThan(before);
  });

  it("uses detection corridor ids as route evidence for captured no-movement runs", () => {
    const database = createDatabase(":memory:");
    const runs = new RunRepository(database);
    const events = new EventRepository(database);
    const analytics = new AnalyticsService(events);

    seedCompletedRun(runs, events, "capture", [
      event("detection", { corridorId: "west_corridor", reason: "line_of_sight" }),
      event("capture"),
    ]);

    expect(analytics.summarize(1).mostUsedCorridor).toBe("west_corridor");
  });
});
