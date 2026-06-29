import { describe, expect, it } from "vitest";
import { GuardFSM, type GuardRuntime } from "../../client/src/game/GuardFSM";
import { isWall, prisonMap } from "../../client/src/game/map";
import type { AppliedAdaptations, PrisonMap } from "../../client/src/game/types";

const adaptations: AppliedAdaptations = {
  active: [],
  patrolFrequency: {},
  inspectHidingSpots: {},
  noiseSensitivity: 0,
  reserveGuardActive: false,
  bodyCheckLevel: 0,
  armedResponseLevel: 0,
  guardCoverLevel: 0,
  guardDurabilityLevel: 0,
  ammoReductionLevel: 0,
  meleeCautionLevel: 0,
};

const cornerMap: PrisonMap = {
  width: 6,
  height: 6,
  tiles: [
    "######",
    "#....#",
    "#.##.#",
    "#....#",
    "#....#",
    "######",
  ],
  corridors: {
    cell_block: { minX: 1, maxX: 4, minY: 1, maxY: 4 },
    central_corridor: { minX: 1, maxX: 4, minY: 1, maxY: 4 },
    storage_room: { minX: 1, maxX: 4, minY: 1, maxY: 4 },
    east_corridor: { minX: 1, maxX: 4, minY: 1, maxY: 4 },
    security_room: { minX: 1, maxX: 4, minY: 1, maxY: 4 },
    exit_hall: { minX: 1, maxX: 4, minY: 1, maxY: 4 },
  },
  key: { id: "key", position: { x: 1.5, y: 1.5 } },
  exit: { id: "exit", position: { x: 4.5, y: 4.5 } },
  pebbles: [],
  weaponPickups: [],
  healingPickups: [],
  doors: [],
  doorKeyCarriers: [],
  hidingSpots: [],
  coverObjects: [],
  setDressingObjects: [],
  patrolRoutes: [
    {
      id: "corner_route",
      points: [
        { x: 1.5, y: 2.5, corridor: "central_corridor" },
        { x: 4.5, y: 2.5, corridor: "central_corridor" },
      ],
    },
  ],
  stationaryGuards: [],
  reserveGuardSpawn: { x: 4.5, y: 4.5 },
};

describe("GuardFSM", () => {
  it("keeps patrol steering out of tile wall corners", () => {
    const fsm = new GuardFSM(cornerMap, adaptations);
    const guard: GuardRuntime = {
      id: "guard-a",
      position: { x: 1.5, y: 2.5 },
      facing: { x: 1, y: 0 },
      state: "patrol",
      routeId: "corner_route",
      routeIndex: 1,
      suspicion: 0,
      captureProgress: 0,
      inspectionTarget: null,
      searchUntilMs: 0,
      chaseUntilMs: 0,
      distractionUntilMs: 0,
      lastSeenPlayerPosition: null,
      combatLockedOnPlayer: false,
    };

    for (let step = 0; step < 300; step += 1) {
      fsm.updatePatrol(guard);
      expect(isWall(cornerMap, guard.position)).toBe(false);
    }

    expect(Math.hypot(guard.position.x - 1.5, guard.position.y - 2.5)).toBeGreaterThan(0.2);
  });

  it("keeps chase movement progressing around the storage room corner", () => {
    const fsm = new GuardFSM(prisonMap, adaptations);
    const playerPosition = { x: 13.4, y: 7.35 };
    const guard: GuardRuntime = {
      id: "guard-a",
      position: { x: 14.5, y: 5.95 },
      facing: { x: 0, y: 1 },
      state: "chase",
      routeId: "west_loop",
      routeIndex: 0,
      suspicion: 1,
      captureProgress: 0,
      inspectionTarget: null,
      searchUntilMs: 0,
      chaseUntilMs: Number.POSITIVE_INFINITY,
      distractionUntilMs: 0,
      lastSeenPlayerPosition: { ...playerPosition },
      combatLockedOnPlayer: true,
    };

    const startDistance = Math.hypot(guard.position.x - playerPosition.x, guard.position.y - playerPosition.y);
    for (let step = 0; step < 600; step += 1) {
      fsm.updateAwareness(guard, false, playerPosition, step * 100);
      expect(isWall(prisonMap, guard.position)).toBe(false);
    }
    const endDistance = Math.hypot(guard.position.x - playerPosition.x, guard.position.y - playerPosition.y);

    expect(endDistance).toBeLessThan(startDistance - 0.5);
  });

  it("backs a chasing guard out of the storage wall and tile-wall seam", () => {
    const fsm = new GuardFSM(prisonMap, adaptations);
    const playerPosition = { x: 14.5, y: 7.35 };
    const guard: GuardRuntime = {
      id: "guard-a",
      position: { x: 13.24, y: 6.42 },
      facing: { x: 1, y: 1 },
      state: "chase",
      routeId: "west_loop",
      routeIndex: 0,
      suspicion: 1,
      captureProgress: 0,
      inspectionTarget: null,
      searchUntilMs: 0,
      chaseUntilMs: Number.POSITIVE_INFINITY,
      distractionUntilMs: 0,
      lastSeenPlayerPosition: { ...playerPosition },
      combatLockedOnPlayer: true,
    };

    const startPosition = { ...guard.position };
    for (let step = 0; step < 120; step += 1) {
      fsm.updateAwareness(guard, false, playerPosition, step * 100);
    }

    expect(Math.hypot(guard.position.x - startPosition.x, guard.position.y - startPosition.y)).toBeGreaterThan(0.08);
    expect(guard.position.x).toBeGreaterThan(13.28);
    expect(guard.position.y).toBeGreaterThan(6.28);
    for (let step = 120; step < 360; step += 1) {
      const before = { ...guard.position };
      fsm.updateAwareness(guard, false, playerPosition, step * 100);
      expect(Math.hypot(guard.position.x - before.x, guard.position.y - before.y)).toBeGreaterThan(0);
    }
  });

  it("routes a chasing guard around the storage wall instead of pressing into the corner", () => {
    const fsm = new GuardFSM(prisonMap, adaptations);
    const playerPosition = { x: 14.5, y: 7.35 };
    const guard: GuardRuntime = {
      id: "guard-a",
      position: { x: 12.5, y: 5.5 },
      facing: { x: 1, y: 1 },
      state: "chase",
      routeId: "west_loop",
      routeIndex: 0,
      suspicion: 1,
      captureProgress: 0,
      inspectionTarget: null,
      searchUntilMs: 0,
      chaseUntilMs: Number.POSITIVE_INFINITY,
      distractionUntilMs: 0,
      lastSeenPlayerPosition: { ...playerPosition },
      combatLockedOnPlayer: true,
    };

    const startDistance = Math.hypot(guard.position.x - playerPosition.x, guard.position.y - playerPosition.y);
    for (let step = 0; step < 900; step += 1) {
      fsm.updateAwareness(guard, false, playerPosition, step * 100);
      expect(isWall(prisonMap, guard.position)).toBe(false);
    }
    const endDistance = Math.hypot(guard.position.x - playerPosition.x, guard.position.y - playerPosition.y);

    expect(endDistance).toBeLessThan(startDistance - 0.8);
    expect(guard.position.y).toBeGreaterThan(6.5);
  });
});
