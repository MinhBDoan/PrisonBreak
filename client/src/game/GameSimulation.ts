import type { ActiveAdaptation, RunEvent, RunOutcome } from "../../../shared/contracts";
import { createAlertState, registerBodyDiscovery, registerNoise, withPressure } from "./AlertSystem";
import { addBody, createBodyState, discoverBody, wakeGuard } from "./BodySystem";
import { resolveAttack } from "./CombatSystem";
import { DetectionSystem } from "./DetectionSystem";
import { GuardFSM, type GuardRuntime } from "./GuardFSM";
import { applyDamage, createHealthState } from "./HealthSystem";
import { HidingSystem } from "./HidingSystem";
import { collidesWithSolidObjects, corridorAt, isWall, prisonMap } from "./map";
import { NoiseSystem, type NoiseEvent } from "./NoiseSystem";
import { ObjectiveSystem } from "./ObjectiveSystem";
import { RunEventCollector } from "./RunEventCollector";
import { addReserveAmmo, createInitialWeaponState, pickupWeapon, startReload, tickReload } from "./WeaponSystem";
import type {
  AppliedAdaptations,
  AlertState,
  BodySystemState,
  CombatResult,
  GuardOverride,
  HealthState,
  PlayerState,
  PrisonMap,
  SimulationInput,
  SimulationOptions,
  SimulationSnapshot,
  Vector,
  WeaponId,
  WeaponState,
} from "./types";
import { weapons } from "./weapons";

const stepMs = 100;
const walkSpeed = 0.018333;
const sprintSpeed = 0.033333;
const inspectionIntervalMs = 1800;
const noiseSuspicion = {
  walk: 0.08,
  sprint: 0.18,
  pebble: 0.22,
  weapon: 0.3,
};
const noiseChaseDurationMs = 3000;
const wallCollisionRadius = 0.35;
const playerObjectCollisionRadius = 0.28;
const pebblePickupRadius = 0.7;
const weaponPickupRadius = 0.75;
const pebbleThrowRange = 4;
const pebbleNoiseRadius = 3.8;
const pebbleFlightMs = 300;
const guardContactDamage = 20;
const guardContactCooldownMs = 1000;
const guardContactRange = 0.5;
const bodyDiscoveryRange = 3.2;
const bodyWakeDelayMs = 800;
const healingAmount = 35;

type PendingPebbleImpact = {
  origin: Vector;
  landing: Vector;
  impactAtMs: number;
};

type PendingWakeup = {
  guardId: string;
  wokenBy: string;
  wakeAtMs: number;
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
    bodyCheckLevel: 0,
    armedResponseLevel: 0,
    guardCoverLevel: 0,
    guardDurabilityLevel: 0,
    ammoReductionLevel: 0,
    meleeCautionLevel: 0,
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
    if (adaptation.action === "add_body_checks") {
      applied.bodyCheckLevel = Math.max(applied.bodyCheckLevel, adaptation.level);
    }
    if (adaptation.action === "place_armed_response") {
      applied.armedResponseLevel = Math.max(applied.armedResponseLevel, adaptation.level);
    }
    if (adaptation.action === "improve_guard_cover") {
      applied.guardCoverLevel = Math.max(applied.guardCoverLevel, adaptation.level);
    }
    if (adaptation.action === "increase_guard_durability") {
      applied.guardDurabilityLevel = Math.max(applied.guardDurabilityLevel, adaptation.level);
    }
    if (adaptation.action === "reduce_ammo_availability") {
      applied.ammoReductionLevel = Math.max(applied.ammoReductionLevel, adaptation.level);
    }
    if (adaptation.action === "increase_melee_caution") {
      applied.meleeCautionLevel = Math.max(applied.meleeCautionLevel, adaptation.level);
    }
  }

  return applied;
}

function weaponSpatialNoiseRadius(weaponId: WeaponId, alertNoise: number, map: PrisonMap): number {
  const weapon = weapons[weaponId];
  const mapLimit = Math.max(1, Math.min(map.width, map.height) - 1);
  const radius = weapon.kind === "gun" ? 4 + alertNoise / 10 : 1.5 + alertNoise / 12;

  return Math.min(mapLimit, radius);
}

function cloneWeaponState(state: WeaponState): WeaponState {
  return {
    ...state,
    ammoByWeapon: { ...state.ammoByWeapon },
    reserveAmmoByType: { ...state.reserveAmmoByType },
    reload: state.reload ? { ...state.reload } : null,
  };
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
  private playerWeapons = createInitialWeaponState();
  private guards: GuardRuntime[];
  private readonly guardHealth = new Map<string, HealthState>();
  private alertState = createAlertState();
  private bodyState = createBodyState();
  private readonly collectedPebbles = new Set<string>();
  private readonly collectedWeaponPickups = new Set<string>();
  private readonly pendingPebbleImpacts: PendingPebbleImpact[] = [];
  private readonly pendingWakeups: PendingWakeup[] = [];
  private readonly guardContactCooldowns = new Map<string, number>();
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
    if (this.adaptations.armedResponseLevel > 0) {
      this.alertState = withPressure(this.alertState, this.adaptations.armedResponseLevel * 12);
    }
    for (const guard of this.guards) {
      this.guardHealth.set(guard.id, createHealthState(guard.id, 45 + this.adaptations.guardDurabilityLevel * 10));
    }
  }

  step(input: SimulationInput): void {
    if (this.completed) {
      return;
    }

    this.timeMs += stepMs;
    this.playerWeapons = tickReload(this.playerWeapons, stepMs);
    this.movePlayer(input);
    if (input.interact) {
      this.interact(input.direction);
    }
    if (input.throwTarget) {
      this.throwPebble(input.throwTarget);
    }
    if (input.reload) {
      this.reloadEquippedGun();
    }
    if (input.heal) {
      this.useHealingItem();
    }
    if (input.attack) {
      this.attackNearestGuard(input.attack);
    }
    this.resolvePebbleImpacts();
    this.resolvePendingWakeups();

    this.updateLearnedInspections();
    for (const guard of this.guards) {
      if (this.bodyState.bodies[guard.id]) {
        continue;
      }

      if (guard.state === "search") {
        const finished = this.guardFsm.updateInspection(guard, this.timeMs);
        if (!finished && this.player.hiddenIn === guard.inspectionTarget) {
          this.recordDetection(guard.id, "hiding_inspection");
        }
        continue;
      }

      this.guardFsm.updatePatrol(guard);
      const canSeePlayer = this.detection.canSeePlayer(guard, this.player);
      if (canSeePlayer) {
        this.recordDetection(guard.id, "line_of_sight");
      }
      this.guardFsm.updateAwareness(guard, canSeePlayer, this.player.position, this.timeMs);
      this.applyGuardContactPressure(guard, canSeePlayer);
      this.discoverNearbyBodies(guard);
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
    this.events.record(this.timeMs, {
      type: "damage_taken",
      position: { ...this.player.position },
      payload: { amount, hp: this.playerHealth.hp, maxHp: this.playerHealth.maxHp },
    });
    if (this.playerHealth.isDown) {
      this.complete("death");
    }
  }

  getPlayerHealth(): HealthState {
    return { ...this.playerHealth };
  }

  getGuardHealth(guardId: string): HealthState | null {
    const health = this.guardHealth.get(guardId);
    return health ? { ...health } : null;
  }

  getAlertState(): AlertState {
    return { ...this.alertState };
  }

  getBodyState(): BodySystemState {
    return {
      bodies: Object.fromEntries(
        Object.entries(this.bodyState.bodies).map(([guardId, body]) => [
          guardId,
          {
            ...body,
            position: { ...body.position },
          },
        ]),
      ),
    };
  }

  playerAttack(targetGuardId: string, weaponId: WeaponId): CombatResult | null {
    if (this.completed || this.player.hiddenIn || this.bodyState.bodies[targetGuardId]) {
      return null;
    }

    if (!this.canUseWeapon(weaponId)) {
      return null;
    }

    const target = this.guards.find((guard) => guard.id === targetGuardId);
    const targetHealth = this.guardHealth.get(targetGuardId);
    if (!target || !targetHealth) {
      return null;
    }

    this.consumeAttackAmmo(weaponId);
    this.events.record(this.timeMs, {
      type: "attack",
      position: { ...this.player.position },
      payload: { attackerId: "player", targetId: targetGuardId, weaponId },
    });

    const result = resolveAttack({
      attackerId: "player",
      targetId: targetGuardId,
      weaponId,
      attackerPosition: this.player.position,
      targetPosition: target.position,
      targetHealth,
      moving: false,
      lineOfFireBlocked: !this.detection.hasClearRay(this.player.position, target.position),
    });

    const noiseRadius = weaponSpatialNoiseRadius(weaponId, result.noise, this.map);
    const noise: NoiseEvent = {
      position: { ...this.player.position },
      radius: noiseRadius,
      source: "weapon",
    };
    this.events.record(this.timeMs, {
      type: "noise",
      position: noise.position,
      payload: { radius: noise.radius, source: noise.source, weaponId },
    });
    this.propagateNoise(noise);
    this.setAlertState(registerNoise(this.alertState, result.noise));

    if (result.hit) {
      const updatedHealth = applyDamage(targetHealth, result.damage);
      this.guardHealth.set(targetGuardId, updatedHealth);
      this.events.record(this.timeMs, {
        type: "damage_dealt",
        position: { ...target.position },
        payload: { attackerId: "player", targetId: targetGuardId, weaponId, damage: result.damage },
      });
    }

    if (result.bodyState === "knocked_out" || result.bodyState === "dead") {
      this.bodyState = addBody(this.bodyState, {
        guardId: targetGuardId,
        bodyState: result.bodyState,
        position: { ...target.position },
      });
      this.events.record(this.timeMs, {
        type: result.bodyState === "dead" ? "kill" : "knockout",
        position: { ...target.position },
        payload: { attackerId: "player", targetId: targetGuardId, weaponId },
      });
    }

    return result;
  }

  getSnapshot(): SimulationSnapshot {
    return {
      timeMs: this.timeMs,
      player: {
        position: { ...this.player.position },
        hasKey: this.player.hasKey,
        hiddenIn: this.player.hiddenIn,
        pebbles: this.player.pebbles,
        health: { ...this.playerHealth },
        weapons: cloneWeaponState(this.playerWeapons),
      },
      guards: this.guards.map((guard) => {
        const body = this.bodyState.bodies[guard.id];
        const health = this.guardHealth.get(guard.id);
        return {
          ...cloneGuard(guard),
          bodyState: body?.bodyState ?? "active",
          health: health ? { ...health } : undefined,
        };
      }),
      alert: { ...this.alertState },
      objectives: this.objectives.snapshot(this.player),
      pebbles: this.map.pebbles.map((pebble) => ({
        ...pebble,
        position: { ...pebble.position },
        collected: this.collectedPebbles.has(pebble.id),
      })),
      weaponPickups: this.map.weaponPickups.map((pickup) => ({
        ...pickup,
        position: { ...pickup.position },
        collected: this.collectedWeaponPickups.has(pickup.id),
      })),
      completed: this.completed ? { ...this.completed } : null,
      adaptations: {
        active: [...this.adaptations.active],
        patrolFrequency: { ...this.adaptations.patrolFrequency },
        inspectHidingSpots: { ...this.adaptations.inspectHidingSpots },
        noiseSensitivity: this.adaptations.noiseSensitivity,
        reserveGuardActive: this.adaptations.reserveGuardActive,
        bodyCheckLevel: this.adaptations.bodyCheckLevel,
        armedResponseLevel: this.adaptations.armedResponseLevel,
        guardCoverLevel: this.adaptations.guardCoverLevel,
        guardDurabilityLevel: this.adaptations.guardDurabilityLevel,
        ammoReductionLevel: this.adaptations.ammoReductionLevel,
        meleeCautionLevel: this.adaptations.meleeCautionLevel,
      },
    };
  }

  private attackNearestGuard(mode: "melee" | "gun"): void {
    const weaponId = mode === "gun" ? (this.playerWeapons.sidearmId ?? this.playerWeapons.primaryGunId) : this.playerWeapons.meleeWeaponId;
    if (!weaponId) {
      return;
    }
    const weapon = weapons[weaponId];
    const target = this.guards
      .filter((guard) => !this.bodyState.bodies[guard.id])
      .map((guard) => ({
        guard,
        distance: Math.hypot(guard.position.x - this.player.position.x, guard.position.y - this.player.position.y),
      }))
      .filter(({ guard, distance }) => distance <= weapon.range && this.detection.hasClearRay(this.player.position, guard.position))
      .sort((a, b) => a.distance - b.distance)[0]?.guard;
    if (target) {
      this.playerAttack(target.id, weaponId);
    }
  }

  private canUseWeapon(weaponId: WeaponId): boolean {
    const weapon = weapons[weaponId];
    if (weapon.kind === "gun") {
      const ownsGun = this.playerWeapons.primaryGunId === weaponId || this.playerWeapons.sidearmId === weaponId;
      return ownsGun && !this.playerWeapons.reload && (this.playerWeapons.ammoByWeapon[weaponId] ?? 0) > 0;
    }
    if (weapon.slot === "melee") {
      return this.playerWeapons.meleeWeaponId === weaponId;
    }
    return weaponId === "fists";
  }

  private consumeAttackAmmo(weaponId: WeaponId): void {
    if (weapons[weaponId].kind !== "gun") {
      return;
    }
    this.playerWeapons = {
      ...this.playerWeapons,
      ammoByWeapon: {
        ...this.playerWeapons.ammoByWeapon,
        [weaponId]: Math.max(0, (this.playerWeapons.ammoByWeapon[weaponId] ?? 0) - 1),
      },
      reserveAmmoByType: { ...this.playerWeapons.reserveAmmoByType },
      reload: this.playerWeapons.reload ? { ...this.playerWeapons.reload } : null,
    };
  }

  private reloadEquippedGun(): void {
    const weaponId = this.playerWeapons.sidearmId ?? this.playerWeapons.primaryGunId;
    if (!weaponId) {
      return;
    }
    const before = this.playerWeapons.reload;
    this.playerWeapons = startReload(this.playerWeapons, weaponId);
    if (!before && this.playerWeapons.reload) {
      this.events.record(this.timeMs, {
        type: "reload",
        position: { ...this.player.position },
        payload: { weaponId },
      });
    }
  }

  private useHealingItem(): void {
    if (this.playerWeapons.healingItems <= 0 || this.playerHealth.hp >= this.playerHealth.maxHp) {
      return;
    }
    this.playerWeapons = {
      ...this.playerWeapons,
      ammoByWeapon: { ...this.playerWeapons.ammoByWeapon },
      reserveAmmoByType: { ...this.playerWeapons.reserveAmmoByType },
      reload: this.playerWeapons.reload ? { ...this.playerWeapons.reload } : null,
      healingItems: this.playerWeapons.healingItems - 1,
    };
    this.playerHealth = {
      ...this.playerHealth,
      hp: Math.min(this.playerHealth.maxHp, this.playerHealth.hp + healingAmount),
      isDown: false,
    };
    this.events.record(this.timeMs, {
      type: "heal",
      position: { ...this.player.position },
      payload: { amount: healingAmount, hp: this.playerHealth.hp, maxHp: this.playerHealth.maxHp },
    });
  }

  private discoverNearbyBodies(guard: GuardRuntime): void {
    const range = bodyDiscoveryRange + this.adaptations.bodyCheckLevel * 1.2;
    for (const body of Object.values(this.bodyState.bodies)) {
      if (body.guardId === guard.id || body.discoveredBy) {
        continue;
      }
      const distance = Math.hypot(guard.position.x - body.position.x, guard.position.y - body.position.y);
      if (distance > range || !this.detection.hasClearRay(guard.position, body.position)) {
        continue;
      }

      this.bodyState = discoverBody(this.bodyState, {
        ...body,
        position: { ...body.position },
        discoveredBy: guard.id,
      });
      this.events.record(this.timeMs, {
        type: "body_discovered",
        position: { ...body.position },
        payload: { guardId: guard.id, bodyGuardId: body.guardId, bodyState: body.bodyState },
      });
      this.setAlertState(registerBodyDiscovery(this.alertState, body.bodyState));
      if (body.bodyState === "knocked_out" && !this.pendingWakeups.some((wakeup) => wakeup.guardId === body.guardId)) {
        this.pendingWakeups.push({
          guardId: body.guardId,
          wokenBy: guard.id,
          wakeAtMs: this.timeMs + bodyWakeDelayMs,
        });
      }
    }
  }

  private resolvePendingWakeups(): void {
    for (let index = this.pendingWakeups.length - 1; index >= 0; index -= 1) {
      const wakeup = this.pendingWakeups[index];
      if (this.timeMs < wakeup.wakeAtMs) {
        continue;
      }
      const body = this.bodyState.bodies[wakeup.guardId];
      if (!body || body.bodyState !== "knocked_out") {
        this.pendingWakeups.splice(index, 1);
        continue;
      }
      this.bodyState = wakeGuard(this.bodyState, wakeup.guardId, wakeup.wokenBy);
      this.guardHealth.set(wakeup.guardId, createHealthState(wakeup.guardId, 45 + this.adaptations.guardDurabilityLevel * 10));
      const guard = this.guards.find((candidate) => candidate.id === wakeup.guardId);
      if (guard) {
        guard.state = "search";
        guard.suspicion = Math.max(guard.suspicion, 0.55);
        guard.searchUntilMs = this.timeMs + 2000;
        guard.inspectionTarget = null;
      }
      this.events.record(this.timeMs, {
        type: "guard_wakeup",
        position: { ...body.position },
        payload: { guardId: wakeup.guardId, wokenBy: wakeup.wokenBy },
      });
      this.pendingWakeups.splice(index, 1);
    }
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
      if (this.bodyState.bodies[guard.id]) {
        continue;
      }

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

    const weaponPickup = this.map.weaponPickups.find(
      (candidate) =>
        !this.collectedWeaponPickups.has(candidate.id) &&
        Math.hypot(candidate.position.x - this.player.position.x, candidate.position.y - this.player.position.y) <=
          weaponPickupRadius,
    );
    if (weaponPickup) {
      this.collectedWeaponPickups.add(weaponPickup.id);
      this.playerWeapons = pickupWeapon(this.playerWeapons, weaponPickup.weaponId);
      this.playerWeapons = addReserveAmmo(
        this.playerWeapons,
        weapons[weaponPickup.weaponId].ammoType,
        Math.max(0, 12 - this.adaptations.ammoReductionLevel * 4),
      );
      this.events.record(this.timeMs, {
        type: "weapon_pickup",
        position: { ...weaponPickup.position },
        payload: { pickupId: weaponPickup.id, weaponId: weaponPickup.weaponId },
      });
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
      const guard = this.guards.find(
        (candidate) => !this.bodyState.bodies[candidate.id] && (candidate.state === "patrol" || candidate.state === "return"),
      );
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

  private applyGuardContactPressure(guard: GuardRuntime, canSeePlayer: boolean): void {
    if (guard.state !== "chase" || !canSeePlayer || this.player.hiddenIn) {
      return;
    }

    const distance = Math.hypot(guard.position.x - this.player.position.x, guard.position.y - this.player.position.y);
    if (distance > guardContactRange) {
      return;
    }

    const nextAllowedAt = this.guardContactCooldowns.get(guard.id) ?? 0;
    if (this.timeMs < nextAllowedAt) {
      return;
    }

    this.guardContactCooldowns.set(guard.id, this.timeMs + guardContactCooldownMs);
    this.applyPlayerDamage(guardContactDamage);
  }

  private setAlertState(next: AlertState): void {
    const previous = this.alertState;
    this.alertState = next;
    if (previous.level !== next.level) {
      this.events.record(this.timeMs, {
        type: "alert_changed",
        position: { ...this.player.position },
        payload: { from: previous.level, to: next.level, pressure: next.pressure },
      });
    }
    if (!previous.armedResponseTriggered && next.armedResponseTriggered) {
      this.events.record(this.timeMs, {
        type: "armed_response_triggered",
        position: { ...this.player.position },
        payload: { level: next.level, pressure: next.pressure },
      });
    }
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
