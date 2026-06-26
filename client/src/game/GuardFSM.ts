import { collidesWithSolidObjects, corridorAt } from "./map";
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
const captureRate = 0.003;
const guardSpeed = 0.003667;
const chaseSpeedMultiplier = 1.15;
const distractionSpeedMultiplier = 7;
const patrolAdaptationSpeedBonus = 0.2;
const searchDurationMs = 900;
const lostSightChaseDurationMs = 6000;
const guardObjectCollisionRadius = 0.28;

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

function rotate(vector: Vector, radians: number): Vector {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function steerTowardAvoidingSolidObjects(
  map: PrisonMap,
  position: Vector,
  target: Vector,
  speed: number,
): { position: Vector; reached: boolean; facing: Vector } {
  const direct = moveToward(position, target, speed);
  if (!collidesWithSolidObjects(map, direct.position, guardObjectCollisionRadius)) {
    return direct;
  }

  const desiredFacing = direct.facing;
  if (desiredFacing.x === 0 && desiredFacing.y === 0) {
    return direct;
  }

  const steeringAngles = [Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4, -Math.PI / 4, -Math.PI / 2, (-Math.PI * 3) / 4];
  for (const angle of steeringAngles) {
    const facing = rotate(desiredFacing, angle);
    const candidate = {
      position: {
        x: position.x + facing.x * speed,
        y: position.y + facing.y * speed,
      },
      reached: false,
      facing,
    };
    if (!collidesWithSolidObjects(map, candidate.position, guardObjectCollisionRadius)) {
      return candidate;
    }
  }

  return {
    position,
    reached: false,
    facing: desiredFacing,
  };
}

export type GuardRuntime = GuardStateSnapshot & {
  searchUntilMs: number;
  chaseUntilMs: number;
  distractionUntilMs: number;
  lastSeenPlayerPosition: Vector | null;
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
      chaseUntilMs: 0,
      distractionUntilMs: 0,
      lastSeenPlayerPosition: null,
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
        chaseUntilMs: 0,
        distractionUntilMs: 0,
        lastSeenPlayerPosition: null,
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
    const moved = steerTowardAvoidingSolidObjects(this.map, guard.position, target, speed);
    guard.position = moved.position;
    if (moved.facing.x !== 0 || moved.facing.y !== 0) {
      guard.facing = moved.facing;
    }
    if (moved.reached) {
      guard.routeIndex = (guard.routeIndex + 1) % route.points.length;
      guard.state = "patrol";
    }
  }

  updateAwareness(guard: GuardRuntime, canSeePlayer: boolean, playerPosition: Vector, nowMs: number): boolean {
    if (canSeePlayer) {
      guard.lastSeenPlayerPosition = cloneVector(playerPosition);
      guard.chaseUntilMs = nowMs + lostSightChaseDurationMs;
      guard.suspicion = Math.min(chaseThreshold, guard.suspicion + suspicionRate);
      if (guard.suspicion >= chaseThreshold) {
        guard.state = "chase";
      } else if (guard.state === "patrol") {
        guard.state = "investigate";
      }
    } else if (guard.state !== "chase") {
      if (guard.state === "investigate" && guard.lastSeenPlayerPosition && guard.suspicion > 0) {
        guard.state = "chase";
      } else {
        guard.suspicion = Math.max(0, guard.suspicion - suspicionDecay);
        if (guard.state === "investigate" && guard.suspicion === 0) {
          guard.state = "return";
        }
      }
    }

    if (guard.state === "chase") {
      if (!canSeePlayer && nowMs > guard.chaseUntilMs) {
        guard.state = "return";
        guard.captureProgress = Math.max(0, guard.captureProgress - 0.02);
        guard.lastSeenPlayerPosition = null;
        return false;
      }

      const chaseTarget = canSeePlayer ? playerPosition : guard.lastSeenPlayerPosition ?? playerPosition;
      const chaseMultiplier = nowMs <= guard.distractionUntilMs ? distractionSpeedMultiplier : chaseSpeedMultiplier;
      const moved = steerTowardAvoidingSolidObjects(this.map, guard.position, chaseTarget, guardSpeed * chaseMultiplier);
      guard.position = moved.position;
      if (moved.facing.x !== 0 || moved.facing.y !== 0) {
        guard.facing = moved.facing;
      }
      // Retained as chase pressure/proximity telemetry; HP loss handles failure.
      guard.captureProgress = canSeePlayer ? Math.min(1, guard.captureProgress + captureRate) : guard.captureProgress;
      return false;
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
    return 1 + (this.adaptations.patrolFrequency[corridor] ?? 0) * patrolAdaptationSpeedBonus;
  }
}
