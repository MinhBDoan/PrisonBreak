import { collidesWithSolidObjects, corridorAt, isWall } from "./map";
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

function collidesWithGuardObstacles(map: PrisonMap, position: Vector): boolean {
  const radius = guardObjectCollisionRadius;
  return (
    isWall(map, { x: position.x - radius, y: position.y - radius }) ||
    isWall(map, { x: position.x + radius, y: position.y - radius }) ||
    isWall(map, { x: position.x - radius, y: position.y + radius }) ||
    isWall(map, { x: position.x + radius, y: position.y + radius }) ||
    collidesWithSolidObjects(map, position, radius)
  );
}

function nudgeOutOfGuardObstacle(
  map: PrisonMap,
  position: Vector,
  target: Vector,
  speed: number,
): { position: Vector; reached: false; facing: Vector } | null {
  const directions = Array.from({ length: 16 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 16;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
  const maxProbeDistance = guardObjectCollisionRadius + speed * 4;
  let best: { direction: Vector; position: Vector; distanceToTarget: number; probeDistance: number } | null = null;

  for (let probeDistance = speed; probeDistance <= maxProbeDistance; probeDistance += speed) {
    for (const direction of directions) {
      const probe = {
        x: position.x + direction.x * probeDistance,
        y: position.y + direction.y * probeDistance,
      };
      if (collidesWithGuardObstacles(map, probe)) {
        continue;
      }

      const distanceToTarget = Math.hypot(probe.x - target.x, probe.y - target.y);
      if (
        !best ||
        probeDistance < best.probeDistance ||
        (probeDistance === best.probeDistance && distanceToTarget < best.distanceToTarget)
      ) {
        best = { direction, position: probe, distanceToTarget, probeDistance };
      }
    }

    if (best) {
      break;
    }
  }

  if (!best) {
    return null;
  }

  return {
    position: best.position,
    reached: false,
    facing: best.direction,
  };
}

function cellCenter(cell: { x: number; y: number }): Vector {
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

function guardCellIsOpen(map: PrisonMap, cell: { x: number; y: number }): boolean {
  if (cell.x < 0 || cell.y < 0 || cell.x >= map.width || cell.y >= map.height) {
    return false;
  }
  return !collidesWithGuardObstacles(map, cellCenter(cell));
}

function nearestOpenGuardCell(map: PrisonMap, position: Vector): { x: number; y: number } | null {
  const origin = { x: Math.floor(position.x), y: Math.floor(position.y) };
  if (guardCellIsOpen(map, origin)) {
    return origin;
  }

  for (let radius = 1; radius <= 4; radius += 1) {
    for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
      for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
        const cell = { x, y };
        if (guardCellIsOpen(map, cell)) {
          return cell;
        }
      }
    }
  }
  return null;
}

function chaseWaypointAroundObstacles(map: PrisonMap, position: Vector, target: Vector): Vector | null {
  const start = nearestOpenGuardCell(map, position);
  const goal = nearestOpenGuardCell(map, target);
  if (!start || !goal || (start.x === goal.x && start.y === goal.y)) {
    return null;
  }

  const keyOf = (cell: { x: number; y: number }) => `${cell.x},${cell.y}`;
  const queue = [start];
  const visited = new Set([keyOf(start)]);
  const previous = new Map<string, string | null>([[keyOf(start), null]]);
  const cells = new Map<string, { x: number; y: number }>([[keyOf(start), start]]);
  const offsets = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.x === goal.x && current.y === goal.y) {
      break;
    }

    for (const offset of offsets) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const key = keyOf(next);
      if (visited.has(key) || !guardCellIsOpen(map, next)) {
        continue;
      }
      visited.add(key);
      previous.set(key, keyOf(current));
      cells.set(key, next);
      queue.push(next);
    }
  }

  const goalKey = keyOf(goal);
  if (!previous.has(goalKey)) {
    return null;
  }

  let stepKey = goalKey;
  let priorKey = previous.get(stepKey);
  while (priorKey && priorKey !== keyOf(start)) {
    stepKey = priorKey;
    priorKey = previous.get(stepKey);
  }

  const stepCell = cells.get(stepKey);
  return stepCell ? cellCenter(stepCell) : null;
}

function steerTowardAvoidingSolidObjects(
  map: PrisonMap,
  position: Vector,
  target: Vector,
  speed: number,
  strategy: "ordered" | "closest" = "ordered",
): { position: Vector; reached: boolean; facing: Vector } {
  if (collidesWithGuardObstacles(map, position)) {
    const escaped = nudgeOutOfGuardObstacle(map, position, target, speed);
    if (escaped) {
      return escaped;
    }
  }

  const direct = moveToward(position, target, speed);
  if (!collidesWithGuardObstacles(map, direct.position)) {
    return direct;
  }

  const desiredFacing = direct.facing;
  if (desiredFacing.x === 0 && desiredFacing.y === 0) {
    return direct;
  }

  const axisFacings = [
    normalize({ x: desiredFacing.x, y: 0 }),
    normalize({ x: 0, y: desiredFacing.y }),
  ];
  const orderedAngles = [Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4, -Math.PI / 4, -Math.PI / 2, (-Math.PI * 3) / 4];
  const closestAngles = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (Math.PI * 3) / 4, (-Math.PI * 3) / 4];
  const candidateFacings =
    strategy === "ordered"
      ? orderedAngles.map((angle) => rotate(desiredFacing, angle))
      : [...axisFacings, ...closestAngles.map((angle) => rotate(desiredFacing, angle))];
  const candidates: Array<{ position: Vector; reached: false; facing: Vector }> = [];

  for (const facing of candidateFacings) {
    if (facing.x === 0 && facing.y === 0) {
      continue;
    }
    const candidate = {
      position: {
        x: position.x + facing.x * speed,
        y: position.y + facing.y * speed,
      },
      reached: false as const,
      facing,
    };
    if (!collidesWithGuardObstacles(map, candidate.position)) {
      if (strategy === "ordered") {
        return candidate;
      }
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => {
    const leftDistance = Math.hypot(left.position.x - target.x, left.position.y - target.y);
    const rightDistance = Math.hypot(right.position.x - target.x, right.position.y - target.y);
    return leftDistance - rightDistance;
  });

  const best = candidates[0];
  if (best) {
    return best;
  }

  const backingAway = {
    position: {
      x: position.x - desiredFacing.x * speed,
      y: position.y - desiredFacing.y * speed,
    },
    reached: false as const,
    facing: { x: -desiredFacing.x, y: -desiredFacing.y },
  };
  if (!collidesWithGuardObstacles(map, backingAway.position)) {
    return backingAway;
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
      combatLockedOnPlayer: false,
    }));

    for (const guard of map.stationaryGuards) {
      guards.push({
        id: guard.id,
        position: cloneVector(guard.position),
        facing: cloneVector(guard.facing),
        state: "patrol",
        routeId: `stationary:${guard.id}`,
        routeIndex: 0,
        suspicion: 0,
        captureProgress: 0,
        inspectionTarget: null,
        searchUntilMs: 0,
        chaseUntilMs: 0,
        distractionUntilMs: 0,
        lastSeenPlayerPosition: null,
        combatLockedOnPlayer: false,
      });
    }

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
        combatLockedOnPlayer: false,
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
    if (guard.combatLockedOnPlayer) {
      guard.state = "chase";
      guard.lastSeenPlayerPosition = cloneVector(playerPosition);
      guard.chaseUntilMs = Number.POSITIVE_INFINITY;
      guard.suspicion = chaseThreshold;
    }

    if (canSeePlayer) {
      guard.combatLockedOnPlayer = true;
      guard.lastSeenPlayerPosition = cloneVector(playerPosition);
      guard.chaseUntilMs = guard.combatLockedOnPlayer ? Number.POSITIVE_INFINITY : nowMs + lostSightChaseDurationMs;
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
      if (!guard.combatLockedOnPlayer && !canSeePlayer && nowMs > guard.chaseUntilMs) {
        guard.state = "return";
        guard.captureProgress = Math.max(0, guard.captureProgress - 0.02);
        guard.lastSeenPlayerPosition = null;
        return false;
      }

      const chaseTarget = guard.combatLockedOnPlayer || canSeePlayer ? playerPosition : guard.lastSeenPlayerPosition ?? playerPosition;
      const chaseMultiplier = nowMs <= guard.distractionUntilMs ? distractionSpeedMultiplier : chaseSpeedMultiplier;
      const chaseSpeed = guardSpeed * chaseMultiplier;
      const directChaseStep = moveToward(guard.position, chaseTarget, chaseSpeed);
      const movementTarget = collidesWithGuardObstacles(this.map, directChaseStep.position)
        ? chaseWaypointAroundObstacles(this.map, guard.position, chaseTarget) ?? chaseTarget
        : chaseTarget;
      const moved = steerTowardAvoidingSolidObjects(this.map, guard.position, movementTarget, chaseSpeed, "closest");
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
