import type { Vector, WeaponStats } from "./types";

export function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isInWeaponRange(weapon: WeaponStats, attacker: Vector, target: Vector): boolean {
  return distance(attacker, target) <= weapon.range;
}

export function calculateHit({
  weapon,
  attacker,
  target,
  lineOfFireBlocked,
}: {
  weapon: WeaponStats;
  attacker: Vector;
  target: Vector;
  moving: boolean;
  lineOfFireBlocked: boolean;
}): boolean {
  if (!isInWeaponRange(weapon, attacker, target)) {
    return false;
  }

  if (weapon.kind === "gun" && lineOfFireBlocked) {
    return false;
  }

  return true;
}
