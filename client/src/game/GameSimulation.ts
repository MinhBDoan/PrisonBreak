import type { ActiveAdaptation, RunEvent, RunOutcome } from "../../../shared/contracts";
import { DetectionSystem } from "./DetectionSystem";
import { GuardFSM, type GuardRuntime } from "./GuardFSM";
import { HidingSystem } from "./HidingSystem";
import { corridorAt, isWall, prisonMap } from "./map";
import { NoiseSystem, type NoiseEvent } from "./NoiseSystem";
import { ObjectiveSystem } from "./ObjectiveSystem";
import { RunEventCollector } from "./RunEventCollector";
import type {
  AppliedAdaptations,
  GuardOverride,
  PlayerState,
  PrisonMap,
  SimulationInput,
  SimulationOptions,
  SimulationSnapshot,
  Vector,
} from "./types";

const stepMs = 100;
const walkSpeed = 0.12;
const sprintSpeed = 0.22;
const inspectionIntervalMs = 1800;
const noiseSuspicion = {
  walk: 0.08,
  sprint: 0.18,
};

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

function cloneGuard(guard: GuardRuntime): GuardRuntime {
  return {
    ...guard,
    position: { ...guard.position },
    facing: { ...guard.facing },
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
  };
  private guards: GuardRuntime[];
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
      this.interact();
    }

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
      if (this.guardFsm.updateAwareness(guard, canSeePlayer, this.player.position)) {
        this.complete("capture");
      }
    }
  }

  setPlayerPosition(position: Vector): void {
    this.player.position = { ...position };
  }

  getSnapshot(): SimulationSnapshot {
    return {
      timeMs: this.timeMs,
      player: {
        position: { ...this.player.position },
        hasKey: this.player.hasKey,
        hiddenIn: this.player.hiddenIn,
      },
      guards: this.guards.map((guard) => ({
        ...cloneGuard(guard),
      })),
      objectives: this.objectives.snapshot(this.player),
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
    const next = {
      x: this.player.position.x + direction.x * speed,
      y: this.player.position.y + direction.y * speed,
    };
    if (this.collidesWithWall(next)) {
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

  private propagateNoise(noise: NoiseEvent): void {
    for (const guard of this.guards) {
      if (guard.state === "search" || guard.state === "chase") {
        continue;
      }

      const distance = Math.hypot(guard.position.x - noise.position.x, guard.position.y - noise.position.y);
      if (distance > noise.radius) {
        continue;
      }

      guard.state = "investigate";
      guard.facing = normalize({
        x: noise.position.x - guard.position.x,
        y: noise.position.y - guard.position.y,
      });
      const proximity = 1 - distance / Math.max(noise.radius, 0.001);
      guard.suspicion = Math.min(0.95, guard.suspicion + noiseSuspicion[noise.source] * (1 + proximity));
    }
  }

  private collidesWithWall(position: Vector): boolean {
    const radius = 0.45;
    return (
      isWall(this.map, { x: position.x - radius, y: position.y - radius }) ||
      isWall(this.map, { x: position.x + radius, y: position.y - radius }) ||
      isWall(this.map, { x: position.x - radius, y: position.y + radius }) ||
      isWall(this.map, { x: position.x + radius, y: position.y + radius })
    );
  }

  private interact(): void {
    const hidingResult = this.hiding.toggle(this.player);
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
