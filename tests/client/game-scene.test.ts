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
          },
          JustDown: () => false,
        },
      },
    },
  }));
}

function mockSceneCollaborators(): void {
  vi.doMock("../../client/src/render/GameRenderer", () => ({
    GameRenderer: class {
      mount() {}
      render() {}
      followCamera() {}
      spawnNoiseRipple() {}
    },
  }));
  vi.doMock("../../client/src/ui/Hud", () => ({
    Hud: class {
      update() {}
    },
  }));
}

async function createSceneHarness(): Promise<{
  scene: GameScene;
  reports: unknown[];
}> {
  installDocumentStub();
  mockPhaser();
  mockSceneCollaborators();
  const { GameScene } = await import("../../client/src/scenes/GameScene");
  const scene = new GameScene();
  const reports: unknown[] = [];
  const key = { isDown: false };

  Object.assign(scene, {
    input: {
      keyboard: {
        addKey: () => key,
      },
    },
    cameras: {
      main: {
        setBackgroundColor() {},
      },
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

  return { scene, reports };
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
});
