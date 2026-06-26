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

  it("exposes the active authored level in the snapshot", () => {
    const simulation = new GameSimulation();
    const snapshot = simulation.getSnapshot();

    expect(snapshot.level).toEqual({
      id: "cell_block",
      name: "Cell Block",
      section: "Cell Block to Security Room",
      nextLevelId: "security_wing",
    });
  });

  it("frames level one as a cell block route into the security room", () => {
    expect(prisonMap.corridors).toHaveProperty("cell_block");
    expect(prisonMap.corridors).toHaveProperty("security_room");
    expect(prisonMap.key.id).toBe("master_key");
    expect(prisonMap.doors.some((door) => door.id === "security_room_door" && door.locked)).toBe(true);
  });

  it("prevents fixed-step player movement through walls", () => {
    const simulation = new GameSimulation();
    const start = simulation.getSnapshot().player.position;

    stepMany(simulation, 40, { ...noInput, direction: { x: -1, y: 0 } });

    expect(simulation.getSnapshot().player.position.x).toBeGreaterThan(1.3);
    expect(simulation.getSnapshot().player.position.x).toBeLessThanOrEqual(start.x);
  });

  it("lets the player hug wall tiles without entering them", () => {
    const simulation = new GameSimulation();

    stepMany(simulation, 40, { ...noInput, direction: { x: -1, y: 0 } });

    const position = simulation.getSnapshot().player.position;
    expect(position.x).toBeLessThan(1.4);
    expect(position.x).toBeGreaterThan(1.3);
  });

  it("prevents player movement through cover objects", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 8.6, y: 4.5 });

    stepMany(simulation, 80, { ...noInput, direction: { x: 1, y: 0 } });

    expect(simulation.getSnapshot().player.position.x).toBeLessThan(9.2);
  });

  it("slides player movement along cover edges when pressing into a solid object", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 8.92, y: 4.5 });

    stepMany(simulation, 40, { ...noInput, direction: { x: 1, y: 1 } });

    const position = simulation.getSnapshot().player.position;
    expect(position.x).toBeLessThan(9.2);
    expect(position.y).toBeGreaterThan(4.8);
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

  it("allows locker interaction from its blocked top and bottom edges", () => {
    const fromBottom = new GameSimulation();
    fromBottom.setPlayerPosition({ x: 10.5, y: 5.4 });
    stepMany(fromBottom, 80, { ...noInput, direction: { x: 0, y: -1 } });
    fromBottom.step({ ...noInput, interact: true });
    expect(fromBottom.getSnapshot().player.hiddenIn).toBe("locker_alpha");

    const fromTop = new GameSimulation();
    fromTop.setPlayerPosition({ x: 10.5, y: 3.6 });
    stepMany(fromTop, 80, { ...noInput, direction: { x: 0, y: 1 } });
    fromTop.step({ ...noInput, interact: true });
    expect(fromTop.getSnapshot().player.hiddenIn).toBe("locker_alpha");
  });

  it("places players at a free spot around a locker when exiting near blocked cover", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 11.4, y: 4.5 });

    stepMany(simulation, 80, { ...noInput, direction: { x: -1, y: 0 } });
    simulation.step({ ...noInput, interact: true });
    simulation.step({ ...noInput, interact: true });
    const exitedPosition = simulation.getSnapshot().player.position;

    expect(simulation.getSnapshot().player.hiddenIn).toBeNull();
    expect(distanceBetween(exitedPosition, prisonMap.hidingSpots[0].position)).toBeGreaterThan(0.65);

    stepMany(simulation, 20, { ...noInput, direction: { x: 0, y: -1 } });

    expect(distanceBetween(simulation.getSnapshot().player.position, exitedPosition)).toBeGreaterThan(0.1);
  });

  it("exits a locker on the side matching the held movement direction when clear", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 11.4, y: 4.5 });

    stepMany(simulation, 80, { ...noInput, direction: { x: -1, y: 0 } });
    simulation.step({ ...noInput, interact: true });
    simulation.step({ ...noInput, direction: { x: 0, y: 1 }, interact: true });

    const exitedPosition = simulation.getSnapshot().player.position;
    expect(simulation.getSnapshot().player.hiddenIn).toBeNull();
    expect(exitedPosition.y).toBeGreaterThan(prisonMap.hidingSpots[0].position.y);
    expect(Math.abs(exitedPosition.x - prisonMap.hidingSpots[0].position.x)).toBeLessThan(0.1);
  });

  it("falls back to a free locker exit side when the requested direction is blocked", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 11.4, y: 4.5 });

    stepMany(simulation, 80, { ...noInput, direction: { x: -1, y: 0 } });
    simulation.step({ ...noInput, interact: true });
    simulation.step({ ...noInput, direction: { x: -1, y: 0 }, interact: true });

    const exitedPosition = simulation.getSnapshot().player.position;
    expect(simulation.getSnapshot().player.hiddenIn).toBeNull();
    expect(exitedPosition.x).toBeGreaterThan(9.65);
    expect(distanceBetween(exitedPosition, prisonMap.hidingSpots[0].position)).toBeGreaterThan(0.65);
  });

  it("prevents guards from patrolling through cover objects", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 8.6, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });

    stepMany(simulation, 260);

    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-1")?.position.x).toBeLessThan(9.25);
  });

  it("lets blocked patrol guards steer around cover objects instead of getting stuck", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 8.6, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });

    stepMany(simulation, 700);

    const guard = simulation.getSnapshot().guards.find((candidate) => candidate.id === "guard-1");
    expect(guard?.position.x).toBeGreaterThan(9.25);
    expect(guard?.routeIndex).toBe(1);
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

  it("collects the master key through an objective interaction", () => {
    const simulation = new GameSimulation();

    simulation.setPlayerPosition(prisonMap.key.position);
    simulation.step({ ...noInput, interact: true });

    expect(simulation.getSnapshot().objectives.hasKey).toBe(true);
    expect(simulation.getEvents().some((event) => event.type === "key_collected")).toBe(true);
  });

  it("keeps the locked security door closed until the player has the guard key", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 18.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 17.5, y: 4.35 });

    stepMany(simulation, 40, { ...noInput, direction: { x: 0, y: -1 } });
    expect(simulation.getSnapshot().player.position.y).toBeGreaterThan(4.2);
    expect(simulation.getSnapshot().doors.find((door) => door.id === "security_room_door")).toMatchObject({
      open: false,
      unlocked: false,
    });

    simulation.setPlayerPosition({ x: 17.5, y: 4.55 });
    simulation.step({ ...noInput, interact: true });
    expect(simulation.getSnapshot().doors.find((door) => door.id === "security_room_door")?.open).toBe(false);
  });

  it("seals the security room so the master key cannot be reached before unlocking the door", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 18.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 22.0, y: 4.55 });

    stepMany(simulation, 80, { ...noInput, direction: { x: 0, y: -1 } });

    expect(simulation.getSnapshot().player.position.y).toBeGreaterThan(4.2);
    expect(simulation.getSnapshot().objectives.hasKey).toBe(false);

    simulation.setPlayerPosition({ x: 23.8, y: 4.55 });
    stepMany(simulation, 80, { ...noInput, direction: { x: 0, y: -1 } });

    expect(simulation.getSnapshot().player.position.y).toBeGreaterThan(4.2);
    expect(simulation.getSnapshot().objectives.hasKey).toBe(false);
  });

  it("drops a guard-held general key and lets that key unlock the security room door", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 18.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ ...noInput, interact: true });
    simulation.setPlayerPosition({ x: 18.5, y: 4.0 });

    simulation.playerAttack("guard-1", "pistol");
    simulation.playerAttack("guard-1", "pistol");

    const droppedKey = simulation.getSnapshot().doorKeyPickups.find((pickup) => pickup.keyId === "general_key");
    expect(droppedKey).toMatchObject({ keyId: "general_key", collected: false });
    expect(droppedKey?.position.x).toBeCloseTo(18.5, 1);
    expect(droppedKey?.position.y).toBeCloseTo(4.5, 1);

    simulation.setPlayerPosition({ x: 18.5, y: 4.5 });
    simulation.step({ ...noInput, interact: true });
    expect(simulation.getSnapshot().player.doorKeys).toContain("general_key");

    simulation.setPlayerPosition({ x: 17.5, y: 4.55 });
    simulation.step({ ...noInput, interact: true });
    expect(simulation.getSnapshot().doors.find((door) => door.id === "security_room_door")).toMatchObject({
      open: true,
      unlocked: true,
    });
  });

  it("drops the general key from a default map guard", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ ...noInput, interact: true });
    simulation.setPlayerPosition({ x: 8.5, y: 4.0 });

    simulation.playerAttack("guard-1", "pistol");
    simulation.playerAttack("guard-1", "pistol");

    expect(simulation.getSnapshot().doorKeyPickups).toContainEqual(
      expect.objectContaining({ keyId: "general_key", collected: false }),
    );
  });

  it("keeps the east patrol outside the locked security room route", () => {
    const simulation = new GameSimulation();
    const eastRoute = prisonMap.patrolRoutes.find((route) => route.id === "east_loop");

    expect(eastRoute?.points.some((point) => point.corridor === "security_room")).toBe(false);

    stepMany(simulation, 1200);

    const guard = simulation.getSnapshot().guards.find((candidate) => candidate.id === "guard-2");
    expect(guard?.position.y).toBeGreaterThanOrEqual(4);
    expect(guard?.routeId).toBe("east_loop");
  });

  it("lets unlocked doors toggle open and closed", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 14.5, y: 6.45 });

    simulation.step({ ...noInput, interact: true });
    expect(simulation.getSnapshot().doors.find((door) => door.id === "central_service_door")?.open).toBe(true);

    simulation.step({ ...noInput, interact: true });
    expect(simulation.getSnapshot().doors.find((door) => door.id === "central_service_door")?.open).toBe(false);
  });

  it("keeps doors open when the player is standing in the doorway", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 14.5, y: 6.45 });
    simulation.step({ ...noInput, interact: true });
    expect(simulation.getSnapshot().doors.find((door) => door.id === "central_service_door")?.open).toBe(true);

    simulation.setPlayerPosition({ x: 14.5, y: 5.95 });
    simulation.step({ ...noInput, interact: true });

    expect(simulation.getSnapshot().doors.find((door) => door.id === "central_service_door")?.open).toBe(true);
    expect(simulation.getEvents().some((event) => event.type === "door_closed")).toBe(false);
  });

  it("lets guards open unlocked doors instead of walking through closed doors", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 14.5, y: 6.45 }, facing: { x: 0, y: -1 } }],
    });

    stepMany(simulation, 1);

    expect(simulation.getSnapshot().doors.find((door) => door.id === "central_service_door")?.open).toBe(true);
    expect(simulation.getEvents()).toContainEqual(
      expect.objectContaining({ type: "door_opened", payload: expect.objectContaining({ doorId: "central_service_door" }) }),
    );
  });

  it("keeps guards without a key from moving through locked doors", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 17.5, y: 4.35 }, facing: { x: 0, y: -1 } }],
    });

    stepMany(simulation, 120, { ...noInput });

    const guard = simulation.getSnapshot().guards.find((candidate) => candidate.id === "guard-a");
    expect(guard?.position.y).toBeGreaterThan(4.2);
    expect(simulation.getSnapshot().doors.find((door) => door.id === "security_room_door")?.open).toBe(false);
  });

  it("lets a key-carrying guard unlock and open a locked door", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 17.5, y: 4.35 }, facing: { x: 0, y: -1 } }],
    });

    stepMany(simulation, 1);

    expect(simulation.getSnapshot().doors.find((door) => door.id === "security_room_door")).toMatchObject({
      open: true,
      unlocked: true,
    });
    expect(simulation.getEvents()).toContainEqual(
      expect.objectContaining({ type: "door_unlocked", payload: expect.objectContaining({ doorId: "security_room_door" }) }),
    );
  });

  it("does not unlock the exit with only the general key", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 18.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ ...noInput, interact: true });
    simulation.setPlayerPosition({ x: 18.5, y: 4.0 });
    simulation.playerAttack("guard-1", "pistol");
    simulation.playerAttack("guard-1", "pistol");
    simulation.setPlayerPosition({ x: 18.5, y: 4.5 });
    simulation.step({ ...noInput, interact: true });

    simulation.setPlayerPosition(prisonMap.exit.position);
    simulation.step({ ...noInput, interact: true });

    expect(simulation.getSnapshot().player.doorKeys).toContain("general_key");
    expect(simulation.getSnapshot().objectives.exitUnlocked).toBe(false);
    expect(simulation.getSnapshot().completed).toBeNull();
  });

  it("unlocks the exit and completes an escape when the player has the master key", () => {
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

  it("completes level one as a next-level transition", () => {
    const simulation = new GameSimulation();

    simulation.setPlayerPosition(prisonMap.key.position);
    simulation.step({ ...noInput, interact: true });
    simulation.setPlayerPosition(prisonMap.exit.position);
    simulation.step({ ...noInput, interact: true });

    expect(simulation.getSnapshot().completed).toMatchObject({ outcome: "escape" });
    expect(simulation.getSnapshot().level.nextLevelId).toBe("security_wing");
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
    stepMany(simulation, 80);

    const guard = simulation.getSnapshot().guards.find((candidate) => candidate.id === "guard-a");
    expect(simulation.getSnapshot().completed).toBeNull();
    expect(simulation.getEvents().some((event) => event.type === "capture")).toBe(false);
    expect(guard?.state).toBe("chase");
    expect(guard?.captureProgress).toBeGreaterThan(0);
    expect(simulation.getPlayerHealth().hp).toBeGreaterThan(0);
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

  it("lets the player pick up a nearby pebble", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);

    simulation.step({ ...noInput, interact: true });

    const snapshot = simulation.getSnapshot();
    expect(snapshot.player.pebbles).toBe(1);
    expect(snapshot.pebbles.find((pebble) => pebble.id === prisonMap.pebbles[0].id)?.collected).toBe(true);
  });

  it("throws a carried pebble toward a nearby target and emits landing noise", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ ...noInput, interact: true });

    simulation.step({ ...noInput, throwTarget: { x: 5, y: 5 } });
    stepMany(simulation, 3);

    const snapshot = simulation.getSnapshot();
    const noise = simulation.getEvents().find(
      (event) => event.type === "noise" && event.payload.source === "pebble",
    );
    expect(snapshot.player.pebbles).toBe(0);
    expect(noise?.position).toEqual({ x: 5, y: 5 });
    expect(noise?.payload.radius).toBeGreaterThan(3);
  });

  it("clamps pebble throws to a maximum range from the player", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ ...noInput, interact: true });
    const player = simulation.getSnapshot().player.position;

    simulation.step({ ...noInput, throwTarget: { x: player.x + 20, y: player.y } });
    stepMany(simulation, 3);

    const noise = simulation.getEvents().find(
      (event) => event.type === "noise" && event.payload.source === "pebble",
    );
    expect(noise?.position.x).toBeCloseTo(player.x + 4, 3);
    expect(noise?.position.y).toBeCloseTo(player.y, 3);
  });

  it("does not throw pebbles through walls", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ ...noInput, interact: true });
    simulation.setPlayerPosition({ x: 10.5, y: 2.5 });

    simulation.step({ ...noInput, throwTarget: { x: 14.5, y: 2.5 } });

    expect(simulation.getSnapshot().player.pebbles).toBe(1);
    expect(
      simulation.getEvents().some((event) => event.type === "noise" && event.payload.source === "pebble"),
    ).toBe(false);
  });

  it("allows pebble throws over cover objects", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ ...noInput, interact: true });
    simulation.setPlayerPosition({ x: 8.6, y: 4.5 });

    simulation.step({ ...noInput, throwTarget: { x: 11.3, y: 4.5 } });
    stepMany(simulation, 3);

    const noise = simulation.getEvents().find(
      (event) => event.type === "noise" && event.payload.source === "pebble",
    );
    expect(simulation.getSnapshot().player.pebbles).toBe(0);
    expect(noise?.position).toEqual({ x: 11.3, y: 4.5 });
  });

  it("allows pebble throws to land on cover objects and ripple there", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ ...noInput, interact: true });
    simulation.setPlayerPosition({ x: 8.6, y: 4.5 });

    simulation.step({ ...noInput, throwTarget: prisonMap.coverObjects[0].position });
    stepMany(simulation, 3);

    const noise = simulation.getEvents().find(
      (event) => event.type === "noise" && event.payload.source === "pebble",
    );
    expect(simulation.getSnapshot().player.pebbles).toBe(0);
    expect(noise?.position).toEqual(prisonMap.coverObjects[0].position);
  });

  it("distracts guards toward a thrown pebble landing point", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 7.5, y: 5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ ...noInput, interact: true });

    simulation.step({ ...noInput, throwTarget: { x: 6, y: 5 } });
    stepMany(simulation, 3);

    const guard = simulation.getSnapshot().guards.find((candidate) => candidate.id === "guard-a");
    expect(guard?.state).toBe("chase");
    expect(guard?.suspicion).toBeGreaterThan(0);
  });

  it("distracts guards only after the thrown pebble lands", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 7.5, y: 5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ ...noInput, interact: true });

    simulation.step({ ...noInput, throwTarget: { x: 6, y: 5 } });

    expect(simulation.getSnapshot().player.pebbles).toBe(0);
    expect(simulation.getSnapshot().guards[0].state).not.toBe("chase");
    expect(
      simulation.getEvents().some((event) => event.type === "noise" && event.payload.source === "pebble"),
    ).toBe(false);

    stepMany(simulation, 2);
    expect(simulation.getSnapshot().guards[0].state).not.toBe("chase");

    stepMany(simulation, 1);
    expect(simulation.getSnapshot().guards[0].state).toBe("chase");
    expect(
      simulation.getEvents().some((event) => event.type === "noise" && event.payload.source === "pebble"),
    ).toBe(true);
  });

  it("keeps guards distracted by pebble noise for three seconds", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 7.5, y: 5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ ...noInput, interact: true });

    simulation.step({ ...noInput, throwTarget: { x: 6, y: 5 } });
    stepMany(simulation, 3);
    stepMany(simulation, 29);

    expect(simulation.getSnapshot().guards[0].state).toBe("chase");

    stepMany(simulation, 2);

    expect(simulation.getSnapshot().guards[0].state).toBe("return");
  });

  it("moves guards noticeably toward pebble noise during the distraction window", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 7.5, y: 5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ ...noInput, interact: true });

    simulation.step({ ...noInput, throwTarget: { x: 6, y: 5 } });
    stepMany(simulation, 13);

    expect(simulation.getSnapshot().guards[0].position.x).toBeLessThan(7.25);
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
