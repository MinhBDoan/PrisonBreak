import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import {
  applyDamage,
  createHealthState,
  restoreHealth,
  useHealingItem,
} from "../../client/src/game/HealthSystem";
import { prisonMap } from "../../client/src/game/map";

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
