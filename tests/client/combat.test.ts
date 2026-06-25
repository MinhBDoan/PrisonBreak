import { describe, expect, it } from "vitest";
import {
  addReserveAmmo,
  createInitialWeaponState,
  pickupWeapon,
  startReload,
  tickReload,
} from "../../client/src/game/WeaponSystem";
import { resolveAttack } from "../../client/src/game/CombatSystem";
import { weapons } from "../../client/src/game/weapons";

describe("combat weapons and inventory", () => {
  it("creates the planned initial weapon state", () => {
    const state = createInitialWeaponState();

    expect(state).toEqual({
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
    });
  });

  it("keeps weapon noise ordered by loudness", () => {
    expect(weapons.fists.noise).toBe(4);
    expect(weapons.makeshift_knife.noise).toBe(8);
    expect(weapons.baton.noise).toBe(22);
    expect(weapons.bat.noise).toBe(30);
    expect(weapons.pipe.noise).toBe(32);
    expect(weapons.suppressed_pistol.noise).toBe(34);
    expect(weapons.pistol.noise).toBe(70);
    expect(weapons.smg.noise).toBe(78);
    expect(weapons.assault_rifle.noise).toBe(86);
    expect(weapons.shotgun.noise).toBe(92);
  });

  it("equips pickups by slot and initializes guns with half a magazine", () => {
    const initial = createInitialWeaponState();
    const withBaton = pickupWeapon(initial, "baton");
    const withPistol = pickupWeapon(withBaton, "pistol");
    const withRifle = pickupWeapon(withPistol, "assault_rifle");

    expect(withBaton.meleeWeaponId).toBe("baton");
    expect(withPistol.sidearmId).toBe("pistol");
    expect(withPistol.ammoByWeapon.pistol).toBe(Math.floor(weapons.pistol.magazineSize / 2));
    expect(withRifle.primaryGunId).toBe("assault_rifle");
    expect(withRifle.ammoByWeapon.assault_rifle).toBe(Math.floor(weapons.assault_rifle.magazineSize / 2));
    expect(initial).toEqual(createInitialWeaponState());
  });

  it("moves reserve ammo into a weapon only after reload time elapses", () => {
    const loaded = pickupWeapon(createInitialWeaponState(), "pistol");
    const empty = { ...loaded, ammoByWeapon: { ...loaded.ammoByWeapon, pistol: 0 } };
    const stocked = addReserveAmmo(empty, "nine_mm", 10);
    const reloading = startReload(stocked, "pistol");

    expect(reloading.reload).toEqual({ weaponId: "pistol", remainingMs: weapons.pistol.reloadMs });
    expect(tickReload(reloading, weapons.pistol.reloadMs - 1).ammoByWeapon.pistol).toBe(0);

    const finished = tickReload(reloading, weapons.pistol.reloadMs);

    expect(finished.reload).toBeNull();
    expect(finished.ammoByWeapon.pistol).toBe(10);
    expect(finished.reserveAmmoByType.nine_mm).toBe(0);
  });

  it("preserves an active reload when reload input repeats", () => {
    const loaded = pickupWeapon(createInitialWeaponState(), "pistol");
    const empty = { ...loaded, ammoByWeapon: { ...loaded.ammoByWeapon, pistol: 0 } };
    const stocked = addReserveAmmo(empty, "nine_mm", 10);
    const reloading = startReload(stocked, "pistol");
    const partiallyReloaded = tickReload(reloading, 300);
    const repeatedReload = startReload(partiallyReloaded, "pistol");

    expect(repeatedReload).toEqual(partiallyReloaded);
    expect(repeatedReload).not.toBe(partiallyReloaded);
    expect(repeatedReload.reload).toEqual({
      weaponId: "pistol",
      remainingMs: weapons.pistol.reloadMs - 300,
    });
  });

  it("baton knocks out when stun exceeds remaining hp pressure", () => {
    const result = resolveAttack({
      attackerId: "player",
      targetId: "guard-1",
      weaponId: "baton",
      attackerPosition: { x: 0, y: 0 },
      targetPosition: { x: 0.5, y: 0 },
      targetHealth: { entityId: "guard-1", hp: 30, maxHp: 100, isDown: false },
      moving: false,
      lineOfFireBlocked: false,
    });

    expect(result).toEqual({
      attackerId: "player",
      targetId: "guard-1",
      weaponId: "baton",
      hit: true,
      damage: weapons.baton.damage,
      stun: weapons.baton.stun,
      noise: 22,
      bodyState: "knocked_out",
    });
  });

  it("makeshift knife misses outside melee range", () => {
    const result = resolveAttack({
      attackerId: "player",
      targetId: "guard-1",
      weaponId: "makeshift_knife",
      attackerPosition: { x: 0, y: 0 },
      targetPosition: { x: 2, y: 0 },
      targetHealth: { entityId: "guard-1", hp: 100, maxHp: 100, isDown: false },
      moving: false,
      lineOfFireBlocked: false,
    });

    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
    expect(result.stun).toBe(0);
    expect(result.noise).toBe(8);
    expect(result.bodyState).toBe("active");
  });

  it("pistol gunshot with blocked line of fire misses but still reports noise", () => {
    const result = resolveAttack({
      attackerId: "player",
      targetId: "guard-1",
      weaponId: "pistol",
      attackerPosition: { x: 0, y: 0 },
      targetPosition: { x: 4, y: 0 },
      targetHealth: { entityId: "guard-1", hp: 100, maxHp: 100, isDown: false },
      moving: false,
      lineOfFireBlocked: true,
    });

    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
    expect(result.stun).toBe(0);
    expect(result.noise).toBe(70);
    expect(result.bodyState).toBe("active");
  });

  it("lethal weapon returns dead when damage drops target hp to zero", () => {
    const result = resolveAttack({
      attackerId: "player",
      targetId: "guard-1",
      weaponId: "pipe",
      attackerPosition: { x: 0, y: 0 },
      targetPosition: { x: 0.5, y: 0 },
      targetHealth: { entityId: "guard-1", hp: 32, maxHp: 100, isDown: false },
      moving: false,
      lineOfFireBlocked: false,
    });

    expect(result.hit).toBe(true);
    expect(result.damage).toBe(weapons.pipe.damage);
    expect(result.stun).toBe(weapons.pipe.stun);
    expect(result.noise).toBe(weapons.pipe.noise);
    expect(result.bodyState).toBe("dead");
  });
});
