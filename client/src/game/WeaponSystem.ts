import type { AmmoType, WeaponId, WeaponState } from "./types";
import { weapons } from "./weapons";

function loadedAmmoForPickup(weaponId: WeaponId): number {
  const weapon = weapons[weaponId];

  if (weapon.kind !== "gun") {
    return 0;
  }

  return Math.max(1, Math.floor(weapon.magazineSize / 2));
}

export function createInitialWeaponState(): WeaponState {
  return {
    meleeWeaponId: "makeshift_knife",
    primaryGunId: null,
    sidearmId: null,
    ammoByWeapon: {},
    reserveAmmoByType: {
      none: 0,
      nine_mm: 0,
      shells: 0,
      rifle: 0,
    },
    reload: null,
    healingItems: 1,
  };
}

export function pickupWeapon(state: WeaponState, weaponId: WeaponId): WeaponState {
  const weapon = weapons[weaponId];
  const ammoByWeapon =
    weapon.kind === "gun" && state.ammoByWeapon[weaponId] === undefined
      ? { ...state.ammoByWeapon, [weaponId]: loadedAmmoForPickup(weaponId) }
      : { ...state.ammoByWeapon };

  if (weapon.slot === "primary") {
    return { ...state, primaryGunId: weaponId, ammoByWeapon };
  }

  if (weapon.slot === "sidearm") {
    return { ...state, sidearmId: weaponId, ammoByWeapon };
  }

  return { ...state, meleeWeaponId: weaponId, ammoByWeapon };
}

export function addReserveAmmo(state: WeaponState, ammoType: AmmoType, amount: number): WeaponState {
  const added = Math.max(0, Math.floor(amount));

  return {
    ...state,
    reserveAmmoByType: {
      ...state.reserveAmmoByType,
      [ammoType]: state.reserveAmmoByType[ammoType] + added,
    },
  };
}

export function startReload(state: WeaponState, weaponId: WeaponId): WeaponState {
  const weapon = weapons[weaponId];
  const loaded = state.ammoByWeapon[weaponId] ?? 0;
  const reserve = state.reserveAmmoByType[weapon.ammoType];

  if (weapon.kind !== "gun" || reserve <= 0 || loaded >= weapon.magazineSize) {
    return { ...state, ammoByWeapon: { ...state.ammoByWeapon }, reserveAmmoByType: { ...state.reserveAmmoByType } };
  }

  return {
    ...state,
    ammoByWeapon: { ...state.ammoByWeapon },
    reserveAmmoByType: { ...state.reserveAmmoByType },
    reload: { weaponId, remainingMs: weapon.reloadMs },
  };
}

export function tickReload(state: WeaponState, elapsedMs: number): WeaponState {
  if (!state.reload) {
    return { ...state, ammoByWeapon: { ...state.ammoByWeapon }, reserveAmmoByType: { ...state.reserveAmmoByType } };
  }

  const remainingMs = state.reload.remainingMs - Math.max(0, elapsedMs);

  if (remainingMs > 0) {
    return {
      ...state,
      ammoByWeapon: { ...state.ammoByWeapon },
      reserveAmmoByType: { ...state.reserveAmmoByType },
      reload: { ...state.reload, remainingMs },
    };
  }

  const weapon = weapons[state.reload.weaponId];
  const loaded = state.ammoByWeapon[weapon.id] ?? 0;
  const needed = Math.max(0, weapon.magazineSize - loaded);
  const reserve = state.reserveAmmoByType[weapon.ammoType];
  const moved = Math.min(needed, reserve);

  return {
    ...state,
    ammoByWeapon: {
      ...state.ammoByWeapon,
      [weapon.id]: loaded + moved,
    },
    reserveAmmoByType: {
      ...state.reserveAmmoByType,
      [weapon.ammoType]: reserve - moved,
    },
    reload: null,
  };
}
