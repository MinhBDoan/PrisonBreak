import { describe, expect, it } from "vitest";
import { prisonMap } from "../../client/src/game/map";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import type { SimulationInput } from "../../client/src/game/types";
import type { NextRunConfig } from "../../shared/contracts";

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

function moveToward(simulation: GameSimulation, x: number, y: number): void {
  for (let i = 0; i < 240; i += 1) {
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
    simulation.step({ ...noInput, direction });
  }
}

describe("GameSimulation", () => {
  it("prevents fixed-step player movement through walls", () => {
    const simulation = new GameSimulation();
    const start = simulation.getSnapshot().player.position;

    stepMany(simulation, 40, { ...noInput, direction: { x: -1, y: 0 } });

    expect(simulation.getSnapshot().player.position.x).toBeCloseTo(start.x, 3);
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

    simulation.setPlayerPosition({ x: 4.5, y: 4.5 });
    stepMany(simulation, 30);

    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a")?.suspicion).toBe(0);
  });

  it("transitions from suspicion to chase after sustained line-of-sight", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 6.5, y: 2.5 });
    stepMany(simulation, 60);

    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a")?.state).toBe("chase");
  });

  it("captures the player after the chase threshold is sustained", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 5.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });

    simulation.setPlayerPosition({ x: 6.5, y: 2.5 });
    stepMany(simulation, 150);

    expect(simulation.getSnapshot().completed?.outcome).toBe("capture");
    expect(simulation.getEvents().some((event) => event.type === "capture")).toBe(true);
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

  it("can complete a deterministic escape route", () => {
    const simulation = new GameSimulation();

    moveToward(simulation, prisonMap.key.position.x, prisonMap.key.position.y);
    simulation.step({ ...noInput, interact: true });
    moveToward(simulation, prisonMap.exit.position.x, prisonMap.exit.position.y);
    simulation.step({ ...noInput, interact: true });

    expect(simulation.getSnapshot().completed?.outcome).toBe("escape");
  });
});
