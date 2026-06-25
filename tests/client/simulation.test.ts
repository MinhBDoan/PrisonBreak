import { describe, expect, it } from "vitest";
import { prisonMap } from "../../client/src/game/map";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import type { SimulationInput } from "../../client/src/game/types";
import type { NextRunConfig } from "../../shared/contracts";
import { AnalyticsService } from "../../service/src/services/AnalyticsService";
import { createDatabase } from "../../service/src/db";
import { EventRepository } from "../../service/src/repositories/EventRepository";
import { RunRepository } from "../../service/src/repositories/RunRepository";

const noInput: SimulationInput = {
  direction: { x: 0, y: 0 },
  sprint: false,
  interact: false,
};

function stepMany(simulation: GameSimulation, count: number, input = noInput): void {
  for (let i = 0; i < count; i += 1) {
    simulation.step(input);
  }
}

function distanceBetween(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function moveToward(simulation: GameSimulation, x: number, y: number, sprint = false): void {
  for (let i = 0; i < 500; i += 1) {
    const player = simulation.getSnapshot().player.position;
    const dx = x - player.x;
    const dy = y - player.y;
    if (Math.abs(dx) < 0.08 && Math.abs(dy) < 0.08) {
      return;
    }

    const direction =
      Math.abs(dx) > Math.abs(dy)
        ? { x: Math.sign(dx), y: 0 }
        : { x: 0, y: Math.sign(dy) };
    simulation.step({ ...noInput, direction, sprint });
  }
}

describe("GameSimulation", () => {
  it("uses a larger prison wing with roughly triple the original floor area", () => {
    expect(prisonMap.width).toBeGreaterThanOrEqual(24);
    expect(prisonMap.height).toBeGreaterThanOrEqual(12);
    expect(prisonMap.key.position.x).toBeGreaterThan(18);
    expect(prisonMap.exit.position.x).toBeGreaterThan(20);
  });

  it("prevents fixed-step player movement through walls", () => {
    const simulation = new GameSimulation();
    const start = simulation.getSnapshot().player.position;

    stepMany(simulation, 40, { ...noInput, direction: { x: -1, y: 0 } });

    expect(simulation.getSnapshot().player.position.x).toBeGreaterThan(1.44);
    expect(simulation.getSnapshot().player.position.x).toBeLessThanOrEqual(start.x);
  });

  it("prevents player movement through cover objects", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 8.6, y: 4.5 });

    stepMany(simulation, 80, { ...noInput, direction: { x: 1, y: 0 } });

    expect(simulation.getSnapshot().player.position.x).toBeLessThan(9.2);
  });

  it("prevents walking through lockers while still allowing locker interaction", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 11.4, y: 4.5 });

    stepMany(simulation, 80, { ...noInput, direction: { x: -1, y: 0 } });
    expect(simulation.getSnapshot().player.position.x).toBeGreaterThan(10.9);
    expect(distanceBetween(simulation.getSnapshot().player.position, prisonMap.hidingSpots[0].position)).toBeLessThanOrEqual(0.65);

    simulation.step({ ...noInput, interact: true });
    expect(simulation.getSnapshot().player.hiddenIn).toBe("locker_alpha");
  });

  it("prevents guards from patrolling through cover objects", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 8.6, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });

    stepMany(simulation, 260);

    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-1")?.position.x).toBeLessThan(9.25);
  });

  it("keeps walking and sprinting player movement readable", () => {
    const walking = new GameSimulation();
    const walkStart = walking.getSnapshot().player.position;
    walking.step({ ...noInput, direction: { x: 1, y: 0 } });
    const walkDistance = distanceBetween(walkStart, walking.getSnapshot().player.position);

    const sprinting = new GameSimulation();
    const sprintStart = sprinting.getSnapshot().player.position;
    sprinting.step({ direction: { x: 1, y: 0 }, sprint: true, interact: false });
    const sprintDistance = distanceBetween(sprintStart, sprinting.getSnapshot().player.position);

    expect(walkDistance).toBeCloseTo(0.018333, 3);
    expect(sprintDistance).toBeCloseTo(0.033333, 3);
    expect(sprintDistance).toBeGreaterThan(walkDistance);
    expect(sprintDistance).toBeLessThan(0.04);
  });

  it("collects the security-room key through an objective interaction", () => {
    const simulation = new GameSimulation();

    simulation.setPlayerPosition(prisonMap.key.position);
    simulation.step({ ...noInput, interact: true });

    expect(simulation.getSnapshot().objectives.hasKey).toBe(true);
    expect(simulation.getEvents().some((event) => event.type === "key_collected")).toBe(true);
  });

  it("unlocks the exit and completes an escape when the player has the key", () => {
    const simulation = new GameSimulation();

    simulation.setPlayerPosition(prisonMap.key.position);
    simulation.step({ ...noInput, interact: true });
    simulation.setPlayerPosition(prisonMap.exit.position);
    simulation.step({ ...noInput, interact: true });

    const snapshot = simulation.getSnapshot();
    expect(snapshot.objectives.exitUnlocked).toBe(true);
    expect(snapshot.completed?.outcome).toBe("escape");
    expect(simulation.getEvents().some((event) => event.type === "escape")).toBe(true);
  });

  it("blocks line-of-sight detection with cover walls", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 4.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 1.5, y: 10.5 });
    stepMany(simulation, 30);

    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a")?.suspicion).toBe(0);
  });

  it("blocks line-of-sight detection behind cover objects", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 8.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 10.8, y: 4.5 });
    stepMany(simulation, 30);

    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a")?.suspicion).toBe(0);
  });

  it("detects players peeking around the side of cover objects", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 8.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 10.8, y: 5.5 });
    stepMany(simulation, 10);

    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a")?.suspicion).toBeGreaterThan(0);
  });

  it("transitions from suspicion to chase after sustained line-of-sight", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 5.5, y: 2.5 });
    stepMany(simulation, 60);

    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a")?.state).toBe("chase");
  });

  it("keeps chasing for six seconds toward the last seen position after losing sight", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 5.5, y: 2.5 });
    stepMany(simulation, 60);
    const chasingGuard = simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a");
    expect(chasingGuard?.state).toBe("chase");

    simulation.setPlayerPosition({ x: 1.5, y: 10.5 });
    stepMany(simulation, 59);
    const persistentGuard = simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a");
    expect(persistentGuard?.state).toBe("chase");

    stepMany(simulation, 2);
    const returnedGuard = simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a");
    expect(returnedGuard?.state).toBe("return");
  });

  it("chases to the last seen position even when sight is lost before full capture chase", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 5.5, y: 2.5 });
    stepMany(simulation, 10);
    const alertedGuard = simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a");
    expect(alertedGuard?.state).toBe("investigate");

    simulation.setPlayerPosition({ x: 1.5, y: 10.5 });
    stepMany(simulation, 1);
    const chasingGuard = simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a");
    expect(chasingGuard?.state).toBe("chase");

    stepMany(simulation, 59);
    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a")?.state).toBe("chase");

    stepMany(simulation, 2);
    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a")?.state).toBe("return");
  });

  it("keeps chasing briefly toward the last heard noise position", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 5.65, y: 4.5 }, facing: { x: 1, y: 0 } }],
      nextRunConfig: {
        adaptations: [
          {
            action: "increase_noise_sensitivity",
            target: "global",
            level: 2,
            rationale: "Frequent sprinting.",
          },
        ],
      },
    });

    simulation.step({ direction: { x: 1, y: 0 }, sprint: true, interact: false });
    expect(simulation.getSnapshot().guards[0].state).toBe("chase");

    stepMany(simulation, 19);
    expect(simulation.getSnapshot().guards[0].state).toBe("chase");

    stepMany(simulation, 12);
    expect(simulation.getSnapshot().guards[0].state).toBe("return");
  });

  it("keeps players outside the shortened guard vision range unseen", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 6.25, y: 2.5 });
    stepMany(simulation, 30);

    const guard = simulation.getSnapshot().guards.find((candidate) => candidate.id === "guard-a");
    expect(guard?.suspicion).toBe(0);
  });

  it("keeps sustained detection as chase pressure without capture completion", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 5.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 6.5, y: 2.5 });
    stepMany(simulation, 390);

    const guard = simulation.getSnapshot().guards.find((candidate) => candidate.id === "guard-a");
    expect(simulation.getSnapshot().completed?.outcome).not.toBe("capture");
    expect(simulation.getEvents().some((event) => event.type === "capture")).toBe(false);
    expect(guard?.state).toBe("chase");
    expect(guard?.captureProgress).toBeGreaterThan(0);
    expect(simulation.getPlayerHealth().hp).toBeLessThan(100);
  });

  it("emits louder sprint noise events than walking", () => {
    const walking = new GameSimulation();
    walking.step({ ...noInput, direction: { x: 1, y: 0 } });

    const sprinting = new GameSimulation();
    sprinting.step({ direction: { x: 1, y: 0 }, sprint: true, interact: false });

    const walkNoise = walking.getEvents().find((event) => event.type === "noise");
    const sprintNoise = sprinting.getEvents().find((event) => event.type === "noise");
    expect(sprintNoise?.payload.radius).toBeGreaterThan(walkNoise?.payload.radius as number);
    expect(sprinting.getEvents().some((event) => event.type === "sprint")).toBe(true);
  });

  it("emits movement corridor ids that feed analytics route scoring", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 18.5, y: 5.5 });

    simulation.step({ ...noInput, direction: { x: 1, y: 0 } });
    simulation.step({ direction: { x: 1, y: 0 }, sprint: true, interact: false });

    const routeEvents = simulation
      .getEvents()
      .filter((event) => event.type === "move" || event.type === "sprint");
    expect(routeEvents).toHaveLength(2);
    expect(routeEvents.map((event) => event.payload.corridorId)).toEqual([
      "east_corridor",
      "east_corridor",
    ]);

    const database = createDatabase(":memory:");
    const runs = new RunRepository(database);
    const events = new EventRepository(database);
    const run = runs.startRun("{}");
    events.insertRunEvents(run.id, simulation.getEvents());
    runs.completeRun(run.id, "capture", 1_000, "complete-corridor-route");
    const analytics = new AnalyticsService(events);

    expect(analytics.summarize(1).mostUsedCorridor).toBe("east_corridor");
  });

  it("keeps baseline and learned patrol movement readable", () => {
    const baseline = new GameSimulation();
    const baselineStart = baseline.getSnapshot().guards[0].position;
    stepMany(baseline, 30);
    const baselineDistance = distanceBetween(baselineStart, baseline.getSnapshot().guards[0].position);

    const adapted = new GameSimulation({
      nextRunConfig: {
        adaptations: [
          {
            action: "increase_corridor_patrol",
            target: "central_corridor",
            level: 3,
            rationale: "Central corridor overuse.",
          },
        ],
      },
    });
    const adaptedStart = adapted.getSnapshot().guards[0].position;
    stepMany(adapted, 30);
    const adaptedDistance = distanceBetween(adaptedStart, adapted.getSnapshot().guards[0].position);

    expect(baselineDistance).toBeGreaterThan(0.08);
    expect(baselineDistance).toBeLessThan(0.15);
    expect(adaptedDistance).toBeGreaterThan(baselineDistance);
    expect(adaptedDistance).toBeLessThan(0.19);
  });

  it("emits detection corridor ids that feed analytics when the player is captured without moving", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 9, y: 5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 11, y: 5.8 });

    stepMany(simulation, 150);

    const detection = simulation.getEvents().find((event) => event.type === "detection");
    expect(detection?.payload.corridorId).toBe("central_corridor");

    const database = createDatabase(":memory:");
    const runs = new RunRepository(database);
    const events = new EventRepository(database);
    const run = runs.startRun("{}");
    events.insertRunEvents(run.id, simulation.getEvents());
    runs.completeRun(run.id, "capture", 1_000, "complete-detection-route");
    const analytics = new AnalyticsService(events);

    expect(analytics.summarize(1).mostUsedCorridor).toBe("central_corridor");
  });

  it("makes noise-sensitive guards react to adapted sprinting from farther away", () => {
    const guardOverride = {
      id: "guard-1",
      position: { x: 5.65, y: 4.5 },
      facing: { x: 1, y: 0 },
    };

    const walking = new GameSimulation({ guardOverrides: [guardOverride] });
    walking.step({ ...noInput, direction: { x: 1, y: 0 } });

    const baselineSprint = new GameSimulation({ guardOverrides: [guardOverride] });
    baselineSprint.step({ direction: { x: 1, y: 0 }, sprint: true, interact: false });

    const adaptedSprint = new GameSimulation({
      guardOverrides: [guardOverride],
      nextRunConfig: {
        adaptations: [
          {
            action: "increase_noise_sensitivity",
            target: "global",
            level: 2,
            rationale: "Frequent sprinting.",
          },
        ],
      },
    });
    adaptedSprint.step({ direction: { x: 1, y: 0 }, sprint: true, interact: false });

    expect(walking.getSnapshot().guards[0].state).toBe("patrol");
    expect(baselineSprint.getSnapshot().guards[0].state).toBe("patrol");
    expect(adaptedSprint.getSnapshot().guards[0].state).toBe("chase");
    expect(adaptedSprint.getSnapshot().guards[0].suspicion).toBeGreaterThan(
      baselineSprint.getSnapshot().guards[0].suspicion,
    );
  });

  it("conceals the player from sight while inside a locker", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 4.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition(prisonMap.hidingSpots[0].position);
    simulation.step({ ...noInput, interact: true });
    stepMany(simulation, 60);

    const snapshot = simulation.getSnapshot();
    expect(snapshot.player.hiddenIn).toBe(prisonMap.hidingSpots[0].id);
    expect(snapshot.guards.find((guard) => guard.id === "guard-a")?.suspicion).toBe(0);
  });

  it("applies learned locker inspection from next-run config", () => {
    const config: NextRunConfig = {
      adaptations: [
        {
          action: "inspect_hiding_spot",
          target: "locker_alpha",
          level: 1,
          rationale: "Player repeatedly hid in locker alpha.",
        },
      ],
    };
    const simulation = new GameSimulation({ nextRunConfig: config });

    stepMany(simulation, 260);

    expect(
      simulation
        .getEvents()
        .some((event) => event.type === "detection" && event.payload.reason === "hiding_inspection"),
    ).toBe(true);
    expect(simulation.getSnapshot().completed?.outcome).not.toBe("capture");
  });

  it("does not complete as capture when an inspected locker contains the player", () => {
    const config: NextRunConfig = {
      adaptations: [
        {
          action: "inspect_hiding_spot",
          target: "locker_alpha",
          level: 1,
          rationale: "Player repeatedly hid in locker alpha.",
        },
      ],
    };
    const simulation = new GameSimulation({ nextRunConfig: config });
    simulation.setPlayerPosition(prisonMap.hidingSpots[0].position);
    simulation.step({ ...noInput, interact: true });

    stepMany(simulation, 260);

    expect(simulation.getSnapshot().player.hiddenIn).toBe("locker_alpha");
    expect(simulation.getSnapshot().completed?.outcome).not.toBe("capture");
    expect(
      simulation
        .getEvents()
        .some((event) => event.type === "detection" && event.payload.reason === "hiding_inspection"),
    ).toBe(true);
    expect(simulation.getEvents().some((event) => event.type === "capture")).toBe(false);
  });

  it("applies patrol, noise, and reserve guard adaptations", () => {
    const simulation = new GameSimulation({
      nextRunConfig: {
        adaptations: [
          {
            action: "increase_corridor_patrol",
            target: "east_corridor",
            level: 2,
            rationale: "East corridor overuse.",
          },
          {
            action: "increase_noise_sensitivity",
            target: "global",
            level: 2,
            rationale: "Frequent sprinting.",
          },
          {
            action: "activate_reserve_guard",
            target: "exit",
            level: 1,
            rationale: "Repeated escapes.",
          },
        ],
      },
    });

    const snapshot = simulation.getSnapshot();
    expect(snapshot.guards.some((guard) => guard.id === "reserve")).toBe(true);
    expect(snapshot.adaptations.patrolFrequency.east_corridor).toBe(2);

    simulation.step({ direction: { x: 1, y: 0 }, sprint: true, interact: false });
    const noise = simulation.getEvents().find((event) => event.type === "noise");
    expect(noise?.payload.radius).toBeGreaterThan(5);
  });

  it("can complete the key-to-exit objective loop", () => {
    const simulation = new GameSimulation();

    simulation.setPlayerPosition(prisonMap.key.position);
    simulation.step({ ...noInput, interact: true });
    simulation.setPlayerPosition(prisonMap.exit.position);
    simulation.step({ ...noInput, interact: true });

    expect(simulation.getSnapshot().completed?.outcome).toBe("escape");
  });
});
