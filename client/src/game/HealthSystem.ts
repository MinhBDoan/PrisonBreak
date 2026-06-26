import type { HealthState } from "./types";

export function createHealthState(entityId: string, maxHp: number): HealthState {
  const normalizedMaxHp = Math.max(0, maxHp);

  return {
    entityId,
    hp: normalizedMaxHp,
    maxHp: normalizedMaxHp,
    isDown: normalizedMaxHp === 0,
  };
}

export function applyDamage(health: HealthState, amount: number): HealthState {
  const damage = Math.max(0, amount);
  const hp = Math.max(0, health.hp - damage);

  return {
    ...health,
    hp,
    isDown: hp === 0,
  };
}

export function restoreHealth(health: HealthState, amount: number): HealthState {
  if (health.isDown) {
    return { ...health };
  }

  const restored = Math.max(0, amount);

  return {
    ...health,
    hp: Math.min(health.maxHp, health.hp + restored),
  };
}

export function useHealingItem({
  health,
  healingItems,
  healAmount,
}: {
  health: HealthState;
  healingItems: number;
  healAmount: number;
}): { health: HealthState; healingItems: number; used: boolean } {
  if (health.isDown || health.hp >= health.maxHp || healingItems <= 0) {
    return {
      health: { ...health },
      healingItems,
      used: false,
    };
  }

  return {
    health: restoreHealth(health, healAmount),
    healingItems: healingItems - 1,
    used: true,
  };
}
