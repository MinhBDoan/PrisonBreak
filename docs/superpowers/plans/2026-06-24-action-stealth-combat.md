# Action-Stealth Combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add viable action-stealth combat with fists, melee weapons, guns, HP loss, bodies, staged alert, and combat-aware adaptive learning.

**Architecture:** Extend the existing planned Phaser/Vite client and Express/SQLite service. Combat rules stay in deterministic client simulation systems, while shared contracts and the service persist combat telemetry for analytics and validated Codex adaptations.

**Tech Stack:** TypeScript, Phaser 3, Vite, Express, SQLite via `better-sqlite3`, Vitest, Supertest, Zod, Codex CLI

---

## File Structure

```text
shared/contracts.ts                       Add combat event schemas and run outcome death
shared/adaptations.ts                     Add combat-aware adaptation allowlist and caps
client/src/game/types.ts                  Add weapon, health, body, alert, and combat types
client/src/game/weapons.ts                Weapon stat table and helpers
client/src/game/WeaponSystem.ts           Inventory, equipped slots, ammo, reloads, pickups
client/src/game/HealthSystem.ts           Player/guard HP, damage, healing, death outcome
client/src/game/BodySystem.ts             Knocked-out/dead guards, discovery, wakeups
client/src/game/AlertSystem.ts            Calm through lockdown pressure, cooldown, triggers
client/src/game/CombatSystem.ts           Punches, melee attacks, gun shots, hit resolution
client/src/game/ProjectileSystem.ts       Firearm aim, spread, line-of-fire, impacts
client/src/game/GameSimulation.ts         Integrate combat systems with update loop
client/src/game/GuardFSM.ts               Detection no longer captures; guards fight/chase
client/src/game/RunEventCollector.ts      Emit combat telemetry
client/src/render/GameRenderer.ts         Render equipped weapons, projectiles, bodies, hit effects
client/src/ui/Hud.ts                      Health, weapons, ammo, healing, alert feedback
service/src/services/AnalyticsService.ts  Include combat behavior summary
service/src/services/AdaptationValidator.ts Validate combat adaptation actions and targets
tests/client/combat.test.ts               Combat rules
tests/client/alert-body.test.ts           Bodies, wakeups, alert stages
tests/client/combat-integration.test.ts   Simulation-level combat and death outcome
tests/service/combat-analytics.test.ts    Combat telemetry analytics and adaptation validation
tests/contract/combat-contracts.test.ts   Shared event and outcome contracts
```

### Task 1: Add Combat Contracts

**Files:**
- Modify: `shared/contracts.ts`
- Test: `tests/contract/combat-contracts.test.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { RunEventSchema, RunOutcomeSchema } from "../../shared/contracts";

describe("combat contracts", () => {
  it("accepts a gun attack event with weapon and noise payload", () => {
    const event = RunEventSchema.parse({
      type: "attack",
      atMs: 1500,
      position: { x: 6, y: 4 },
      payload: {
        attackType: "gun",
        weaponId: "pistol",
        targetId: "guard-a",
        hit: true,
        damage: 35,
        noise: 70
      }
    });

    expect(event.type).toBe("attack");
    expect(event.payload.weaponId).toBe("pistol");
  });

  it("accepts player death as a run outcome", () => {
    expect(RunOutcomeSchema.parse("death")).toBe("death");
  });

  it("accepts body discovery and wakeup events", () => {
    expect(RunEventSchema.parse({
      type: "body_discovered",
      atMs: 3100,
      position: { x: 9, y: 2 },
      payload: { guardId: "guard-a", discoveredBy: "guard-b", bodyState: "knocked_out" }
    }).type).toBe("body_discovered");

    expect(RunEventSchema.parse({
      type: "guard_wakeup",
      atMs: 3600,
      position: { x: 9, y: 2 },
      payload: { guardId: "guard-a", wokenBy: "guard-b" }
    }).type).toBe("guard_wakeup");
  });
});
```

- [ ] **Step 2: Run the contract test and verify failure**

Run: `npm test -- tests/contract/combat-contracts.test.ts`

Expected: FAIL because combat event types and `death` are not defined.

- [ ] **Step 3: Extend shared contracts**

Update `shared/contracts.ts` so the relevant definitions include:

```ts
import { z } from "zod";

export const PositionSchema = z.object({ x: z.number(), y: z.number() });

export const RunOutcomeSchema = z.enum(["escape", "capture", "death"]);
export type RunOutcome = z.infer<typeof RunOutcomeSchema>;

export const RunEventTypeSchema = z.enum([
  "move",
  "sprint",
  "hide_enter",
  "hide_exit",
  "noise",
  "detection",
  "key_collected",
  "escape",
  "capture",
  "death",
  "weapon_pickup",
  "weapon_swap",
  "attack",
  "reload",
  "damage_dealt",
  "damage_taken",
  "knockout",
  "kill",
  "body_discovered",
  "guard_wakeup",
  "heal",
  "alert_changed",
  "armed_response_triggered"
]);

export const RunEventSchema = z.object({
  type: RunEventTypeSchema,
  atMs: z.number().nonnegative(),
  position: PositionSchema,
  payload: z.record(z.unknown())
});
export type RunEvent = z.infer<typeof RunEventSchema>;
```

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/contract/combat-contracts.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add shared/contracts.ts tests/contract/combat-contracts.test.ts
git commit -m "feat: add combat run contracts"
```

### Task 2: Define Weapons And Inventory

**Files:**
- Modify: `client/src/game/types.ts`
- Create: `client/src/game/weapons.ts`
- Create: `client/src/game/WeaponSystem.ts`
- Test: `tests/client/combat.test.ts`

- [ ] **Step 1: Write failing weapon tests**

```ts
import { describe, expect, it } from "vitest";
import { createInitialWeaponState, pickupWeapon, startReload, tickReload } from "../../client/src/game/WeaponSystem";
import { weapons } from "../../client/src/game/weapons";

describe("WeaponSystem", () => {
  it("starts with fists, a makeshift knife, no guns, and one healing item", () => {
    const state = createInitialWeaponState();

    expect(state.meleeWeaponId).toBe("makeshift_knife");
    expect(state.primaryGunId).toBeNull();
    expect(state.sidearmId).toBeNull();
    expect(state.healingItems).toBe(1);
  });

  it("makes fists and knife quieter than baton and guns", () => {
    expect(weapons.fists.noise).toBeLessThan(weapons.makeshift_knife.noise + 1);
    expect(weapons.makeshift_knife.noise).toBeLessThan(weapons.baton.noise);
    expect(weapons.baton.noise).toBeLessThan(weapons.pistol.noise);
    expect(weapons.pistol.noise).toBeLessThan(weapons.shotgun.noise);
  });

  it("equips found weapons into the correct slots", () => {
    let state = createInitialWeaponState();
    state = pickupWeapon(state, "assault_rifle");
    state = pickupWeapon(state, "pistol");
    state = pickupWeapon(state, "baton");

    expect(state.primaryGunId).toBe("assault_rifle");
    expect(state.sidearmId).toBe("pistol");
    expect(state.meleeWeaponId).toBe("baton");
  });

  it("reloads a gun after its reload time passes", () => {
    let state = createInitialWeaponState();
    state = pickupWeapon(state, "pistol");
    state.ammoByWeapon.pistol = 0;
    state.reserveAmmoByType.nine_mm = 6;

    state = startReload(state, "pistol");
    state = tickReload(state, weapons.pistol.reloadMs - 1);
    expect(state.ammoByWeapon.pistol).toBe(0);

    state = tickReload(state, 1);
    expect(state.ammoByWeapon.pistol).toBe(6);
    expect(state.reserveAmmoByType.nine_mm).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/client/combat.test.ts`

Expected: FAIL because weapon modules do not exist.

- [ ] **Step 3: Add weapon and inventory types**

In `client/src/game/types.ts`, add:

```ts
export type WeaponSlot = "fists" | "melee" | "sidearm" | "primary";
export type WeaponKind = "unarmed" | "melee" | "gun";
export type AmmoType = "none" | "nine_mm" | "shells" | "rifle";

export interface WeaponStats {
  id: WeaponId;
  label: string;
  slot: WeaponSlot;
  kind: WeaponKind;
  ammoType: AmmoType;
  damage: number;
  stun: number;
  range: number;
  attackMs: number;
  noise: number;
  lethal: boolean;
  magazineSize: number;
  reloadMs: number;
  recoil: number;
  movingAccuracyPenalty: number;
}

export type WeaponId =
  | "fists"
  | "makeshift_knife"
  | "baton"
  | "bat"
  | "pipe"
  | "pistol"
  | "smg"
  | "shotgun"
  | "assault_rifle"
  | "suppressed_pistol";

export interface WeaponState {
  meleeWeaponId: WeaponId;
  primaryGunId: WeaponId | null;
  sidearmId: WeaponId | null;
  ammoByWeapon: Partial<Record<WeaponId, number>>;
  reserveAmmoByType: Record<AmmoType, number>;
  reload:
    | { weaponId: WeaponId; remainingMs: number }
    | null;
  healingItems: number;
}
```

- [ ] **Step 4: Add the weapon stat table**

Create `client/src/game/weapons.ts`:

```ts
import type { WeaponId, WeaponStats } from "./types";

export const weapons: Record<WeaponId, WeaponStats> = {
  fists: {
    id: "fists", label: "Fists", slot: "fists", kind: "unarmed", ammoType: "none",
    damage: 8, stun: 18, range: 0.75, attackMs: 450, noise: 4, lethal: false,
    magazineSize: 0, reloadMs: 0, recoil: 0, movingAccuracyPenalty: 0
  },
  makeshift_knife: {
    id: "makeshift_knife", label: "Makeshift Knife", slot: "melee", kind: "melee", ammoType: "none",
    damage: 28, stun: 8, range: 0.85, attackMs: 360, noise: 8, lethal: true,
    magazineSize: 0, reloadMs: 0, recoil: 0, movingAccuracyPenalty: 0
  },
  baton: {
    id: "baton", label: "Baton", slot: "melee", kind: "melee", ammoType: "none",
    damage: 18, stun: 38, range: 1.0, attackMs: 520, noise: 22, lethal: false,
    magazineSize: 0, reloadMs: 0, recoil: 0, movingAccuracyPenalty: 0
  },
  bat: {
    id: "bat", label: "Bat", slot: "melee", kind: "melee", ammoType: "none",
    damage: 26, stun: 44, range: 1.15, attackMs: 700, noise: 30, lethal: false,
    magazineSize: 0, reloadMs: 0, recoil: 0, movingAccuracyPenalty: 0
  },
  pipe: {
    id: "pipe", label: "Pipe", slot: "melee", kind: "melee", ammoType: "none",
    damage: 30, stun: 35, range: 1.1, attackMs: 760, noise: 32, lethal: true,
    magazineSize: 0, reloadMs: 0, recoil: 0, movingAccuracyPenalty: 0
  },
  pistol: {
    id: "pistol", label: "Pistol", slot: "sidearm", kind: "gun", ammoType: "nine_mm",
    damage: 35, stun: 8, range: 7, attackMs: 280, noise: 70, lethal: true,
    magazineSize: 12, reloadMs: 1200, recoil: 5, movingAccuracyPenalty: 0.18
  },
  smg: {
    id: "smg", label: "SMG", slot: "primary", kind: "gun", ammoType: "nine_mm",
    damage: 18, stun: 4, range: 6, attackMs: 100, noise: 78, lethal: true,
    magazineSize: 24, reloadMs: 1600, recoil: 9, movingAccuracyPenalty: 0.3
  },
  shotgun: {
    id: "shotgun", label: "Shotgun", slot: "primary", kind: "gun", ammoType: "shells",
    damage: 75, stun: 30, range: 4, attackMs: 850, noise: 92, lethal: true,
    magazineSize: 5, reloadMs: 2100, recoil: 14, movingAccuracyPenalty: 0.35
  },
  assault_rifle: {
    id: "assault_rifle", label: "Assault Rifle", slot: "primary", kind: "gun", ammoType: "rifle",
    damage: 30, stun: 7, range: 9, attackMs: 150, noise: 86, lethal: true,
    magazineSize: 20, reloadMs: 1800, recoil: 10, movingAccuracyPenalty: 0.28
  },
  suppressed_pistol: {
    id: "suppressed_pistol", label: "Suppressed Pistol", slot: "sidearm", kind: "gun", ammoType: "nine_mm",
    damage: 26, stun: 6, range: 6, attackMs: 320, noise: 34, lethal: true,
    magazineSize: 8, reloadMs: 1400, recoil: 4, movingAccuracyPenalty: 0.14
  }
};
```

- [ ] **Step 5: Implement the inventory system**

Create `client/src/game/WeaponSystem.ts`:

```ts
import type { AmmoType, WeaponId, WeaponState } from "./types";
import { weapons } from "./weapons";

export function createInitialWeaponState(): WeaponState {
  return {
    meleeWeaponId: "makeshift_knife",
    primaryGunId: null,
    sidearmId: null,
    ammoByWeapon: {},
    reserveAmmoByType: { none: 0, nine_mm: 0, shells: 0, rifle: 0 },
    reload: null,
    healingItems: 1
  };
}

export function pickupWeapon(state: WeaponState, weaponId: WeaponId): WeaponState {
  const weapon = weapons[weaponId];
  const next: WeaponState = {
    ...state,
    ammoByWeapon: { ...state.ammoByWeapon },
    reserveAmmoByType: { ...state.reserveAmmoByType }
  };

  if (weapon.slot === "melee") next.meleeWeaponId = weaponId;
  if (weapon.slot === "sidearm") next.sidearmId = weaponId;
  if (weapon.slot === "primary") next.primaryGunId = weaponId;

  if (weapon.kind === "gun" && next.ammoByWeapon[weaponId] === undefined) {
    next.ammoByWeapon[weaponId] = Math.max(1, Math.floor(weapon.magazineSize / 2));
  }

  return next;
}

export function addReserveAmmo(state: WeaponState, ammoType: AmmoType, amount: number): WeaponState {
  return {
    ...state,
    reserveAmmoByType: {
      ...state.reserveAmmoByType,
      [ammoType]: state.reserveAmmoByType[ammoType] + amount
    }
  };
}

export function startReload(state: WeaponState, weaponId: WeaponId): WeaponState {
  const weapon = weapons[weaponId];
  if (weapon.kind !== "gun") return state;
  if (state.reload) return state;
  if (state.reserveAmmoByType[weapon.ammoType] <= 0) return state;
  if ((state.ammoByWeapon[weaponId] ?? 0) >= weapon.magazineSize) return state;
  return { ...state, reload: { weaponId, remainingMs: weapon.reloadMs } };
}

export function tickReload(state: WeaponState, deltaMs: number): WeaponState {
  if (!state.reload) return state;
  const remainingMs = state.reload.remainingMs - deltaMs;
  if (remainingMs > 0) {
    return { ...state, reload: { ...state.reload, remainingMs } };
  }

  const weapon = weapons[state.reload.weaponId];
  const currentAmmo = state.ammoByWeapon[weapon.id] ?? 0;
  const needed = weapon.magazineSize - currentAmmo;
  const loaded = Math.min(needed, state.reserveAmmoByType[weapon.ammoType]);

  return {
    ...state,
    ammoByWeapon: { ...state.ammoByWeapon, [weapon.id]: currentAmmo + loaded },
    reserveAmmoByType: {
      ...state.reserveAmmoByType,
      [weapon.ammoType]: state.reserveAmmoByType[weapon.ammoType] - loaded
    },
    reload: null
  };
}
```

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/client/combat.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add client/src/game/types.ts client/src/game/weapons.ts client/src/game/WeaponSystem.ts tests/client/combat.test.ts
git commit -m "feat: add combat weapons and inventory"
```

### Task 3: Add Health, Healing, And Death Outcome

**Files:**
- Modify: `client/src/game/types.ts`
- Create: `client/src/game/HealthSystem.ts`
- Modify: `client/src/game/GameSimulation.ts`
- Test: `tests/client/combat-integration.test.ts`

- [ ] **Step 1: Write failing health tests**

```ts
import { describe, expect, it } from "vitest";
import { applyDamage, createHealthState, useHealingItem } from "../../client/src/game/HealthSystem";

describe("HealthSystem", () => {
  it("only ends the run when player hp reaches zero", () => {
    let health = createHealthState("player", 100);
    health = applyDamage(health, 40);
    expect(health.hp).toBe(60);
    expect(health.isDown).toBe(false);

    health = applyDamage(health, 60);
    expect(health.hp).toBe(0);
    expect(health.isDown).toBe(true);
  });

  it("uses a healing item with a capped max hp", () => {
    const result = useHealingItem({
      health: applyDamage(createHealthState("player", 100), 60),
      healingItems: 1,
      healAmount: 35
    });

    expect(result.health.hp).toBe(75);
    expect(result.healingItems).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/client/combat-integration.test.ts`

Expected: FAIL because `HealthSystem` does not exist.

- [ ] **Step 3: Add health types**

In `client/src/game/types.ts`, add:

```ts
export interface HealthState {
  entityId: string;
  hp: number;
  maxHp: number;
  isDown: boolean;
}
```

- [ ] **Step 4: Implement health system**

Create `client/src/game/HealthSystem.ts`:

```ts
import type { HealthState } from "./types";

export function createHealthState(entityId: string, maxHp: number): HealthState {
  return { entityId, hp: maxHp, maxHp, isDown: false };
}

export function applyDamage(health: HealthState, amount: number): HealthState {
  const hp = Math.max(0, health.hp - Math.max(0, amount));
  return { ...health, hp, isDown: hp === 0 };
}

export function restoreHealth(health: HealthState, amount: number): HealthState {
  if (health.isDown) return health;
  return { ...health, hp: Math.min(health.maxHp, health.hp + Math.max(0, amount)) };
}

export function useHealingItem(input: {
  health: HealthState;
  healingItems: number;
  healAmount: number;
}): { health: HealthState; healingItems: number; used: boolean } {
  if (input.healingItems <= 0 || input.health.hp >= input.health.maxHp || input.health.isDown) {
    return { health: input.health, healingItems: input.healingItems, used: false };
  }

  return {
    health: restoreHealth(input.health, input.healAmount),
    healingItems: input.healingItems - 1,
    used: true
  };
}
```

- [ ] **Step 5: Integrate death outcome into simulation**

In `client/src/game/GameSimulation.ts`, when player health reaches zero, set the run outcome:

```ts
if (this.state.playerHealth.isDown && this.state.outcome === null) {
  this.state.outcome = "death";
  this.events.record({
    type: "death",
    atMs: this.state.elapsedMs,
    position: this.state.player.position,
    payload: { reason: "hp_zero" }
  });
}
```

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/client/combat-integration.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add client/src/game/types.ts client/src/game/HealthSystem.ts client/src/game/GameSimulation.ts tests/client/combat-integration.test.ts
git commit -m "feat: add health and death outcome"
```

### Task 4: Resolve Melee And Gun Combat

**Files:**
- Modify: `client/src/game/types.ts`
- Create: `client/src/game/ProjectileSystem.ts`
- Create: `client/src/game/CombatSystem.ts`
- Modify: `client/src/game/RunEventCollector.ts`
- Test: `tests/client/combat.test.ts`

- [ ] **Step 1: Add failing combat resolution tests**

Append to `tests/client/combat.test.ts`:

```ts
import { resolveAttack } from "../../client/src/game/CombatSystem";
import { createHealthState } from "../../client/src/game/HealthSystem";

describe("CombatSystem", () => {
  it("knocks out with a baton when stun exceeds remaining hp pressure", () => {
    const result = resolveAttack({
      attackerId: "player",
      targetId: "guard-a",
      weaponId: "baton",
      attackerPosition: { x: 1, y: 1 },
      targetPosition: { x: 1.5, y: 1 },
      targetHealth: createHealthState("guard-a", 45),
      moving: false,
      lineOfFireBlocked: false
    });

    expect(result.hit).toBe(true);
    expect(result.bodyState).toBe("knocked_out");
    expect(result.noise).toBe(22);
  });

  it("misses melee attacks outside weapon range", () => {
    const result = resolveAttack({
      attackerId: "player",
      targetId: "guard-a",
      weaponId: "makeshift_knife",
      attackerPosition: { x: 1, y: 1 },
      targetPosition: { x: 4, y: 1 },
      targetHealth: createHealthState("guard-a", 45),
      moving: false,
      lineOfFireBlocked: false
    });

    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
  });

  it("blocks gunshots when line of fire is blocked", () => {
    const result = resolveAttack({
      attackerId: "player",
      targetId: "guard-a",
      weaponId: "pistol",
      attackerPosition: { x: 1, y: 1 },
      targetPosition: { x: 4, y: 1 },
      targetHealth: createHealthState("guard-a", 45),
      moving: false,
      lineOfFireBlocked: true
    });

    expect(result.hit).toBe(false);
    expect(result.noise).toBe(70);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/client/combat.test.ts`

Expected: FAIL because `CombatSystem` does not exist.

- [ ] **Step 3: Add combat result types**

In `client/src/game/types.ts`, add:

```ts
export type BodyState = "active" | "knocked_out" | "dead";

export interface CombatResult {
  attackerId: string;
  targetId: string;
  weaponId: WeaponId;
  hit: boolean;
  damage: number;
  stun: number;
  noise: number;
  bodyState: BodyState;
}
```

- [ ] **Step 4: Implement projectile helper**

Create `client/src/game/ProjectileSystem.ts`:

```ts
import type { Position, WeaponStats } from "./types";

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isInWeaponRange(weapon: WeaponStats, attacker: Position, target: Position): boolean {
  return distance(attacker, target) <= weapon.range;
}

export function calculateHit(input: {
  weapon: WeaponStats;
  attacker: Position;
  target: Position;
  moving: boolean;
  lineOfFireBlocked: boolean;
}): boolean {
  if (!isInWeaponRange(input.weapon, input.attacker, input.target)) return false;
  if (input.weapon.kind === "gun" && input.lineOfFireBlocked) return false;
  return true;
}
```

- [ ] **Step 5: Implement combat resolution**

Create `client/src/game/CombatSystem.ts`:

```ts
import type { CombatResult, HealthState, Position, WeaponId } from "./types";
import { calculateHit } from "./ProjectileSystem";
import { weapons } from "./weapons";

export function resolveAttack(input: {
  attackerId: string;
  targetId: string;
  weaponId: WeaponId;
  attackerPosition: Position;
  targetPosition: Position;
  targetHealth: HealthState;
  moving: boolean;
  lineOfFireBlocked: boolean;
}): CombatResult {
  const weapon = weapons[input.weaponId];
  const hit = calculateHit({
    weapon,
    attacker: input.attackerPosition,
    target: input.targetPosition,
    moving: input.moving,
    lineOfFireBlocked: input.lineOfFireBlocked
  });

  if (!hit) {
    return {
      attackerId: input.attackerId,
      targetId: input.targetId,
      weaponId: input.weaponId,
      hit: false,
      damage: 0,
      stun: 0,
      noise: weapon.noise,
      bodyState: "active"
    };
  }

  const wouldDrop = input.targetHealth.hp - weapon.damage <= 0 || weapon.stun >= input.targetHealth.hp;
  const bodyState = wouldDrop ? (weapon.lethal ? "dead" : "knocked_out") : "active";

  return {
    attackerId: input.attackerId,
    targetId: input.targetId,
    weaponId: input.weaponId,
    hit: true,
    damage: weapon.damage,
    stun: weapon.stun,
    noise: weapon.noise,
    bodyState
  };
}
```

- [ ] **Step 6: Emit combat events from simulation**

When applying a `CombatResult`, record:

```ts
this.events.record({
  type: "attack",
  atMs: this.state.elapsedMs,
  position: attacker.position,
  payload: {
    attackType: weapons[result.weaponId].kind,
    weaponId: result.weaponId,
    targetId: result.targetId,
    hit: result.hit,
    damage: result.damage,
    noise: result.noise
  }
});

if (result.hit && result.damage > 0) {
  this.events.record({
    type: "damage_dealt",
    atMs: this.state.elapsedMs,
    position: target.position,
    payload: { targetId: result.targetId, weaponId: result.weaponId, damage: result.damage }
  });
}

if (result.bodyState === "knocked_out" || result.bodyState === "dead") {
  this.events.record({
    type: result.bodyState === "dead" ? "kill" : "knockout",
    atMs: this.state.elapsedMs,
    position: target.position,
    payload: { guardId: result.targetId, weaponId: result.weaponId }
  });
}
```

- [ ] **Step 7: Verify and commit**

Run: `npm test -- tests/client/combat.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add client/src/game/types.ts client/src/game/ProjectileSystem.ts client/src/game/CombatSystem.ts client/src/game/RunEventCollector.ts tests/client/combat.test.ts
git commit -m "feat: resolve melee and gun combat"
```

### Task 5: Add Bodies, Wakeups, And Staged Alert

**Files:**
- Modify: `client/src/game/types.ts`
- Create: `client/src/game/BodySystem.ts`
- Create: `client/src/game/AlertSystem.ts`
- Modify: `client/src/game/GuardFSM.ts`
- Modify: `client/src/game/GameSimulation.ts`
- Test: `tests/client/alert-body.test.ts`

- [ ] **Step 1: Write failing body and alert tests**

```ts
import { describe, expect, it } from "vitest";
import { createAlertState, registerBodyDiscovery, registerNoise, tickAlert } from "../../client/src/game/AlertSystem";
import { createBodyState, discoverBody, wakeGuard } from "../../client/src/game/BodySystem";

describe("BodySystem and AlertSystem", () => {
  it("keeps knocked out guards down until another guard wakes them", () => {
    let bodies = createBodyState();
    bodies = discoverBody(bodies, {
      guardId: "guard-a",
      bodyState: "knocked_out",
      position: { x: 3, y: 2 },
      discoveredBy: "guard-b"
    });

    expect(bodies.bodies["guard-a"].bodyState).toBe("knocked_out");

    bodies = wakeGuard(bodies, "guard-a", "guard-b");
    expect(bodies.bodies["guard-a"]).toBeUndefined();
  });

  it("raises alert more for dead bodies than knockouts", () => {
    const knockoutAlert = registerBodyDiscovery(createAlertState(), "knocked_out");
    const deadAlert = registerBodyDiscovery(createAlertState(), "dead");

    expect(deadAlert.pressure).toBeGreaterThan(knockoutAlert.pressure);
  });

  it("gunfire escalates in stages without instant lockdown", () => {
    let alert = createAlertState();
    alert = registerNoise(alert, 70);
    expect(alert.level).toBe("suspicious");

    alert = registerNoise(alert, 70);
    expect(alert.level).toBe("alert");

    alert = registerNoise(alert, 70);
    expect(alert.level).toBe("armed_response");
    expect(alert.level).not.toBe("lockdown_pressure");
  });

  it("cools down alert when the player avoids trouble", () => {
    let alert = registerNoise(createAlertState(), 70);
    alert = tickAlert(alert, 10000);
    expect(alert.pressure).toBeLessThan(20);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/client/alert-body.test.ts`

Expected: FAIL because body and alert modules do not exist.

- [ ] **Step 3: Add body and alert types**

In `client/src/game/types.ts`, add:

```ts
export type AlertLevel = "calm" | "suspicious" | "alert" | "armed_response" | "lockdown_pressure";

export interface AlertState {
  level: AlertLevel;
  pressure: number;
  armedResponseTriggered: boolean;
}

export interface BodyRecord {
  guardId: string;
  bodyState: Exclude<BodyState, "active">;
  position: Position;
  discoveredBy?: string;
}

export interface BodySystemState {
  bodies: Record<string, BodyRecord>;
}
```

- [ ] **Step 4: Implement body system**

Create `client/src/game/BodySystem.ts`:

```ts
import type { BodyRecord, BodySystemState } from "./types";

export function createBodyState(): BodySystemState {
  return { bodies: {} };
}

export function addBody(state: BodySystemState, body: BodyRecord): BodySystemState {
  return { bodies: { ...state.bodies, [body.guardId]: body } };
}

export function discoverBody(state: BodySystemState, body: BodyRecord): BodySystemState {
  return { bodies: { ...state.bodies, [body.guardId]: body } };
}

export function wakeGuard(state: BodySystemState, guardId: string, wokenBy: string): BodySystemState {
  const next = { ...state.bodies };
  const body = next[guardId];
  if (body?.bodyState === "knocked_out") {
    delete next[guardId];
  }
  return { bodies: next };
}
```

- [ ] **Step 5: Implement alert system**

Create `client/src/game/AlertSystem.ts`:

```ts
import type { AlertLevel, AlertState, BodyState } from "./types";

export function createAlertState(): AlertState {
  return { level: "calm", pressure: 0, armedResponseTriggered: false };
}

export function levelForPressure(pressure: number): AlertLevel {
  if (pressure >= 90) return "lockdown_pressure";
  if (pressure >= 60) return "armed_response";
  if (pressure >= 35) return "alert";
  if (pressure >= 10) return "suspicious";
  return "calm";
}

export function withPressure(state: AlertState, pressure: number): AlertState {
  const clamped = Math.max(0, Math.min(100, pressure));
  const level = levelForPressure(clamped);
  return {
    level,
    pressure: clamped,
    armedResponseTriggered: state.armedResponseTriggered || level === "armed_response" || level === "lockdown_pressure"
  };
}

export function registerNoise(state: AlertState, noise: number): AlertState {
  return withPressure(state, state.pressure + Math.max(0, noise) / 2);
}

export function registerBodyDiscovery(state: AlertState, bodyState: Exclude<BodyState, "active">): AlertState {
  return withPressure(state, state.pressure + (bodyState === "dead" ? 35 : 18));
}

export function tickAlert(state: AlertState, deltaMs: number): AlertState {
  return withPressure(state, state.pressure - deltaMs * 0.004);
}
```

- [ ] **Step 6: Integrate guard wakeups and alert event recording**

When a guard discovers a body in `GameSimulation`, call `registerBodyDiscovery`, then record:

```ts
this.events.record({
  type: "body_discovered",
  atMs: this.state.elapsedMs,
  position: body.position,
  payload: { guardId: body.guardId, discoveredBy: guard.id, bodyState: body.bodyState }
});

if (body.bodyState === "knocked_out") {
  this.events.record({
    type: "guard_wakeup",
    atMs: this.state.elapsedMs,
    position: body.position,
    payload: { guardId: body.guardId, wokenBy: guard.id }
  });
}
```

- [ ] **Step 7: Verify and commit**

Run: `npm test -- tests/client/alert-body.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add client/src/game/types.ts client/src/game/BodySystem.ts client/src/game/AlertSystem.ts client/src/game/GuardFSM.ts client/src/game/GameSimulation.ts tests/client/alert-body.test.ts
git commit -m "feat: add bodies and staged alert"
```

### Task 6: Integrate Combat Into Simulation And Guard Behavior

**Files:**
- Modify: `client/src/game/GameSimulation.ts`
- Modify: `client/src/game/GuardFSM.ts`
- Modify: `client/src/game/DetectionSystem.ts`
- Modify: `client/src/game/NoiseSystem.ts`
- Test: `tests/client/combat-integration.test.ts`

- [ ] **Step 1: Add failing simulation integration tests**

Append to `tests/client/combat-integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";

describe("combat simulation integration", () => {
  it("detection creates chase pressure instead of capture outcome", () => {
    const sim = GameSimulation.createTestScenario({
      playerPosition: { x: 2, y: 2 },
      guardPosition: { x: 3, y: 2 },
      guardCanSeePlayer: true
    });

    sim.update(1000);

    expect(sim.getState().outcome).toBeNull();
    expect(sim.getState().guards[0].state).toBe("chase");
  });

  it("player death happens when melee damage reduces hp to zero", () => {
    const sim = GameSimulation.createTestScenario({
      playerHp: 10,
      playerPosition: { x: 2, y: 2 },
      guardPosition: { x: 2.5, y: 2 },
      guardCanSeePlayer: true
    });

    sim.guardAttack("guard-1");

    expect(sim.getState().outcome).toBe("death");
  });

  it("a gun attack creates noise and escalates alert without instant lockdown", () => {
    const sim = GameSimulation.createTestScenario({
      playerWeapon: "pistol",
      playerPosition: { x: 2, y: 2 },
      guardPosition: { x: 5, y: 2 }
    });

    sim.playerAttack("guard-1", "pistol");

    expect(sim.getState().alert.level).toBe("suspicious");
    expect(sim.getState().alert.level).not.toBe("lockdown_pressure");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/client/combat-integration.test.ts`

Expected: FAIL because simulation has not integrated combat APIs.

- [ ] **Step 3: Add simulation combat commands**

Add these public methods to `GameSimulation`:

```ts
playerAttack(targetGuardId: string, weaponId: WeaponId): void {
  const guard = this.findGuard(targetGuardId);
  const result = resolveAttack({
    attackerId: "player",
    targetId: guard.id,
    weaponId,
    attackerPosition: this.state.player.position,
    targetPosition: guard.position,
    targetHealth: guard.health,
    moving: this.state.player.isMoving,
    lineOfFireBlocked: this.lineOfFireBlocked(this.state.player.position, guard.position)
  });

  this.applyCombatResult(result);
}

guardAttack(guardId: string): void {
  const guard = this.findGuard(guardId);
  const result = resolveAttack({
    attackerId: guard.id,
    targetId: "player",
    weaponId: guard.armed ? "pistol" : "fists",
    attackerPosition: guard.position,
    targetPosition: this.state.player.position,
    targetHealth: this.state.playerHealth,
    moving: false,
    lineOfFireBlocked: this.lineOfFireBlocked(guard.position, this.state.player.position)
  });

  this.applyCombatResult(result);
}
```

- [ ] **Step 4: Change detection outcome**

In `DetectionSystem` or `GuardFSM`, remove capture-progress failure and route sustained detection to chase/combat:

```ts
if (detection.canSeePlayer) {
  guard.state = "chase";
  guard.lastKnownPlayerPosition = player.position;
  return guard;
}
```

- [ ] **Step 5: Apply noise and alert for attacks**

In `applyCombatResult`, register weapon noise:

```ts
this.state.alert = registerNoise(this.state.alert, result.noise);
this.noise.emit({
  sourceId: result.attackerId,
  position: this.getEntityPosition(result.attackerId),
  radius: Math.max(1, result.noise / 10),
  intensity: result.noise
});
```

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/client/combat-integration.test.ts && npm test -- tests/client/simulation.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add client/src/game/GameSimulation.ts client/src/game/GuardFSM.ts client/src/game/DetectionSystem.ts client/src/game/NoiseSystem.ts tests/client/combat-integration.test.ts
git commit -m "feat: integrate combat into simulation"
```

### Task 7: Add Combat Analytics And Adaptations

**Files:**
- Modify: `shared/adaptations.ts`
- Modify: `service/src/services/AnalyticsService.ts`
- Modify: `service/src/services/AdaptationValidator.ts`
- Test: `tests/service/combat-analytics.test.ts`

- [ ] **Step 1: Write failing service tests**

```ts
import { describe, expect, it } from "vitest";
import { validateAdaptation } from "../../service/src/services/AdaptationValidator";
import { calculateBehaviorSummary } from "../../service/src/services/AnalyticsService";

describe("combat analytics and adaptations", () => {
  it("summarizes heavy gun reliance and repeated gunfight zone", () => {
    const summary = calculateBehaviorSummary([
      {
        runId: "run-1",
        outcome: "escape",
        events: [
          { type: "attack", atMs: 100, position: { x: 5, y: 2 }, payload: { attackType: "gun", weaponId: "pistol", noise: 70 } },
          { type: "reload", atMs: 400, position: { x: 5, y: 2 }, payload: { weaponId: "pistol" } },
          { type: "kill", atMs: 500, position: { x: 5, y: 2 }, payload: { guardId: "guard-a", weaponId: "pistol" } }
        ]
      }
    ]);

    expect(summary.combat.primaryStyle).toBe("gun");
    expect(summary.combat.favoriteCombatZone).toBe("security_corridor");
  });

  it("accepts capped combat adaptation actions", () => {
    const result = validateAdaptation({
      action: "place_armed_response",
      target: "security_corridor",
      rationale: "Player repeatedly starts gunfights in the security corridor."
    }, { place_armed_response: 0 });

    expect(result.ok).toBe(true);
  });

  it("rejects combat adaptations over their cap", () => {
    const result = validateAdaptation({
      action: "reduce_ammo_availability",
      target: "global",
      rationale: "Player uses guns heavily."
    }, { reduce_ammo_availability: 2 });

    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/service/combat-analytics.test.ts`

Expected: FAIL because combat analytics and adaptations are not defined.

- [ ] **Step 3: Extend adaptation allowlist**

In `shared/adaptations.ts`, include:

```ts
export const adaptationCaps = {
  increase_corridor_patrol: 3,
  inspect_hiding_spot: 2,
  increase_noise_sensitivity: 2,
  activate_reserve_guard: 1,
  add_body_checks: 2,
  place_armed_response: 2,
  improve_guard_cover: 2,
  increase_guard_durability: 2,
  reduce_ammo_availability: 2,
  increase_melee_caution: 2
} as const;

export type AdaptationType = keyof typeof adaptationCaps;
```

- [ ] **Step 4: Extend analytics summary**

In `AnalyticsService`, include combat fields:

```ts
export interface CombatBehaviorSummary {
  primaryStyle: "stealth" | "melee" | "gun" | "hybrid";
  favoriteCombatZone: string | null;
  gunAttackCount: number;
  meleeAttackCount: number;
  knockoutCount: number;
  killCount: number;
  bodyDiscoveryCount: number;
  healingUseCount: number;
  armedResponseTriggers: number;
}
```

Calculate these from `attack`, `knockout`, `kill`, `body_discovered`, `heal`, and `armed_response_triggered` events. Map event positions to existing named map zones using the same corridor or tile naming helper used by route analytics.

- [ ] **Step 5: Extend adaptation validation**

Allow these targets:

```ts
const combatTargets = z.enum([
  "global",
  "cell_corridor",
  "security_corridor",
  "exit_corridor",
  "security_room",
  "armory"
]);
```

Require `place_armed_response`, `add_body_checks`, `improve_guard_cover`, and `increase_melee_caution` to target a named zone. Require `reduce_ammo_availability` and `increase_guard_durability` to target `global`.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/service/combat-analytics.test.ts && npm test -- tests/service/adaptation.test.ts && npm run typecheck`

Expected: PASS.

```bash
git add shared/adaptations.ts service/src/services/AnalyticsService.ts service/src/services/AdaptationValidator.ts tests/service/combat-analytics.test.ts
git commit -m "feat: add combat analytics and adaptations"
```

### Task 8: Render Combat UI And Feedback

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `client/src/ui/Hud.ts`
- Modify: `client/src/styles.css`
- Modify: `client/src/scenes/GameScene.ts`
- Test: `tests/client/renderer.test.ts`

- [ ] **Step 1: Add failing renderer and HUD tests**

Append to `tests/client/renderer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHudModel } from "../../client/src/ui/Hud";
import { createRenderModel } from "../../client/src/render/GameRenderer";

describe("combat rendering and HUD", () => {
  it("includes health, weapons, ammo, healing, and alert in the HUD model", () => {
    const hud = createHudModel({
      playerHealth: { entityId: "player", hp: 65, maxHp: 100, isDown: false },
      weapons: {
        meleeWeaponId: "baton",
        primaryGunId: "assault_rifle",
        sidearmId: "pistol",
        ammoByWeapon: { pistol: 6, assault_rifle: 12 },
        reserveAmmoByType: { none: 0, nine_mm: 18, shells: 0, rifle: 20 },
        reload: null,
        healingItems: 2
      },
      alert: { level: "alert", pressure: 48, armedResponseTriggered: false }
    });

    expect(hud.healthLabel).toBe("65 / 100");
    expect(hud.weaponLabel).toContain("Baton");
    expect(hud.ammoLabel).toContain("12");
    expect(hud.alertLabel).toBe("Alert");
  });

  it("renders bodies and projectiles as separate descriptors", () => {
    const model = createRenderModel({
      bodies: {
        bodies: {
          "guard-a": { guardId: "guard-a", bodyState: "knocked_out", position: { x: 3, y: 2 } }
        }
      },
      projectiles: [{ id: "shot-1", from: { x: 1, y: 1 }, to: { x: 4, y: 1 }, ageMs: 40 }]
    });

    expect(model.bodies[0].state).toBe("knocked_out");
    expect(model.projectiles[0].id).toBe("shot-1");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- tests/client/renderer.test.ts`

Expected: FAIL because combat render/HUD models are missing.

- [ ] **Step 3: Implement HUD model**

Expose a pure `createHudModel` helper from `client/src/ui/Hud.ts`:

```ts
import { weapons } from "../game/weapons";
import type { AlertState, HealthState, WeaponState } from "../game/types";

export function createHudModel(input: {
  playerHealth: HealthState;
  weapons: WeaponState;
  alert: AlertState;
}) {
  const melee = weapons[input.weapons.meleeWeaponId].label;
  const primary = input.weapons.primaryGunId ? weapons[input.weapons.primaryGunId].label : "No Primary";
  const primaryAmmo = input.weapons.primaryGunId ? input.weapons.ammoByWeapon[input.weapons.primaryGunId] ?? 0 : 0;

  return {
    healthLabel: `${input.playerHealth.hp} / ${input.playerHealth.maxHp}`,
    weaponLabel: `${melee} | ${primary}`,
    ammoLabel: input.weapons.primaryGunId ? `${primaryAmmo} loaded` : "No primary ammo",
    healingLabel: `${input.weapons.healingItems}`,
    alertLabel: input.alert.level.split("_").map(part => part[0].toUpperCase() + part.slice(1)).join(" ")
  };
}
```

- [ ] **Step 4: Implement render descriptors**

In `client/src/render/GameRenderer.ts`, add body and projectile descriptors:

```ts
export function createRenderModel(state: {
  bodies?: BodySystemState;
  projectiles?: Array<{ id: string; from: Position; to: Position; ageMs: number }>;
}) {
  return {
    bodies: Object.values(state.bodies?.bodies ?? {}).map(body => ({
      id: body.guardId,
      x: body.position.x,
      y: body.position.y,
      state: body.bodyState
    })),
    projectiles: (state.projectiles ?? []).map(projectile => ({
      id: projectile.id,
      from: projectile.from,
      to: projectile.to,
      alpha: Math.max(0, 1 - projectile.ageMs / 120)
    }))
  };
}
```

- [ ] **Step 5: Update visible UI**

In the DOM HUD, add stable elements for health, weapons, ammo, healing, and alert. Keep them compact so they do not cover the playfield:

```html
<div class="hud-combat">
  <div data-hud-health></div>
  <div data-hud-weapons></div>
  <div data-hud-ammo></div>
  <div data-hud-heals></div>
  <div data-hud-alert></div>
</div>
```

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/client/renderer.test.ts && npm run build`

Expected: PASS.

```bash
git add client/src/render/GameRenderer.ts client/src/ui/Hud.ts client/src/styles.css client/src/scenes/GameScene.ts tests/client/renderer.test.ts
git commit -m "feat: render combat feedback"
```

### Task 9: Final Combat Verification And Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-06-09-adaptive-prison-break-design.md`
- Test: `tests/service/full-loop.test.ts`

- [ ] **Step 1: Add full-loop combat test**

Append to `tests/service/full-loop.test.ts`:

```ts
it("stores combat events and returns a combat-aware next-run adaptation", async () => {
  const run = await api.startRun();

  const response = await api.completeRun(run.runId, {
    outcome: "death",
    durationMs: 90000,
    idempotencyKey: "combat-run-1",
    events: [
      { type: "weapon_pickup", atMs: 1000, position: { x: 4, y: 3 }, payload: { weaponId: "pistol" } },
      { type: "attack", atMs: 2000, position: { x: 5, y: 2 }, payload: { attackType: "gun", weaponId: "pistol", noise: 70 } },
      { type: "damage_taken", atMs: 2500, position: { x: 5, y: 2 }, payload: { sourceId: "armed-response-1", damage: 40 } },
      { type: "death", atMs: 90000, position: { x: 6, y: 2 }, payload: { reason: "hp_zero" } }
    ]
  });

  expect(response.nextRunConfig.adaptations.length).toBeGreaterThan(0);
  expect(response.report.summary).toContain("combat");
});
```

- [ ] **Step 2: Run the test and verify failure or integration gaps**

Run: `npm test -- tests/service/full-loop.test.ts`

Expected before final integration: FAIL if full-loop contracts, analytics, or report text do not include combat events.

- [ ] **Step 3: Update the original MVP spec non-goal**

In `docs/superpowers/specs/2026-06-09-adaptive-prison-break-design.md`, replace the explicit non-goal `Combat or player health` with:

```md
- Full military squad tactics
- Complex armor or character build systems
```

- [ ] **Step 4: Update README controls and feature notes**

Document:

```md
## Combat Controls

- Punch: left mouse or assigned attack key with fists selected
- Melee: attack with equipped melee weapon
- Aim/fire gun: mouse aim and fire
- Reload: R
- Heal: H
- Swap weapons: number keys or mouse wheel

## Combat Rules

The player starts with fists and a makeshift knife. Detection no longer ends the run by itself; HP reaching zero ends the run. Gunplay is viable, but creates more noise, uses ammo, and raises staged alert pressure. Stealth remains valuable because it avoids damage, saves resources, and prevents body discovery chains.
```

- [ ] **Step 5: Run full verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 6: Manual playtest checklist**

Start the service and client, then verify:

- A run can end by escape or HP reaching zero.
- Detection starts chase or combat instead of direct capture.
- Punch and knife attacks create less noise than baton, bat, pistol, and shotgun.
- Knocked-out guards remain down until discovered.
- A discovered knocked-out guard is woken.
- A discovered dead guard raises alert more strongly.
- Gunfire escalates alert in stages without immediate lockdown.
- Armed response appears after sustained combat pressure.
- HUD shows health, weapons, ammo, healing items, and alert.
- Combat events appear in stored run events and the next intelligence report.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/superpowers/specs/2026-06-09-adaptive-prison-break-design.md tests/service/full-loop.test.ts
git commit -m "docs: finalize action stealth combat pass"
```

## Plan Self-Review

- Spec coverage: weapons, inventory, per-weapon noise, health loss, non-capture detection, bodies, wakeups, staged alert, combat analytics, combat adaptations, UI, and tests all map to tasks.
- Placeholder scan: no `TBD`, `TODO`, or incomplete implementation steps remain.
- Type consistency: `WeaponId`, `WeaponState`, `HealthState`, `BodyState`, `AlertState`, `CombatResult`, `RunOutcomeSchema`, and combat event names are introduced before later tasks use them.
- Scope check: this plan assumes the base MVP architecture from `2026-06-09-adaptive-prison-break-mvp.md` exists or is being implemented first. It does not add multiplayer, procedural maps, complex armor builds, squad tactics, or weapon crafting.
