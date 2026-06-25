import { calculateHit } from "./ProjectileSystem";
import type { BodyState, CombatResult, HealthState, Vector, WeaponId } from "./types";
import { weapons } from "./weapons";

export type ResolveAttackInput = {
  attackerId: string;
  targetId: string;
  weaponId: WeaponId;
  attackerPosition: Vector;
  targetPosition: Vector;
  targetHealth: HealthState;
  moving: boolean;
  lineOfFireBlocked: boolean;
};

function resolveBodyState({
  weaponId,
  targetHealth,
}: {
  weaponId: WeaponId;
  targetHealth: HealthState;
}): BodyState {
  const weapon = weapons[weaponId];
  const overwhelmsTarget = weapon.damage >= targetHealth.hp || weapon.stun >= targetHealth.hp;

  if (!overwhelmsTarget) {
    return "active";
  }

  return weapon.lethal ? "dead" : "knocked_out";
}

function resolveDamage({
  weaponId,
  targetHealth,
  bodyState,
}: {
  weaponId: WeaponId;
  targetHealth: HealthState;
  bodyState: BodyState;
}): number {
  const weaponDamage = weapons[weaponId].damage;

  if (bodyState === "active") {
    return weaponDamage;
  }

  return Math.max(weaponDamage, targetHealth.hp);
}

export function resolveAttack(input: ResolveAttackInput): CombatResult {
  const weapon = weapons[input.weaponId];
  const hit = calculateHit({
    weapon,
    attacker: input.attackerPosition,
    target: input.targetPosition,
    moving: input.moving,
    lineOfFireBlocked: input.lineOfFireBlocked,
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
      bodyState: "active",
    };
  }

  const bodyState = resolveBodyState({
    weaponId: input.weaponId,
    targetHealth: input.targetHealth,
  });

  return {
    attackerId: input.attackerId,
    targetId: input.targetId,
    weaponId: input.weaponId,
    hit: true,
    damage: resolveDamage({
      weaponId: input.weaponId,
      targetHealth: input.targetHealth,
      bodyState,
    }),
    stun: weapon.stun,
    noise: weapon.noise,
    bodyState,
  };
}
