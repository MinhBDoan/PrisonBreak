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

function mockSceneCollaborators(): void {
  hudCalls.update.mockReset();
  hudCalls.showPaused.mockReset();
  vi.doMock("../../client/src/render/GameRenderer", () => ({
    GameRenderer: class {
      mount() {}
      render() {}
      followCamera() {}
      spawnNoiseRipple() {}
      showPebbleAim() {}
      hidePebbleAim() {}
    },
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
});
