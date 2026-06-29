import { describe, expect, it, vi } from "vitest";
import type { StartRunResponse } from "../../shared/contracts";
import type { GameScene } from "../../client/src/scenes/GameScene";

function installDocumentStub(): void {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      getElementById(id: string) {
        return id === "hud"
          ? {
              innerHTML: "",
              classList: { add() {} },
            }
          : null;
      },
      addEventListener(type: string, listener: (event: { code?: string; key?: string }) => void) {
        windowListeners[`document:${type}`] = [...(windowListeners[`document:${type}`] ?? []), listener];
      },
      removeEventListener(type: string, listener: (event: { code?: string; key?: string }) => void) {
        windowListeners[`document:${type}`] = (windowListeners[`document:${type}`] ?? []).filter(
          (candidate) => candidate !== listener,
        );
      },
    },
  });
}

const windowListeners: Record<string, Array<(event: { code?: string; key?: string }) => void>> = {};

function installWindowStub(): void {
  for (const key of Object.keys(windowListeners)) {
    delete windowListeners[key];
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, listener: (event: { code?: string; key?: string }) => void) {
        windowListeners[type] = [...(windowListeners[type] ?? []), listener];
      },
      removeEventListener(type: string, listener: (event: { code?: string; key?: string }) => void) {
        windowListeners[type] = (windowListeners[type] ?? []).filter((candidate) => candidate !== listener);
      },
    },
  });
}

function mockPhaser(): void {
  vi.doMock("phaser", () => ({
    default: {
      Scene: class {
        constructor(public key: string) {}
      },
      Input: {
        Keyboard: {
          KeyCodes: {
            W: "W",
            A: "A",
            S: "S",
            D: "D",
            SHIFT: "SHIFT",
            E: "E",
            ESC: "ESC",
          },
          JustDown: (key: { justDown?: boolean }) => {
            const wasJustDown = Boolean(key.justDown);
            key.justDown = false;
            return wasJustDown;
          },
        },
      },
      Scenes: {
        Events: {
          SHUTDOWN: "shutdown",
        },
      },
    },
  }));
}

const hudCalls = {
  update: vi.fn(),
  showPaused: vi.fn(),
};

const rendererCalls = {
  showPebbleAim: vi.fn(),
  hidePebbleAim: vi.fn(),
  spawnPebbleThrow: vi.fn(),
  spawnCombatFeedback: vi.fn(),
  spawnHealFeedback: vi.fn(),
};

function mockSceneCollaborators(): void {
  hudCalls.update.mockReset();
  hudCalls.showPaused.mockReset();
  rendererCalls.showPebbleAim.mockReset();
  rendererCalls.hidePebbleAim.mockReset();
  rendererCalls.spawnPebbleThrow.mockReset();
  rendererCalls.spawnCombatFeedback.mockReset();
  rendererCalls.spawnHealFeedback.mockReset();
  vi.doMock("../../client/src/render/GameRenderer", () => ({
    clampThrowTarget: (
      origin: { x: number; y: number },
      target: { x: number; y: number },
      maxRange = 4,
    ) => {
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0 || distance <= maxRange) {
        return { ...target };
      }
      return {
        x: origin.x + (dx / distance) * maxRange,
        y: origin.y + (dy / distance) * maxRange,
      };
    },
    GameRenderer: class {
      mount() {}
      render() {}
      followCamera() {}
      spawnNoiseRipple() {}
      showPebbleAim(...args: unknown[]) {
        rendererCalls.showPebbleAim(...args);
      }
      hidePebbleAim(...args: unknown[]) {
        rendererCalls.hidePebbleAim(...args);
      }
      spawnPebbleThrow(...args: unknown[]) {
        rendererCalls.spawnPebbleThrow(...args);
      }
      spawnCombatFeedback(...args: unknown[]) {
        rendererCalls.spawnCombatFeedback(...args);
      }
      spawnHealFeedback(...args: unknown[]) {
        rendererCalls.spawnHealFeedback(...args);
      }
    },
    renderScale: 64,
  }));
  vi.doMock("../../client/src/ui/Hud", () => ({
    Hud: class {
      update(...args: unknown[]) {
        hudCalls.update(...args);
      }
      showPaused() {
        hudCalls.showPaused();
      }
    },
  }));
}

async function createSceneHarness(): Promise<{
  scene: GameScene;
  reports: unknown[];
  keys: Record<string, { isDown: boolean; justDown?: boolean }>;
}> {
  installDocumentStub();
  installWindowStub();
  mockPhaser();
  mockSceneCollaborators();
  const { GameScene } = await import("../../client/src/scenes/GameScene");
  const scene = new GameScene();
  const reports: unknown[] = [];
  const keys: Record<string, { isDown: boolean; justDown?: boolean }> = {};
  const inputListeners: Record<string, Array<{ callback: (...args: unknown[]) => void; context?: unknown }>> = {};

  Object.assign(scene, {
    input: {
      activePointer: {
        worldX: 0,
        worldY: 0,
        leftButtonDown: () => false,
      },
      keyboard: {
        addKey: (code: string) => {
          keys[code] = { isDown: false, justDown: false };
          return keys[code];
        },
      },
      on(type: string, callback: (...args: unknown[]) => void, context?: unknown) {
        inputListeners[type] = [...(inputListeners[type] ?? []), { callback, context }];
      },
      off(type: string, callback: (...args: unknown[]) => void, context?: unknown) {
        inputListeners[type] = (inputListeners[type] ?? []).filter(
          (listener) => listener.callback !== callback || listener.context !== context,
        );
      },
      emit(type: string, ...args: unknown[]) {
        inputListeners[type]?.forEach((listener) => listener.callback.apply(listener.context, args));
      },
    },
    cameras: {
      main: {
        setBackgroundColor() {},
      },
    },
    game: {
      canvas: {
        tabIndex: -1,
        focus: vi.fn(),
      },
    },
    events: {
      once() {},
    },
    time: {
      now: 0,
      delayedCall(_delayMs: number, callback: () => void) {
        callback();
      },
    },
    scene: {
      start(key: string, data: unknown) {
        if (key === "report") {
          reports.push(data);
        }
      },
    },
  });

  return { scene, reports, keys };
}

function startRun(scene: GameScene, runId: number): void {
  scene.create({
    runId,
    config: { adaptations: [] },
  } satisfies StartRunResponse);
}

function forceCompletedSimulation(scene: GameScene, durationMs: number): void {
  Object.assign(scene, {
    simulation: {
      getSnapshot() {
        return {
          completed: { outcome: "escaped", durationMs },
        };
      },
      getEvents() {
        return [];
      },
    },
    viewRenderer: {
      mount() {},
      render() {},
      followCamera() {},
      spawnNoiseRipple() {},
      showPebbleAim() {},
      hidePebbleAim() {},
    },
    hud: {
      update() {},
    },
  });
}

describe("GameScene", () => {
  it("reports completion after a reused scene starts a later run", async () => {
    const { scene, reports } = await createSceneHarness();

    startRun(scene, 1);
    forceCompletedSimulation(scene, 1200);
    scene.update();

    startRun(scene, 2);
    expect((scene as unknown as { lastEventCount: number }).lastEventCount).toBe(0);
    forceCompletedSimulation(scene, 900);
    scene.update();

    expect(reports).toHaveLength(2);
    expect(reports).toEqual([
      expect.objectContaining({ runId: 1, durationMs: 1200 }),
      expect.objectContaining({ runId: 2, durationMs: 900 }),
    ]);
  });

  it("toggles a pause popup with Esc and freezes simulation updates while paused", async () => {
    const { scene, keys } = await createSceneHarness();

    startRun(scene, 1);
    const simulation = (scene as unknown as { simulation: { step: () => void } }).simulation;
    const stepSpy = vi.spyOn(simulation, "step");

    keys.ESC.justDown = true;
    scene.update();

    expect(hudCalls.showPaused).toHaveBeenCalledTimes(1);
    expect(stepSpy).not.toHaveBeenCalled();

    scene.update();
    expect(stepSpy).not.toHaveBeenCalled();

    keys.ESC.justDown = true;
    scene.update();

    expect(stepSpy).toHaveBeenCalledTimes(1);
    expect(hudCalls.update).toHaveBeenCalled();
  });

  it("uses DOM key state as a movement fallback when Phaser key state is not updated", async () => {
    const { scene } = await createSceneHarness();

    startRun(scene, 1);
    const simulation = (scene as unknown as { simulation: { step: (input: unknown) => void } }).simulation;
    const stepSpy = vi.spyOn(simulation, "step");

    windowListeners.keydown?.forEach((listener) => listener({ code: "KeyD", key: "d" }));
    scene.update();

    expect(stepSpy).toHaveBeenCalledWith(expect.objectContaining({
      direction: { x: 1, y: 0 },
      sprint: false,
    }));

    windowListeners.keyup?.forEach((listener) => listener({ code: "KeyD", key: "d" }));
    scene.update();

    expect(stepSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      direction: { x: 0, y: 0 },
    }));
  });

  it("uses combat hotkeys for selection and fires selected gun toward pointer on click", async () => {
    const { scene } = await createSceneHarness();

    startRun(scene, 1);
    const runtime = scene as unknown as {
      input: { emit: (type: string, pointer: unknown) => void; activePointer: unknown };
      simulation: { step: (input: unknown) => void };
    };
    const simulation = runtime.simulation;
    const stepSpy = vi.spyOn(simulation, "step");
    const pointer = {
      worldX: 64 * 6,
      worldY: 64 * 2,
      leftButtonDown: () => true,
    };

    windowListeners.keydown?.forEach((listener) => listener({ code: "Digit2", key: "2" }));
    windowListeners.keydown?.forEach((listener) => listener({ code: "KeyR", key: "r" }));
    windowListeners.keydown?.forEach((listener) => listener({ code: "KeyF", key: "f" }));
    scene.update();

    expect(stepSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      attack: null,
      reload: true,
      heal: true,
    }));

    runtime.input.activePointer = pointer;
    runtime.input.emit("pointerdown", pointer);
    runtime.input.emit("pointerup", pointer);
    scene.update();

    expect(stepSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      attack: { mode: "gun", target: { x: 6, y: 2 } },
      reload: false,
      heal: false,
    }));
  });

  it("toggles melee between knife and fists with repeated melee hotkey presses", async () => {
    const { scene } = await createSceneHarness();

    startRun(scene, 1);
    const runtime = scene as unknown as {
      input: { emit: (type: string, pointer: unknown) => void; activePointer: unknown };
      simulation: { step: (input: unknown) => void };
    };
    const stepSpy = vi.spyOn(runtime.simulation, "step");
    const pointer = {
      worldX: 64 * 3,
      worldY: 64 * 2,
      leftButtonDown: () => true,
    };

    expect(hudCalls.update).toHaveBeenLastCalledWith(expect.anything(), "melee", "makeshift_knife");

    windowListeners.keydown?.forEach((listener) => listener({ code: "Digit1", key: "1" }));
    scene.update();

    expect(hudCalls.update).toHaveBeenLastCalledWith(expect.anything(), "melee", "fists");

    runtime.input.activePointer = pointer;
    runtime.input.emit("pointerdown", pointer);
    runtime.input.emit("pointerup", pointer);
    scene.update();

    expect(stepSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      attack: { mode: "melee", target: { x: 3, y: 2 }, weaponId: "fists" },
    }));

    windowListeners.keydown?.forEach((listener) => listener({ code: "Digit1", key: "1" }));
    scene.update();

    expect(hudCalls.update).toHaveBeenLastCalledWith(expect.anything(), "melee", "makeshift_knife");
  });

  it("selects misc with 3 and only charges pebble throws from the misc slot", async () => {
    const { scene } = await createSceneHarness();

    startRun(scene, 1);
    const runtime = scene as unknown as {
      input: { emit: (type: string, pointer: unknown) => void; activePointer: unknown };
      simulation: {
        setPlayerPosition: (position: { x: number; y: number }) => void;
        getSnapshot: () => { player: { pebbles: number } };
        step: (input: unknown) => void;
      };
      time: { now: number };
    };
    runtime.simulation.setPlayerPosition({ x: 2, y: 2 });
    (runtime.simulation as unknown as { player: { pebbles: number } }).player.pebbles = 1;
    const stepSpy = vi.spyOn(runtime.simulation, "step");
    const pointer = {
      worldX: 64 * 5,
      worldY: 64 * 2,
      leftButtonDown: () => true,
    };

    windowListeners.keydown?.forEach((listener) => listener({ code: "Digit2", key: "2" }));
    runtime.input.activePointer = pointer;
    runtime.input.emit("pointerdown", pointer);
    runtime.time.now = 1000;
    scene.update();

    expect(rendererCalls.showPebbleAim).not.toHaveBeenCalled();

    runtime.input.emit("pointerup", pointer);
    scene.update();
    expect(stepSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      attack: { mode: "gun", target: { x: 5, y: 2 } },
      throwTarget: null,
    }));

    windowListeners.keydown?.forEach((listener) => listener({ code: "Digit3", key: "3" }));
    scene.update();
    runtime.input.emit("pointerdown", pointer);
    runtime.time.now = 2000;
    scene.update();

    expect(rendererCalls.showPebbleAim).toHaveBeenCalled();

    runtime.input.emit("pointerup", pointer);
    scene.update();
    expect(stepSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      attack: null,
      throwTarget: { x: 5, y: 2 },
    }));
  });

  it("charges and submits pebble throw targets through pointer input", async () => {
    const { scene } = await createSceneHarness();

    startRun(scene, 1);
    const simulation = (scene as unknown as {
      simulation: {
        setPlayerPosition: (position: { x: number; y: number }) => void;
        getSnapshot: () => { player: { pebbles: number } };
        step: (input: unknown) => void;
      };
      input: { emit: (type: string, pointer: unknown) => void; activePointer: unknown };
      time: { now: number };
    }).simulation;
    simulation.setPlayerPosition({ x: 2, y: 2 });
    (simulation as unknown as { player: { pebbles: number } }).player.pebbles = 1;
    const stepSpy = vi.spyOn(simulation, "step");
    const pointer = {
      worldX: 64 * 9,
      worldY: 64 * 2,
      leftButtonDown: () => true,
    };

    windowListeners.keydown?.forEach((listener) => listener({ code: "Digit3", key: "3" }));
    (scene as unknown as { input: { emit: (type: string, pointer: unknown) => void; activePointer: unknown } }).input.activePointer = pointer;
    (scene as unknown as { input: { emit: (type: string, pointer: unknown) => void } }).input.emit("pointerdown", pointer);
    (scene as unknown as { time: { now: number } }).time.now = 1000;
    scene.update();

    expect(rendererCalls.showPebbleAim).toHaveBeenCalled();

    (scene as unknown as { input: { emit: (type: string, pointer: unknown) => void } }).input.emit("pointerup", pointer);
    scene.update();

    expect(stepSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      throwTarget: { x: 6, y: 2 },
    }));
    expect(rendererCalls.hidePebbleAim).toHaveBeenCalled();
  });

  it("plays a pebble throw animation for new pebble throw events", async () => {
    const { scene } = await createSceneHarness();

    startRun(scene, 1);
    const runtime = scene as unknown as {
      simulation: {
        setPlayerPosition: (position: { x: number; y: number }) => void;
        getSnapshot: () => { player: { pebbles: number } };
      };
      input: { emit: (type: string, pointer: unknown) => void };
      time: { now: number };
    };
    runtime.simulation.setPlayerPosition({ x: 2, y: 2 });
    (runtime.simulation as unknown as { player: { pebbles: number } }).player.pebbles = 1;
    const pointer = {
      worldX: 64 * 3,
      worldY: 64 * 2,
      leftButtonDown: () => true,
    };

    windowListeners.keydown?.forEach((listener) => listener({ code: "Digit3", key: "3" }));
    runtime.input.emit("pointerdown", pointer);
    runtime.time.now = 1000;
    runtime.input.emit("pointerup", pointer);
    scene.update();

    expect(rendererCalls.spawnPebbleThrow).toHaveBeenCalledWith(
      scene,
      expect.objectContaining({ x: 2, y: 2 }),
      expect.objectContaining({ x: 3, y: 2 }),
      expect.any(Function),
    );
  });

  it("plays combat feedback for new attack events", async () => {
    const { scene } = await createSceneHarness();

    startRun(scene, 1);
    Object.assign(scene as unknown as { simulation: unknown }, {
      simulation: {
        step() {},
        getSnapshot() {
          return {
            completed: null,
            player: { position: { x: 2, y: 2 }, pebbles: 0 },
          };
        },
        getEvents() {
          return [
            {
              type: "attack",
              atMs: 100,
              position: { x: 2, y: 2 },
              payload: {
                weaponId: "pistol",
                targetPosition: { x: 5, y: 2 },
              },
            },
            {
              type: "attack",
              atMs: 200,
              position: { x: 2, y: 2 },
              payload: {
                weaponId: "makeshift_knife",
                targetPosition: { x: 2.7, y: 2 },
              },
            },
            {
              type: "guard_attack",
              atMs: 300,
              position: { x: 4, y: 2 },
              payload: {
                guardId: "guard-a",
                targetPosition: { x: 3.4, y: 2 },
                damage: 15,
              },
            },
          ];
        },
      },
    });

    scene.update();

    expect(rendererCalls.spawnCombatFeedback).toHaveBeenCalledWith(
      scene,
      { x: 2, y: 2 },
      { x: 5, y: 2 },
      "gun",
    );
    expect(rendererCalls.spawnCombatFeedback).toHaveBeenCalledWith(
      scene,
      { x: 2, y: 2 },
      { x: 2.7, y: 2 },
      "melee",
    );
    expect(rendererCalls.spawnCombatFeedback).toHaveBeenCalledWith(
      scene,
      { x: 4, y: 2 },
      { x: 3.4, y: 2 },
      "guard_melee",
    );
  });

  it("plays green heal feedback for new heal events", async () => {
    const { scene } = await createSceneHarness();

    startRun(scene, 1);
    Object.assign(scene as unknown as { simulation: unknown }, {
      simulation: {
        step() {},
        getSnapshot() {
          return {
            completed: null,
            player: { position: { x: 4, y: 4 }, pebbles: 0 },
          };
        },
        getEvents() {
          return [
            {
              type: "heal",
              atMs: 100,
              position: { x: 4, y: 4 },
              payload: { amount: 35, hp: 100 },
            },
          ];
        },
      },
    });

    scene.update();

    expect(rendererCalls.spawnHealFeedback).toHaveBeenCalledWith(scene, { x: 4, y: 4 });
  });
});
