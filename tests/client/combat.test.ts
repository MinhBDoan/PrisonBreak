import { describe, expect, it } from "vitest";
import {
  addReserveAmmo,
  createInitialWeaponState,
  pickupWeapon,
  startReload,
  tickReload,
} from "../../client/src/game/WeaponSystem";
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
});
