import { corridorAt } from "./map";
import type {
  AppliedAdaptations,
  GuardState,
  GuardStateSnapshot,
  HidingSpot,
  PatrolPoint,
  PrisonMap,
  Vector,
} from "./types";

const suspicionRate = 0.04;
const suspicionDecay = 0.025;
const chaseThreshold = 1;
const captureRate = 0.012;
const guardSpeed = 0.035;
const searchDurationMs = 900;

function cloneVector(vector: Vector): Vector {
  return { x: vector.x, y: vector.y };
}

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

function moveToward(position: Vector, target: Vector, speed: number): { position: Vector; reached: boolean; facing: Vector } {
  const delta = { x: target.x - position.x, y: target.y - position.y };
  const distance = Math.hypot(delta.x, delta.y);
  if (distance <= speed) {
    return { position: cloneVector(target), reached: true, facing: normalize(delta) };
  }
  const facing = normalize(delta);
  return {
    position: { x: position.x + facing.x * speed, y: position.y + facing.y * speed },
    reached: false,
    facing,
  };
}

export type GuardRuntime = GuardStateSnapshot & {
  searchUntilMs: number;
};

export class GuardFSM {
  static createInitialGuards(map: PrisonMap, adaptations: AppliedAdaptations): GuardRuntime[] {
    const guards: GuardRuntime[] = map.patrolRoutes.map((route, index) => ({
      id: `guard-${index + 1}`,
      position: cloneVector(route.points[0]),
      facing: { x: 1, y: 0 },
      state: "patrol",
      routeId: route.id,
      routeIndex: 0,
      suspicion: 0,
      captureProgress: 0,
      inspectionTarget: null,
      searchUntilMs: 0,
    }));

    if (adaptations.reserveGuardActive) {
      guards.push({
        id: "reserve",
        position: cloneVector(map.reserveGuardSpawn),
        facing: { x: -1, y: 0 },
        state: "patrol",
        routeId: map.patrolRoutes[1].id,
        routeIndex: 2,
        suspicion: 0,
        captureProgress: 0,
        inspectionTarget: null,
        searchUntilMs: 0,
      });
    }

    return guards;
  }

  constructor(
    private readonly map: PrisonMap,
    private readonly adaptations: AppliedAdaptations,
  ) {}

  updatePatrol(guard: GuardRuntime): void {
    if (guard.state !== "patrol" && guard.state !== "return") {
      return;
    }

    const route = this.map.patrolRoutes.find((candidate) => candidate.id === guard.routeId);
    if (!route) {
      return;
    }

    const target = this.nextTarget(route.points, guard);
    const speed = guardSpeed * this.patrolMultiplier(target);
    const moved = moveToward(guard.position, target, speed);
    guard.position = moved.position;
    if (moved.facing.x !== 0 || moved.facing.y !== 0) {
      guard.facing = moved.facing;
    }
    if (moved.reached) {
      guard.routeIndex = (guard.routeIndex + 1) % route.points.length;
      guard.state = "patrol";
    }
  }

  updateAwareness(guard: GuardRuntime, canSeePlayer: boolean, playerPosition: Vector): boolean {
    if (canSeePlayer) {
      guard.suspicion = Math.min(chaseThreshold, guard.suspicion + suspicionRate);
      if (guard.suspicion >= chaseThreshold) {
        guard.state = "chase";
      } else if (guard.state === "patrol") {
        guard.state = "investigate";
      }
    } else {
      guard.suspicion = Math.max(0, guard.suspicion - suspicionDecay);
      if ((guard.state === "investigate" || guard.state === "chase") && guard.suspicion === 0) {
        guard.state = "return";
      }
    }

    if (guard.state === "chase") {
      const moved = moveToward(guard.position, playerPosition, guardSpeed * 1.4);
      guard.position = moved.position;
      if (moved.facing.x !== 0 || moved.facing.y !== 0) {
        guard.facing = moved.facing;
      }
      guard.captureProgress = canSeePlayer ? Math.min(1, guard.captureProgress + captureRate) : guard.captureProgress;
      return guard.captureProgress >= 1;
    }

    guard.captureProgress = Math.max(0, guard.captureProgress - 0.02);
    return false;
  }

  beginInspection(guard: GuardRuntime, spot: HidingSpot, nowMs: number): void {
    guard.state = "search";
    guard.inspectionTarget = spot.id;
    guard.searchUntilMs = nowMs + searchDurationMs;
    guard.position = cloneVector(spot.position);
    guard.facing = { x: 0, y: 1 };
  }

  updateInspection(guard: GuardRuntime, nowMs: number): boolean {
    if (guard.state !== "search") {
      return false;
    }
    if (nowMs >= guard.searchUntilMs) {
      guard.state = "return";
      guard.inspectionTarget = null;
      return true;
    }
    return false;
  }

  private nextTarget(points: PatrolPoint[], guard: GuardRuntime): PatrolPoint {
    return points[guard.routeIndex % points.length];
  }

  private patrolMultiplier(target: PatrolPoint): number {
    const corridor = target.corridor ?? corridorAt(this.map, target);
    if (!corridor) {
      return 1;
    }
    return 1 + (this.adaptations.patrolFrequency[corridor] ?? 0) * 0.35;
  }
}
