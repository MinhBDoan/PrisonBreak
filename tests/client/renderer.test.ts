import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import { prisonMap } from "../../client/src/game/map";
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
      visual: expect.objectContaining({
        artStyle: "pixel_tactics",
        variant: "readable_hybrid",
        species: "raccoon",
        role: "prisoner",
        uniformColor: 0xf28c38,
        playerHighlight: true,
      }),
    });
    expect(descriptors.guards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "guard-1",
        kind: "guard",
        state: "patrol",
        visual: expect.objectContaining({
          artStyle: "pixel_tactics",
          variant: "readable_hybrid",
          species: "dog",
          role: "guard",
          uniformColor: 0x234f86,
        }),
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
      expect.objectContaining({
        id: "guard-3",
        kind: "guard",
        state: "patrol",
        visionCone: expect.objectContaining({
          color: 0xffc857,
          alpha: expect.any(Number),
        }),
      }),
    ]));
    expect(descriptors.guards[0].visionCone?.alpha).toBeLessThan(0.18);
    expect(descriptors.hidingSpots.map((spot) => spot.id)).toEqual([
      "locker_alpha",
      "locker_bravo",
      "shadow_nook",
      "open_cell_shadow",
    ]);
    expect(descriptors.hidingSpots.some((spot) => spot.bodyOccupied)).toBe(false);
    expect(descriptors.setDressingObjects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "starter_cell_bars", kind: "bars", visual: null }),
      expect.objectContaining({ id: "starter_cell_cot", kind: "cot", visual: null }),
      expect.objectContaining({ id: "starter_cell_toilet", kind: "toilet", visual: null }),
      expect.objectContaining({
        id: "prisoner_cell_a_prisoner",
        kind: "prisoner",
        visual: expect.objectContaining({
          artStyle: "pixel_tactics",
          variant: "readable_hybrid",
          role: "prisoner",
          uniformColor: 0xf28c38,
          playerHighlight: false,
        }),
      }),
      expect.objectContaining({
        id: "prisoner_cell_b_prisoner",
        kind: "prisoner",
        visual: expect.objectContaining({
          artStyle: "pixel_tactics",
          variant: "readable_hybrid",
          role: "prisoner",
          uniformColor: 0xf28c38,
          playerHighlight: false,
        }),
      }),
    ]));
    expect(descriptors.coverObjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "crate_central_alpha",
        width: expect.any(Number),
        height: expect.any(Number),
      }),
      expect.objectContaining({ id: "security_room_west_wall" }),
      expect.objectContaining({ id: "security_room_north_wall" }),
      expect.objectContaining({ id: "security_room_south_wall_left" }),
      expect.objectContaining({ id: "security_room_south_wall_right" }),
      expect.objectContaining({ id: "central_service_wall_left" }),
      expect.objectContaining({ id: "central_service_wall_right" }),
    ]));
    expect(descriptors.doors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "starter_cell_door",
        open: false,
        unlocked: true,
      }),
      expect.objectContaining({
        id: "security_room_door",
        open: false,
        unlocked: false,
      }),
      expect.objectContaining({
        id: "central_service_door",
        x: 928,
        y: 380.8,
        hingeX: 897.6,
        hingeY: 380.8,
        originX: 0,
        originY: 0.5,
        visualRotation: 0,
        open: false,
        unlocked: true,
      }),
    ]));
    expect(descriptors.objectives.key.id).toBe("master_key");
    expect(descriptors.objectives.key.color).toBe(0x57d7ff);
    expect(descriptors.objectives.key.strokeColor).toBe(0xd7f7ff);
    expect(descriptors.objectives.exit.id).toBe("locked_exit");
  });

  it("assigns deterministic animal variants to NPC prisoner dressing", () => {
    const descriptors = new GameRenderer().describe(new GameSimulation().getSnapshot());

    const prisoners = descriptors.setDressingObjects.filter((object) => object.kind === "prisoner");

    expect(prisoners.map((object) => object.visual?.species)).toEqual(["raccoon", "cat"]);
    expect(prisoners.every((object) => object.visual?.uniformColor === 0xf28c38)).toBe(true);
    expect(prisoners.every((object) => object.visual?.role === "prisoner")).toBe(true);
  });

  it("creates character containers for prisoner dressing instead of flat rectangles", () => {
    const renderer = new GameRenderer();
    const createdContainers: Array<{ depth: number | null; scale: number | null }> = [];
    const rectangle = {
      setOrigin: () => rectangle,
      setPosition: () => rectangle,
      setSize: () => rectangle,
      setFillStyle: () => rectangle,
      setStrokeStyle: () => rectangle,
      setDepth: () => rectangle,
      setRotation: () => rectangle,
      setAlpha: () => rectangle,
      setVisible: () => rectangle,
      setBlendMode: () => rectangle,
    };
    const scene = {
      add: {
        rectangle: () => rectangle,
        ellipse: () => rectangle,
        container: (_x: number, _y: number, children: unknown[]) => {
          const container = {
            list: children,
            depth: null as number | null,
            scale: null as number | null,
            setPosition: () => container,
            setScale: (scale: number) => {
              container.scale = scale;
              return container;
            },
            setDepth: (depth: number) => {
              container.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          createdContainers.push(container);
          return container;
        },
        circle: () => rectangle,
        star: () => rectangle,
        graphics: () => ({
          clear: () => undefined,
          setDepth: () => undefined,
          lineStyle: () => undefined,
          beginPath: () => undefined,
          moveTo: () => undefined,
          lineTo: () => undefined,
          strokePath: () => undefined,
          fillStyle: () => undefined,
          slice: () => undefined,
          fillPath: () => undefined,
        }),
      },
      cameras: { main: { setBounds: () => undefined, centerOn: () => undefined } },
    };

    renderer.render(scene as never, new GameSimulation().getSnapshot());

    expect(createdContainers.length).toBeGreaterThanOrEqual(6);
    expect(createdContainers.filter((container) => container.depth === 5 && container.scale === 1)).toHaveLength(2);
  });

  it("swings player-opened doors away from the player around a hinge edge", () => {
    const simulation = new GameSimulation();
    simulation.setPlayerPosition({ x: 14.5, y: 6.45 });
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });

    const door = new GameRenderer()
      .describe(simulation.getSnapshot())
      .doors.find((candidate) => candidate.id === "central_service_door");

    expect(door).toMatchObject({
      open: true,
      hingeX: 897.6,
      hingeY: 380.8,
      originX: 0,
      originY: 0.5,
      visualRotation: -Math.PI / 2,
    });
  });

  it("swings doors away from guards when guards open them", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 14.5, y: 5.4 }, facing: { x: 0, y: 1 } }],
    });
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: false });

    const door = new GameRenderer()
      .describe(simulation.getSnapshot())
      .doors.find((candidate) => candidate.id === "central_service_door");

    expect(door).toMatchObject({
      open: true,
      visualRotation: Math.PI / 2,
    });
  });

  it("uses a visibly different render color for general key drops", () => {
    const simulation = new GameSimulation({
      guardOverrides: [{ id: "guard-1", position: { x: 18.5, y: 4.5 }, facing: { x: 1, y: 0 } }],
    });
    simulation.setPlayerPosition({ x: 21.5, y: 2.5 });
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
    simulation.setPlayerPosition({ x: 18.5, y: 4.0 });
    simulation.playerAttack("guard-1", "pistol");
    simulation.playerAttack("guard-1", "pistol");

    const descriptors = new GameRenderer().describe(simulation.getSnapshot());

    expect(descriptors.doorKeyPickups).toContainEqual(
      expect.objectContaining({
        keyId: "general_key",
        color: 0xffd166,
        strokeColor: 0xfff0b8,
      }),
    );
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
      dragging: false,
      hiddenBody: false,
      health: {
        entityId: "guard-a",
        hp: 0,
        maxHp: 45,
        isDown: true,
      },
      visionCone: null,
    });
  });

  it("marks dragged and dumped bodies for placeholder body handling visuals", () => {
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

    expect(new GameRenderer().describe(simulation.getSnapshot()).guards[0]).toMatchObject({
      dragging: true,
      hiddenBody: false,
    });

    simulation.setPlayerPosition(prisonMap.hidingSpots[2].position);
    simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });

    expect(new GameRenderer().describe(simulation.getSnapshot()).guards[0]).toMatchObject({
      dragging: false,
      hiddenBody: true,
    });
    expect(new GameRenderer().describe(simulation.getSnapshot()).hidingSpots).toContainEqual(
      expect.objectContaining({ id: "shadow_nook", bodyOccupied: true }),
    );
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
