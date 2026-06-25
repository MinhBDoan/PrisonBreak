import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import { createHudModel } from "../../client/src/ui/Hud";

describe("createHudModel", () => {
  it("formats combat state alongside objective, pebble, suspicion, and prompt state", () => {
    const simulation = new GameSimulation();
    simulation.applyPlayerDamage(25);

    const model = createHudModel(simulation.getSnapshot());

    expect(model).toMatchObject({
      objective: "Find the security key",
      keyLabel: "missing",
      pebbleCount: 0,
      healthLabel: "75 / 100",
      healthPercent: 75,
      meleeLabel: "Makeshift Knife",
      gunLabel: "No gun",
      ammoLabel: "-",
      healingItemsLabel: "1",
      alertLabel: "Calm",
      alertTone: "neutral",
      suspicionPercent: 0,
      prompt: "WASD move | Shift sprint | E interact",
    });
  });

  it("labels death as death instead of capture", () => {
    const simulation = new GameSimulation();
    simulation.applyPlayerDamage(100);

    const model = createHudModel(simulation.getSnapshot());

    expect(model.banner).toEqual({ text: "Dead", tone: "danger" });
  });
});
