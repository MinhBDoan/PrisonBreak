import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import { prisonMap } from "../../client/src/game/map";
import { createHudModel, Hud } from "../../client/src/ui/Hud";

describe("createHudModel", () => {
  it("shows the active prison level name", () => {
    const model = createHudModel(new GameSimulation().getSnapshot());

    expect(model.levelLabel).toBe("Cell Block");
    expect(model.sectionLabel).toBe("Cell Block to Security Room");
  });

  it("formats combat state alongside objective, pebble, suspicion, and prompt state", () => {
    const simulation = new GameSimulation();
    simulation.applyPlayerDamage(25);

    const model = createHudModel(simulation.getSnapshot());

    expect(model).toMatchObject({
      objective: "Find the master key",
      levelLabel: "Cell Block",
      sectionLabel: "Cell Block to Security Room",
      keyLabel: "missing",
      keyInventoryLabel: "General no | Master no",
      pebbleCount: 0,
      miscLabel: "Pebble",
      miscCountLabel: "0",
      selectedSlot: "melee",
      healthLabel: "75 / 100",
      healthPercent: 75,
      meleeLabel: "Makeshift Knife",
      gunLabel: "No gun",
      ammoLabel: "-",
      healingItemsLabel: "0",
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

  it("keeps legacy capture completions out of player-facing loss language", () => {
    const simulation = new GameSimulation();
    const snapshot = simulation.getSnapshot();
    snapshot.completed = { outcome: "capture", durationMs: 1200 };

    const model = createHudModel(snapshot);

    expect(model.banner).toEqual({ text: "Run Ended", tone: "danger" });
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

    new Hud(root).update(simulation.getSnapshot(), "gun");

    expect(root.innerHTML).toContain('aria-label="Equipment"');
    expect(root.innerHTML).toContain("Makeshift Knife");
    expect(root.innerHTML).toContain("Pistol");
    expect(root.innerHTML).toContain("6 / 12");
    expect(root.innerHTML).toContain(">3<");
    expect(root.innerHTML).toContain("Misc");
    expect(root.innerHTML).toContain("Pebble");
    expect(root.innerHTML).toContain('hud__slot--selected');
    expect(root.innerHTML).toContain(">R<");
    expect(root.innerHTML).toContain(">F<");
  });

  it("shows reload progress inside the gun slot while the equipped gun is reloading", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    simulation.playerAttack("guard-a", "pistol");
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: false, reload: true });

    const model = createHudModel(simulation.getSnapshot(), "gun");

    expect(model.ammoLabel).toBe("Reloading 2s");
    expect(model.reloadLabel).toBe("Reloading 2s");
  });

  it("prompts for nearby doors and dropped door keys", () => {
    const lockedDoor = new GameSimulation();
    lockedDoor.setPlayerPosition({ x: 17.5, y: 4.55 });
    expect(createHudModel(lockedDoor.getSnapshot()).prompt).toBe("General key required");

    const unlockedDoor = new GameSimulation();
    unlockedDoor.setPlayerPosition({ x: 14.5, y: 6.45 });
    expect(createHudModel(unlockedDoor.getSnapshot()).prompt).toBe("Press E to open door");

    const keyDrop = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 18.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });
    keyDrop.setPlayerPosition(prisonMap.weaponPickups[0].position);
    keyDrop.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    keyDrop.setPlayerPosition({ x: 18.5, y: 4.0 });
    keyDrop.playerAttack("guard-1", "pistol");
    keyDrop.playerAttack("guard-1", "pistol");
    keyDrop.setPlayerPosition({ x: 18.5, y: 4.5 });
    expect(createHudModel(keyDrop.getSnapshot()).prompt).toBe("Press E to pick up general key");
  });

  it("prompts for dragging and dumping bodies", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.2, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 2.5, y: 2.5 });
    let result = simulation.playerAttack("guard-a", "fists");
    while (result?.bodyState === "active") {
      result = simulation.playerAttack("guard-a", "fists");
    }
    simulation.setPlayerPosition({ x: 3.2, y: 2.5 });

    expect(createHudModel(simulation.getSnapshot()).prompt).toBe("Press E to drag body");

    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    expect(createHudModel(simulation.getSnapshot()).prompt).toBe("Press E to drop body");
    simulation.setPlayerPosition(prisonMap.hidingSpots[2].position);

    expect(createHudModel(simulation.getSnapshot()).prompt).toBe("Press E to dump body");
  });

  it("shows when a hiding spot already contains a body", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.2, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 2.5, y: 2.5 });
    let result = simulation.playerAttack("guard-a", "fists");
    while (result?.bodyState === "active") {
      result = simulation.playerAttack("guard-a", "fists");
    }
    simulation.setPlayerPosition({ x: 3.2, y: 2.5 });
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    simulation.setPlayerPosition(prisonMap.hidingSpots[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });

    expect(createHudModel(simulation.getSnapshot()).prompt).toBe("Body hidden here");
  });

  it("prompts for the master key and the next-map exit key requirement", () => {
    const masterKey = new GameSimulation();
    masterKey.setPlayerPosition(prisonMap.key.position);
    expect(createHudModel(masterKey.getSnapshot()).prompt).toBe("Press E to pick up master key");

    const exit = new GameSimulation();
    exit.setPlayerPosition(prisonMap.exit.position);
    expect(createHudModel(exit.getSnapshot()).prompt).toBe("Find the master key");
  });

  it("shows carried general and master keys in the HUD inventory", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 18.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition(prisonMap.weaponPickups[0].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    simulation.setPlayerPosition({ x: 18.5, y: 4.0 });
    simulation.playerAttack("guard-1", "pistol");
    simulation.playerAttack("guard-1", "pistol");
    simulation.setPlayerPosition({ x: 18.5, y: 4.5 });
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });

    expect(createHudModel(simulation.getSnapshot()).keyInventoryLabel).toBe("General yes | Master no");

    simulation.setPlayerPosition(prisonMap.key.position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    const root = {
      innerHTML: "",
      classList: { add() {} },
    } as HTMLElement;

    new Hud(root).update(simulation.getSnapshot());

    expect(createHudModel(simulation.getSnapshot()).keyInventoryLabel).toBe("General yes | Master yes");
    expect(root.innerHTML).toContain("Keys");
    expect(root.innerHTML).toContain("General");
    expect(root.innerHTML).toContain("Master");
    expect(root.innerHTML).toContain("hud__key-chip--owned");
  });
});
