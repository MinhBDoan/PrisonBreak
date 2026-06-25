import type { ActiveAdaptation, RunEvent, RunOutcome } from "../../../shared/contracts";
import { DetectionSystem } from "./DetectionSystem";
import { GuardFSM, type GuardRuntime } from "./GuardFSM";
import { applyDamage, createHealthState } from "./HealthSystem";
import { HidingSystem } from "./HidingSystem";
import { collidesWithSolidObjects, corridorAt, isWall, prisonMap } from "./map";
import { NoiseSystem, type NoiseEvent } from "./NoiseSystem";
import { ObjectiveSystem } from "./ObjectiveSystem";
import { RunEventCollector } from "./RunEventCollector";
import type {
  AppliedAdaptations,
  GuardOverride,
  HealthState,
  PlayerState,
  PrisonMap,
  SimulationInput,
  SimulationOptions,
  SimulationSnapshot,
  Vector,
} from "./types";

const stepMs = 100;
const walkSpeed = 0.018333;
const sprintSpeed = 0.033333;
const inspectionIntervalMs = 1800;
const noiseSuspicion = {
  walk: 0.08,
  sprint: 0.18,
  pebble: 0.22,
};
const noiseChaseDurationMs = 3000;
const wallCollisionRadius = 0.35;
const playerObjectCollisionRadius = 0.28;
const pebblePickupRadius = 0.7;
const pebbleThrowRange = 4;
const pebbleNoiseRadius = 3.8;
const pebbleFlightMs = 300;

type PendingPebbleImpact = {
  origin: Vector;
  landing: Vector;
  impactAtMs: number;
};

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

function wallBetween(map: PrisonMap, from: Vector, to: Vector): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / 0.1));
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    if (
      isWall(map, {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      })
    ) {
      return true;
    }
  }
  return false;
}

function cloneGuard(guard: GuardRuntime): GuardRuntime {
  return {
    ...guard,
    position: { ...guard.position },
    facing: { ...guard.facing },
    lastSeenPlayerPosition: guard.lastSeenPlayerPosition ? { ...guard.lastSeenPlayerPosition } : null,
  };
}

function applyGuardOverrides(guards: GuardRuntime[], overrides: GuardOverride[]): GuardRuntime[] {
  const overridden = guards.map((guard) => {
    const override = overrides.find((candidate) => candidate.id === guard.id);
    if (!override) {
      return guard;
    }
    return {
      ...guard,
      position: { ...override.position },
      facing: override.facing ? { ...override.facing } : guard.facing,
    };
  });
  const route = prisonMap.patrolRoutes[0];
  for (const override of overrides) {
    if (overridden.some((guard) => guard.id === override.id)) {
      continue;
    }
    overridden.push({
      id: override.id,
      position: { ...override.position },
      facing: override.facing ? { ...override.facing } : { x: 1, y: 0 },
      state: "investigate",
      routeId: route.id,
      routeIndex: 0,
      suspicion: 0,
      captureProgress: 0,
      inspectionTarget: null,
      searchUntilMs: 0,
      chaseUntilMs: 0,
      distractionUntilMs: 0,
      lastSeenPlayerPosition: null,
    });
  }
  return overrides.length > 0 ? overridden.filter((guard) => overrides.some((override) => override.id === guard.id)) : overridden;
}

function buildAdaptations(adaptations: ActiveAdaptation[] = []): AppliedAdaptations {
  const applied: AppliedAdaptations = {
    active: adaptations,
    patrolFrequency: {},
    inspectHidingSpots: {},
    noiseSensitivity: 0,
    reserveGuardActive: false,
  };

  for (const adaptation of adaptations) {
    if (adaptation.action === "increase_corridor_patrol") {
      applied.patrolFrequency[adaptation.target as keyof AppliedAdaptations["patrolFrequency"]] =
        adaptation.level;
    }
    if (adaptation.action === "inspect_hiding_spot") {
      applied.inspectHidingSpots[adaptation.target] = adaptation.level;
    }
    if (adaptation.action === "increase_noise_sensitivity") {
      applied.noiseSensitivity = Math.max(applied.noiseSensitivity, adaptation.level);
    }
    if (adaptation.action === "activate_reserve_guard") {
      applied.reserveGuardActive = adaptation.level > 0;
    }
  }

  return applied;
}

export class GameSimulation {
  private readonly map: PrisonMap;
  private readonly events = new RunEventCollector();
  private readonly hiding: HidingSystem;
  private readonly objectives: ObjectiveSystem;
  private readonly detection: DetectionSystem;
  private readonly noise: NoiseSystem;
  private readonly guardFsm: GuardFSM;
  private readonly adaptations: AppliedAdaptations;
  private readonly inspectionTimers = new Map<string, number>();
  private readonly player: PlayerState = {
    position: { x: 1.5, y: 1.5 },
    hasKey: false,
    hiddenIn: null,
    pebbles: 0,
  };
  private playerHealth = createHealthState("player", 100);
  private guards: GuardRuntime[];
  private readonly collectedPebbles = new Set<string>();
  private readonly pendingPebbleImpacts: PendingPebbleImpact[] = [];
  private timeMs = 0;
  private completed: { outcome: RunOutcome; durationMs: number } | null = null;

  constructor(options: SimulationOptions = {}) {
    this.map = prisonMap;
    this.adaptations = buildAdaptations(options.nextRunConfig?.adaptations);
    this.hiding = new HidingSystem(this.map);
    this.objectives = new ObjectiveSystem(this.map);
    this.detection = new DetectionSystem(this.map);
    this.noise = new NoiseSystem(this.adaptations);
    this.guardFsm = new GuardFSM(this.map, this.adaptations);
    this.guards = applyGuardOverrides(
      GuardFSM.createInitialGuards(this.map, this.adaptations),
      options.guardOverrides ?? [],
    );
  }

  step(input: SimulationInput): void {
    if (this.completed) {
      return;
    }

    this.timeMs += stepMs;
    this.movePlayer(input);
    if (input.interact) {
      this.interact(input.direction);
    }
    if (input.throwTarget) {
      this.throwPebble(input.throwTarget);
    }
    this.resolvePebbleImpacts();

    this.updateLearnedInspections();
    for (const guard of this.guards) {
      if (guard.state === "search") {
        const finished = this.guardFsm.updateInspection(guard, this.timeMs);
        if (!finished && this.player.hiddenIn === guard.inspectionTarget) {
          this.recordDetection(guard.id, "hiding_inspection");
          this.complete("capture");
        }
        continue;
      }

      this.guardFsm.updatePatrol(guard);
      const canSeePlayer = this.detection.canSeePlayer(guard, this.player);
      if (canSeePlayer) {
        this.recordDetection(guard.id, "line_of_sight");
      }
      if (this.guardFsm.updateAwareness(guard, canSeePlayer, this.player.position, this.timeMs)) {
        this.complete("capture");
      }
    }
  }

  setPlayerPosition(position: Vector): void {
    this.player.position = { ...position };
  }

  applyPlayerDamage(amount: number): void {
    if (this.completed) {
      return;
    }

    this.playerHealth = applyDamage(this.playerHealth, amount);
    if (this.playerHealth.isDown) {
      this.complete("death");
    }
  }

  getPlayerHealth(): HealthState {
    return { ...this.playerHealth };
  }

  getSnapshot(): SimulationSnapshot {
    return {
      timeMs: this.timeMs,
      player: {
        position: { ...this.player.position },
        hasKey: this.player.hasKey,
        hiddenIn: this.player.hiddenIn,
        pebbles: this.player.pebbles,
      },
      guards: this.guards.map((guard) => ({
        ...cloneGuard(guard),
      })),
      objectives: this.objectives.snapshot(this.player),
      pebbles: this.map.pebbles.map((pebble) => ({
        ...pebble,
        position: { ...pebble.position },
        collected: this.collectedPebbles.has(pebble.id),
      })),
      completed: this.completed ? { ...this.completed } : null,
      adaptations: {
        active: [...this.adaptations.active],
        patrolFrequency: { ...this.adaptations.patrolFrequency },
        inspectHidingSpots: { ...this.adaptations.inspectHidingSpots },
        noiseSensitivity: this.adaptations.noiseSensitivity,
        reserveGuardActive: this.adaptations.reserveGuardActive,
      },
    };
  }

  getEvents(): RunEvent[] {
    return this.events.list();
  }

  private movePlayer(input: SimulationInput): void {
    const direction = normalize(input.direction);
    if (direction.x === 0 && direction.y === 0) {
      return;
    }

    if (this.player.hiddenIn) {
      return;
    }

    const speed = input.sprint ? sprintSpeed : walkSpeed;
    const next = this.nextPlayerPosition(direction, speed);
    if (!next) {
      return;
    }

    this.player.position = next;
    const corridorId = corridorAt(this.map, this.player.position);
    this.events.record(this.timeMs, {
      type: input.sprint ? "sprint" : "move",
      position: { ...this.player.position },
      payload: corridorId ? { corridorId } : {},
    });

    const noise = this.noise.movementNoise(this.player, true, input.sprint);
    if (noise) {
      this.events.record(this.timeMs, {
        type: "noise",
        position: noise.position,
        payload: { radius: noise.radius, source: noise.source },
      });
      this.propagateNoise(noise);
    }
  }

  private nextPlayerPosition(direction: Vector, speed: number): Vector | null {
    const candidates = [
      {
        x: this.player.position.x + direction.x * speed,
        y: this.player.position.y + direction.y * speed,
      },
    ];

    if (direction.x !== 0 && direction.y !== 0) {
      const horizontal = {
        x: this.player.position.x + direction.x * speed,
        y: this.player.position.y,
      };
      const vertical = {
        x: this.player.position.x,
        y: this.player.position.y + direction.y * speed,
      };
      candidates.push(Math.abs(direction.x) >= Math.abs(direction.y) ? horizontal : vertical);
      candidates.push(Math.abs(direction.x) >= Math.abs(direction.y) ? vertical : horizontal);
    }

    return candidates.find((candidate) => !this.collidesWithObstacle(candidate)) ?? null;
  }

  private propagateNoise(noise: NoiseEvent): void {
    for (const guard of this.guards) {
      if (guard.state === "search" || guard.state === "chase") {
        continue;
      }

      const distance = Math.hypot(guard.position.x - noise.position.x, guard.position.y - noise.position.y);
      if (distance > noise.radius) {
        continue;
      }

      guard.state = "chase";
      guard.lastSeenPlayerPosition = { ...noise.position };
      guard.chaseUntilMs = this.timeMs + noiseChaseDurationMs;
      guard.distractionUntilMs = noise.source === "pebble" ? guard.chaseUntilMs : 0;
      guard.facing = normalize({
        x: noise.position.x - guard.position.x,
        y: noise.position.y - guard.position.y,
      });
      const proximity = 1 - distance / Math.max(noise.radius, 0.001);
      guard.suspicion = Math.min(0.95, guard.suspicion + noiseSuspicion[noise.source] * (1 + proximity));
    }
  }

  private collidesWithObstacle(position: Vector): boolean {
    const touchesWall =
      isWall(this.map, { x: position.x - wallCollisionRadius, y: position.y - wallCollisionRadius }) ||
      isWall(this.map, { x: position.x + wallCollisionRadius, y: position.y - wallCollisionRadius }) ||
      isWall(this.map, { x: position.x - wallCollisionRadius, y: position.y + wallCollisionRadius }) ||
      isWall(this.map, { x: position.x + wallCollisionRadius, y: position.y + wallCollisionRadius });
    if (touchesWall) {
      return true;
    }

    return collidesWithSolidObjects(this.map, position, playerObjectCollisionRadius);
  }

  private interact(direction: Vector): void {
    const pebble = this.map.pebbles.find(
      (candidate) =>
        !this.collectedPebbles.has(candidate.id) &&
        Math.hypot(candidate.position.x - this.player.position.x, candidate.position.y - this.player.position.y) <=
          pebblePickupRadius,
    );
    if (pebble) {
      this.collectedPebbles.add(pebble.id);
      this.player.pebbles += 1;
      return;
    }

    const hidingResult = this.hiding.toggle(
      this.player,
      (position) => !this.collidesWithObstacle(position),
      normalize(direction),
    );
    if (hidingResult.entered) {
      this.events.record(this.timeMs, {
        type: "hide_enter",
        position: { ...this.player.position },
        payload: { hidingSpotId: hidingResult.entered },
      });
      return;
    }
    if (hidingResult.exited) {
      this.events.record(this.timeMs, {
        type: "hide_exit",
        position: { ...this.player.position },
        payload: { hidingSpotId: hidingResult.exited },
      });
      return;
    }

    const result = this.objectives.interact(this.player);
    if (result.keyCollected) {
      this.events.record(this.timeMs, {
        type: "key_collected",
        position: { ...this.player.position },
        payload: { keyId: this.map.key.id },
      });
    }
    if (result.completed) {
      this.complete(result.completed);
    }
  }

  private throwPebble(target: Vector): void {
    if (this.player.pebbles <= 0 || this.player.hiddenIn) {
      return;
    }

    const direction = normalize({
      x: target.x - this.player.position.x,
      y: target.y - this.player.position.y,
    });
    if (direction.x === 0 && direction.y === 0) {
      return;
    }

    const distance = Math.hypot(target.x - this.player.position.x, target.y - this.player.position.y);
    const landingDistance = Math.min(distance, pebbleThrowRange);
    const landing = {
      x: this.player.position.x + direction.x * landingDistance,
      y: this.player.position.y + direction.y * landingDistance,
    };
    if (wallBetween(this.map, this.player.position, landing)) {
      return;
    }

    this.player.pebbles -= 1;
    this.events.record(this.timeMs, {
      type: "pebble_throw",
      position: { ...this.player.position },
      payload: { landing: { ...landing } },
    });
    this.pendingPebbleImpacts.push({
      origin: { ...this.player.position },
      landing,
      impactAtMs: this.timeMs + pebbleFlightMs,
    });
  }

  private resolvePebbleImpacts(): void {
    for (let index = this.pendingPebbleImpacts.length - 1; index >= 0; index -= 1) {
      const impact = this.pendingPebbleImpacts[index];
      if (this.timeMs < impact.impactAtMs) {
        continue;
      }

      this.pendingPebbleImpacts.splice(index, 1);
      const noise: NoiseEvent = {
        position: impact.landing,
        radius: pebbleNoiseRadius,
        source: "pebble",
      };
      this.events.record(this.timeMs, {
        type: "noise",
        position: { ...impact.landing },
        payload: { radius: noise.radius, source: noise.source, origin: { ...impact.origin } },
      });
      this.propagateNoise(noise);
    }
  }

  private updateLearnedInspections(): void {
    for (const [spotId, level] of Object.entries(this.adaptations.inspectHidingSpots)) {
      const dueAt = this.inspectionTimers.get(spotId) ?? inspectionIntervalMs / Math.max(1, level);
      if (this.timeMs < dueAt) {
        this.inspectionTimers.set(spotId, dueAt);
        continue;
      }

      const spot = this.map.hidingSpots.find((candidate) => candidate.id === spotId);
      const guard = this.guards.find((candidate) => candidate.state === "patrol" || candidate.state === "return");
      if (!spot || !guard) {
        continue;
      }

      this.guardFsm.beginInspection(guard, spot, this.timeMs);
      this.events.record(this.timeMs, {
        type: "detection",
        position: { ...spot.position },
        payload: { guardId: guard.id, reason: "hiding_inspection", hidingSpotId: spot.id },
      });
      this.inspectionTimers.set(spotId, this.timeMs + inspectionIntervalMs / Math.max(1, level));
    }
  }

  private recordDetection(guardId: string, reason: string): void {
    const corridorId = corridorAt(this.map, this.player.position);
    this.events.record(this.timeMs, {
      type: "detection",
      position: { ...this.player.position },
      payload: corridorId ? { guardId, reason, corridorId } : { guardId, reason },
    });
  }

  private complete(outcome: RunOutcome): void {
    if (this.completed) {
      return;
    }
    this.completed = { outcome, durationMs: this.timeMs };
    this.events.record(this.timeMs, {
      type: outcome,
      position: { ...this.player.position },
      payload: {},
    });
  }
}
