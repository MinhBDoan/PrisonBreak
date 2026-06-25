import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import { prisonMap } from "../../client/src/game/map";
import { createHudModel, Hud } from "../../client/src/ui/Hud";

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

  it("escapes HUD strings before rendering to the DOM", () => {
    const simulation = new GameSimulation();
    const snapshot = simulation.getSnapshot();
    snapshot.player.weapons.meleeWeaponId = "fists";
    snapshot.alert.level = "<img src=x onerror=alert(1)>" as typeof snapshot.alert.level;
    snapshot.completed = { outcome: "death", durationMs: 1200 };
    const root = {
      innerHTML: "",
      classList: { add() {} },
    } as HTMLElement;

    new Hud(root).update(snapshot);

    expect(root.innerHTML).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(root.innerHTML).not.toContain("<img");
  });

  it("renders a bottom equipment bar with weapon slots and ammo after pickup", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    const root = {
      innerHTML: "",
      classList: { add() {} },
    } as HTMLElement;

    new Hud(root).update(simulation.getSnapshot());

    expect(root.innerHTML).toContain('aria-label="Equipment"');
    expect(root.innerHTML).toContain("Makeshift Knife");
    expect(root.innerHTML).toContain("Pistol");
    expect(root.innerHTML).toContain("6 / 12");
    expect(root.innerHTML).toContain(">R<");
    expect(root.innerHTML).toContain(">F<");
  });
});
