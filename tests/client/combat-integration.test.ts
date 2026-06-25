import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import {
  applyDamage,
  createHealthState,
  restoreHealth,
  useHealingItem,
} from "../../client/src/game/HealthSystem";
import { prisonMap } from "../../client/src/game/map";
import type { SimulationInput } from "../../client/src/game/types";

const noInput: SimulationInput = {
  direction: { x: 0, y: 0 },
  sprint: false,
  interact: false,
};

function stepMany(simulation: GameSimulation, count: number, input = noInput): void {
  for (let i = 0; i < count; i += 1) {
    simulation.step(input);
  }
}

describe("health and healing", () => {
  it("only downs an entity when damage reaches zero HP", () => {
    const health = createHealthState("player", 100);
    const damaged = applyDamage(health, 35);
    const downed = applyDamage(damaged, 100);

    expect(damaged).toEqual({ entityId: "player", hp: 65, maxHp: 100, isDown: false });
    expect(downed).toEqual({ entityId: "player", hp: 0, maxHp: 100, isDown: true });
    expect(health).toEqual({ entityId: "player", hp: 100, maxHp: 100, isDown: false });
  });

  it("restores healing item HP up to max and decrements item count", () => {
    const health = applyDamage(createHealthState("player", 100), 30);

    const result = useHealingItem({ health, healingItems: 2, healAmount: 50 });

    expect(result).toEqual({
      health: { entityId: "player", hp: 100, maxHp: 100, isDown: false },
      healingItems: 1,
      used: true,
    });
  });

  it("cannot heal when no items remain or health is already full", () => {
    const damaged = applyDamage(createHealthState("player", 100), 20);
    const noItems = useHealingItem({ health: damaged, healingItems: 0, healAmount: 25 });
    const alreadyFull = useHealingItem({ health: createHealthState("player", 100), healingItems: 1, healAmount: 25 });

    expect(noItems).toEqual({ health: damaged, healingItems: 0, used: false });
    expect(alreadyFull).toEqual({
      health: { entityId: "player", hp: 100, maxHp: 100, isDown: false },
      healingItems: 1,
      used: false,
    });
  });

  it("does not let negative damage change HP", () => {
    const damaged = applyDamage(createHealthState("player", 100), 15);

    expect(applyDamage(damaged, -20)).toEqual(damaged);
  });

  it("does not revive a downed entity through restoreHealth", () => {
    const downed = applyDamage(createHealthState("player", 100), 100);

    expect(restoreHealth(downed, 50)).toEqual(downed);
  });
});

describe("simulation health outcome", () => {
  it("includes cloned player combat state in snapshots", () => {
    const simulation = new GameSimulation();

    const snapshot = simulation.getSnapshot();

    expect(snapshot.player.health).toEqual({
      entityId: "player",
      hp: 100,
      maxHp: 100,
      isDown: false,
    });
    expect(snapshot.alert).toEqual({
      level: "calm",
      pressure: 0,
      armedResponseTriggered: false,
    });
    expect(snapshot.player.weapons).toMatchObject({
      meleeWeaponId: "makeshift_knife",
      primaryGunId: null,
      sidearmId: null,
      healingItems: 1,
    });

    snapshot.player.health.hp = 1;
    snapshot.alert.pressure = 99;
    snapshot.player.weapons.healingItems = 0;
    snapshot.player.weapons.reserveAmmoByType.nine_mm = 99;

    expect(simulation.getSnapshot().player.health.hp).toBe(100);
    expect(simulation.getSnapshot().alert.pressure).toBe(0);
    expect(simulation.getSnapshot().player.weapons.healingItems).toBe(1);
    expect(simulation.getSnapshot().player.weapons.reserveAmmoByType.nine_mm).toBe(0);
  });

  it("records death when player damage reaches zero health", () => {
    const simulation = new GameSimulation();

    simulation.applyPlayerDamage(40);
    expect(simulation.getPlayerHealth()).toEqual({
      entityId: "player",
      hp: 60,
      maxHp: 100,
      isDown: false,
    });
    expect(simulation.getSnapshot().completed).toBeNull();

    simulation.applyPlayerDamage(60);

    expect(simulation.getPlayerHealth()).toEqual({
      entityId: "player",
      hp: 0,
      maxHp: 100,
      isDown: true,
    });
    expect(simulation.getSnapshot().completed?.outcome).toBe("death");
    expect(simulation.getEvents().some((event) => event.type === "death")).toBe(true);
  });

  it("repeated active guard contact reduces player HP to zero and records death", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 5.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 6.5, y: 2.5 });

    stepMany(simulation, 600);

    expect(simulation.getPlayerHealth()).toEqual({
      entityId: "player",
      hp: 0,
      maxHp: 100,
      isDown: true,
    });
    expect(simulation.getSnapshot().completed?.outcome).toBe("death");
    expect(simulation.getEvents().some((event) => event.type === "death")).toBe(true);
    expect(simulation.getEvents().some((event) => event.type === "capture")).toBe(false);
  });

  it("protects stored run events from nested payload mutation", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.pebbles[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });

    simulation.step({
      direction: { x: 0, y: 0 },
      sprint: false,
      interact: false,
      throwTarget: { x: 5, y: 5 },
    });
    const thrown = simulation.getEvents().find((event) => event.type === "pebble_throw");
    const landing = thrown?.payload.landing;
    expect(landing).toEqual({ x: 5, y: 5 });
    if (typeof landing === "object" && landing !== null && "x" in landing) {
      landing.x = 99;
    }

    expect(simulation.getEvents().find((event) => event.type === "pebble_throw")?.payload.landing).toEqual({
      x: 5,
      y: 5,
    });
  });
});

describe("simulation combat integration", () => {
  it("pistol attack records attack noise, raises alert, and leaves the run active", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 5.5, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    simulation.setPlayerPosition({ x: 3.5, y: 2.5 });

    const result = simulation.playerAttack("guard-a", "pistol");

    expect(result?.hit).toBe(true);
    expect(simulation.getSnapshot().player.weapons.ammoByWeapon.pistol).toBe(5);
    expect(simulation.getGuardHealth("guard-a")).toEqual({
      entityId: "guard-a",
      hp: 10,
      maxHp: 45,
      isDown: false,
    });
    expect(simulation.getAlertState().level).not.toBe("calm");
    expect(simulation.getSnapshot().completed).toBeNull();
    expect(simulation.getEvents().some((event) => event.type === "attack")).toBe(true);
    const weaponNoise = simulation
      .getEvents()
      .find((event) => event.type === "noise" && event.payload.source === "weapon" && event.payload.weaponId === "pistol");
    expect(weaponNoise?.payload.radius).not.toBe(result?.noise);
    expect(weaponNoise?.payload.radius as number).toBeLessThan(prisonMap.width);
  });

  it("fist attacks can knock out a guard body and skip that guard's capture updates until discovery", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.2, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 2.5, y: 2.5 });

    let result = simulation.playerAttack("guard-a", "fists");
    while (result?.bodyState === "active") {
      result = simulation.playerAttack("guard-a", "fists");
    }
    stepMany(simulation, 400);

    expect(result?.bodyState).toBe("knocked_out");
    expect(simulation.getBodyState().bodies["guard-a"]).toEqual({
      guardId: "guard-a",
      bodyState: "knocked_out",
      position: { x: 3.2, y: 2.5 },
    });
    expect(simulation.getSnapshot().guards[0].bodyState).toBe("knocked_out");
    expect(simulation.getSnapshot().guards[0].health).toEqual({
      entityId: "guard-a",
      hp: 0,
      maxHp: 45,
      isDown: true,
    });
    expect(simulation.getAlertState().pressure).toBeGreaterThan(0);
    expect(simulation.getEvents().some((event) => event.type === "knockout")).toBe(true);
    expect(simulation.getEvents().some((event) => event.type === "body_discovered")).toBe(false);
    expect(simulation.getSnapshot().completed).toBeNull();
  });

  it("rejects attacks with weapons the player does not own", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.2, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 2.5, y: 2.5 });

    const result = simulation.playerAttack("guard-a", "pipe");

    expect(result).toBeNull();
    expect(simulation.getGuardHealth("guard-a")?.hp).toBe(45);
    expect(simulation.getEvents().some((event) => event.type === "attack")).toBe(false);
  });

  it("picks up the security room pistol and starter ammo", () => {
    const simulation = new GameSimulation();

    expect(simulation.getSnapshot().player.weapons.sidearmId).toBeNull();
    expect(simulation.getSnapshot().weaponPickups[0]).toMatchObject({
      id: "security_pistol",
      weaponId: "pistol",
      collected: false,
    });

    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });

    expect(simulation.getSnapshot().player.weapons).toMatchObject({
      sidearmId: "pistol",
      ammoByWeapon: { pistol: 6 },
      reserveAmmoByType: { nine_mm: 12 },
    });
    expect(simulation.getSnapshot().weaponPickups[0].collected).toBe(true);
    expect(simulation.getEvents().some((event) => event.type === "weapon_pickup")).toBe(true);
  });

  it("active guards discover knocked out guards and wake them up", () => {
    const simulation = new GameSimulation({
      guardOverrides: [
        { id: "guard-a", position: { x: 3.2, y: 2.5 }, facing: { x: 1, y: 0 } },
        { id: "guard-b", position: { x: 4.2, y: 2.5 }, facing: { x: -1, y: 0 } },
      ],
    });
    simulation.setPlayerPosition({ x: 2.5, y: 2.5 });

    let result = simulation.playerAttack("guard-a", "fists");
    while (result?.bodyState === "active") {
      result = simulation.playerAttack("guard-a", "fists");
    }
    stepMany(simulation, 1);

    expect(simulation.getEvents().some((event) => event.type === "body_discovered")).toBe(true);
    stepMany(simulation, 900);

    expect(simulation.getEvents().some((event) => event.type === "guard_wakeup")).toBe(true);
    expect(simulation.getSnapshot().guards.find((guard) => guard.id === "guard-a")?.bodyState).toBe("active");
  });

  it("applies combat adaptations to starting combat pressure, durability, ammo, and body checks", () => {
    const simulation = new GameSimulation({
      nextRunConfig: {
        adaptations: [
          { action: "place_armed_response", target: "security_room", level: 2, rationale: "gun pressure" },
          { action: "increase_guard_durability", target: "global", level: 1, rationale: "guards are being dropped" },
          { action: "reduce_ammo_availability", target: "global", level: 2, rationale: "gun reliance" },
          { action: "add_body_checks", target: "security_room", level: 1, rationale: "bodies found" },
        ],
      },
    });
    const snapshot = simulation.getSnapshot();

    expect(snapshot.adaptations).toMatchObject({
      armedResponseLevel: 2,
      guardDurabilityLevel: 1,
      ammoReductionLevel: 2,
      bodyCheckLevel: 1,
    });
    expect(snapshot.alert.pressure).toBe(24);
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    expect(simulation.getSnapshot().player.weapons.reserveAmmoByType.nine_mm).toBe(4);
    expect(snapshot.guards[0].health?.maxHp).toBe(55);
  });

  it("attacking through blocked line of fire misses but still records attack noise and alert", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 8.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    simulation.setPlayerPosition({ x: 10.8, y: 4.5 });

    const result = simulation.playerAttack("guard-a", "pistol");

    expect(result?.hit).toBe(false);
    expect(simulation.getGuardHealth("guard-a")?.hp).toBe(45);
    expect(simulation.getAlertState().level).not.toBe("calm");
    expect(simulation.getEvents().some((event) => event.type === "attack")).toBe(true);
    expect(
      simulation
        .getEvents()
        .some((event) => event.type === "noise" && event.payload.source === "weapon" && event.payload.weaponId === "pistol"),
    ).toBe(true);
  });

  it("emits armed response telemetry once when combat noise crosses that threshold", () => {
    const simulation = new GameSimulation({
      guardOverrides: [
        { id: "guard-a", position: { x: 5.5, y: 2.5 }, facing: { x: 1, y: 0 } },
        { id: "guard-b", position: { x: 5.5, y: 3.5 }, facing: { x: 1, y: 0 } },
      ],
    });
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    simulation.setPlayerPosition({ x: 3.5, y: 2.5 });

    simulation.playerAttack("guard-a", "pistol");
    simulation.playerAttack("guard-b", "pistol");
    simulation.playerAttack("guard-b", "pistol");

    const armedEvents = simulation.getEvents().filter((event) => event.type === "armed_response_triggered");
    expect(simulation.getAlertState().armedResponseTriggered).toBe(true);
    expect(armedEvents).toHaveLength(1);
  });
});
