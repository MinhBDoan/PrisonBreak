import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import { clampThrowTarget, GameRenderer } from "../../client/src/render/GameRenderer";
import type { SimulationSnapshot } from "../../client/src/game/types";

describe("GameRenderer", () => {
  it("clamps pebble aim previews to the throw range", () => {
    expect(clampThrowTarget({ x: 2, y: 2 }, { x: 4, y: 2 })).toEqual({ x: 4, y: 2 });
    expect(clampThrowTarget({ x: 2, y: 2 }, { x: 20, y: 2 })).toEqual({ x: 6, y: 2 });
    expect(clampThrowTarget({ x: 2, y: 2 }, { x: 20, y: 2 }, 1)).toEqual({ x: 3, y: 2 });
  });

  it("maps simulation entities to stable render descriptors and shows patrol vision cones", () => {
    const simulation = new GameSimulation();
    const renderer = new GameRenderer();

    const descriptors = renderer.describe(simulation.getSnapshot());

    expect(descriptors.player).toMatchObject({
      id: "player",
      kind: "player",
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(descriptors.guards).toEqual([
      expect.objectContaining({
        id: "guard-1",
        kind: "guard",
        state: "patrol",
        visionCone: expect.objectContaining({
          color: 0xffc857,
          alpha: expect.any(Number),
        }),
      }),
      expect.objectContaining({
        id: "guard-2",
        kind: "guard",
        state: "patrol",
        visionCone: expect.objectContaining({
          color: 0xffc857,
          alpha: expect.any(Number),
        }),
      }),
    ]);
    expect(descriptors.guards[0].visionCone?.alpha).toBeLessThan(0.18);
    expect(descriptors.hidingSpots.map((spot) => spot.id)).toEqual([
      "locker_alpha",
      "locker_bravo",
      "shadow_nook",
    ]);
    expect(descriptors.coverObjects).toEqual([
      expect.objectContaining({
        id: "crate_central_alpha",
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    ]);
    expect(descriptors.objectives.key.id).toBe("security_key");
    expect(descriptors.objectives.exit.id).toBe("locked_exit");
  });

  it("warms guard vision cones toward red as capture progress rises", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const chasingSnapshot: SimulationSnapshot = {
      ...snapshot,
      guards: [
        {
          ...snapshot.guards[0],
          state: "chase",
          suspicion: 1,
          captureProgress: 0,
        },
        {
          ...snapshot.guards[1],
          state: "chase",
          suspicion: 1,
          captureProgress: 1,
        },
      ],
    };

    const descriptors = renderer.describe(chasingSnapshot);

    expect(descriptors.guards[0].visionCone?.color).toBe(0xffc857);
    expect(descriptors.guards[1].visionCone?.color).toBe(0xff5f56);
    expect(descriptors.guards[1].visionCone?.alpha).toBeGreaterThan(
      descriptors.guards[0].visionCone?.alpha ?? 0,
    );
  });

  it("describes downed guards with body state and suppresses live vision cones", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 3.2, y: 2.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 2.5, y: 2.5 });
    let result = simulation.playerAttack("guard-a", "fists");
    while (result?.bodyState === "active") {
      result = simulation.playerAttack("guard-a", "fists");
    }
    const renderer = new GameRenderer();

    const guard = renderer.describe(simulation.getSnapshot()).guards[0];

    expect(guard).toMatchObject({
      id: "guard-a",
      bodyState: "knocked_out",
      health: {
        entityId: "guard-a",
        hp: 0,
        maxHp: 45,
        isDown: true,
      },
      visionCone: null,
    });
  });

  it("keeps one noise pulse and follows the latest player position during cooldown", () => {
    const renderer = new GameRenderer();
    let currentTimeMs = 0;
    let circleCount = 0;
    let killedTweenTarget: unknown;
    let killedTweenCount = 0;
    let tweenCount = 0;
    let tweenOptions: { radius?: number; alpha?: number; duration?: number; onComplete?: () => void } | undefined;
    const circle = {
      x: 0,
      y: 0,
      radius: 0,
      alpha: 0,
      lineWidth: 0,
      strokeColor: 0,
      strokeAlpha: 0,
      active: true,
      setPosition(x: number, y: number) {
        circle.x = x;
        circle.y = y;
        return circle;
      },
      setRadius(radius: number) {
        circle.radius = radius;
        return circle;
      },
      setAlpha(alpha: number) {
        circle.alpha = alpha;
        return circle;
      },
      setStrokeStyle(lineWidth: number, strokeColor: number, strokeAlpha: number) {
        circle.lineWidth = lineWidth;
        circle.strokeColor = strokeColor;
        circle.strokeAlpha = strokeAlpha;
        return circle;
      },
      destroy() {
        circle.active = false;
      },
    };
    const scene = {
      add: {
        circle() {
          circleCount += 1;
          return circle;
        },
      },
      tweens: {
        killTweensOf(target: unknown) {
          killedTweenTarget = target;
          killedTweenCount += 1;
        },
        add(options: typeof tweenOptions) {
          tweenOptions = options;
          tweenCount += 1;
        },
      },
      time: {
        now: currentTimeMs,
      },
    };

    Object.assign(renderer as unknown as { objects: unknown }, {
      objects: {
        floors: [],
        walls: [],
        lights: [],
        guards: new Map(),
        guardCones: new Map(),
        hidingSpots: new Map(),
        noiseRipple: undefined,
      },
    });

    renderer.spawnNoiseRipple(scene as never, { x: 1, y: 1 }, 2);
    currentTimeMs = 100;
    scene.time.now = currentTimeMs;
    renderer.spawnNoiseRipple(scene as never, { x: 2, y: 2 }, 3);

    expect(circleCount).toBe(1);
    expect(killedTweenTarget).toBe(circle);
    expect(killedTweenCount).toBe(1);
    expect(tweenCount).toBe(1);
    expect(circle).toMatchObject({
      x: 128,
      y: 128,
      radius: 10,
      alpha: 0.65,
      lineWidth: 3,
      strokeColor: 0x8bd3ff,
      strokeAlpha: 0.65,
      active: true,
    });
    expect(tweenOptions).toMatchObject({ radius: 128, alpha: 0, duration: 680 });
    tweenOptions?.onComplete?.();
    expect(circle).toMatchObject({ radius: 10, alpha: 0, active: true });
  });

  it("starts a new full noise pulse from the latest position after the visual cooldown", () => {
    const renderer = new GameRenderer();
    let currentTimeMs = 0;
    let circleCount = 0;
    let killedTweenCount = 0;
    let tweenCount = 0;
    let latestTween: { radius?: number; alpha?: number; duration?: number; onComplete?: () => void } | undefined;
    const circle = {
      x: 0,
      y: 0,
      radius: 0,
      alpha: 0,
      active: true,
      setPosition(x: number, y: number) {
        circle.x = x;
        circle.y = y;
        return circle;
      },
      setRadius(radius: number) {
        circle.radius = radius;
        return circle;
      },
      setAlpha(alpha: number) {
        circle.alpha = alpha;
        return circle;
      },
      setStrokeStyle() {
        return circle;
      },
      destroy() {
        circle.active = false;
      },
    };
    const scene = {
      add: {
        circle() {
          circleCount += 1;
          return circle;
        },
      },
      tweens: {
        killTweensOf() {
          killedTweenCount += 1;
        },
        add(options: typeof latestTween) {
          latestTween = options;
          tweenCount += 1;
        },
      },
      time: {
        now: currentTimeMs,
      },
    };

    Object.assign(renderer as unknown as { objects: unknown }, {
      objects: {
        floors: [],
        walls: [],
        lights: [],
        guards: new Map(),
        guardCones: new Map(),
        hidingSpots: new Map(),
        noiseRipple: undefined,
      },
    });

    renderer.spawnNoiseRipple(scene as never, { x: 1, y: 1 }, 2);
    currentTimeMs = 550;
    scene.time.now = currentTimeMs;
    renderer.spawnNoiseRipple(scene as never, { x: 2, y: 2 }, 3);

    expect(circleCount).toBe(1);
    expect(killedTweenCount).toBe(2);
    expect(tweenCount).toBe(2);
    expect(circle).toMatchObject({ x: 128, y: 128, radius: 10, alpha: 0.65, active: true });
    expect(latestTween).toMatchObject({ radius: 192, alpha: 0, duration: 680 });
  });
});
