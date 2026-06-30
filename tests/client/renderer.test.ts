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
          silhouette: "side_profile",
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

  it("describes pixel-prison room identity props for cells, corridors, storage, security, and exit", () => {
    const descriptors = new GameRenderer().describe(new GameSimulation().getSnapshot());

    expect(descriptors.setDressingObjects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "starter_cell_wall_marks", kind: "cell_grime" }),
      expect.objectContaining({ id: "prisoner_cell_a_shadow", kind: "prisoner_shadow" }),
      expect.objectContaining({ id: "central_corridor_floor_stripe", kind: "corridor_stripe" }),
      expect.objectContaining({ id: "east_corridor_signage", kind: "zone_sign" }),
      expect.objectContaining({ id: "storage_bandage_marker", kind: "supply_marker" }),
      expect.objectContaining({ id: "exit_floor_chevrons", kind: "exit_marker" }),
      expect.objectContaining({ id: "security_camera_sweep_marks", kind: "surveillance_marks" }),
    ]));
  });

  it("assigns deterministic animal variants to NPC prisoner dressing", () => {
    const descriptors = new GameRenderer().describe(new GameSimulation().getSnapshot());

    const prisoners = descriptors.setDressingObjects.filter((object) => object.kind === "prisoner");

    expect(prisoners.map((object) => object.visual?.species)).toEqual(["raccoon", "cat"]);
    expect(prisoners.every((object) => object.visual?.uniformColor === 0xf28c38)).toBe(true);
    expect(prisoners.every((object) => object.visual?.role === "prisoner")).toBe(true);
  });

  it("describes guard sprite facing so dog guards can look toward patrol direction", () => {
    const simulation = new GameSimulation({
      guardOverrides: [
        { id: "guard-left", position: { x: 18.5, y: 5.5 }, facing: { x: -1, y: 0 } },
        { id: "guard-right", position: { x: 20.5, y: 5.5 }, facing: { x: 1, y: 0 } },
        { id: "guard-down", position: { x: 22.5, y: 5.5 }, facing: { x: 0, y: 1 } },
      ],
    });

    const guards = new GameRenderer().describe(simulation.getSnapshot()).guards;

    expect(guards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "guard-left", spriteFacingX: -1 }),
      expect.objectContaining({ id: "guard-right", spriteFacingX: 1 }),
    ]));
    expect(guards.find((guard) => guard.id === "guard-left")?.visual.silhouette).toBe("side_profile");
    expect(guards.find((guard) => guard.id === "guard-right")?.visual.silhouette).toBe("side_profile");
    expect(guards.find((guard) => guard.id === "guard-down")?.visual.silhouette).toBe("front");
  });

  function captureSetDressingRender(ids: string[]): Array<{ id: string; childCount: number; fillColors: number[] }> {
    const renderer = new GameRenderer();
    const descriptors = new GameRenderer().describe(new GameSimulation().getSnapshot());
    const captured: Array<{ id: string; childCount: number; fillColors: number[] }> = [];
    const currentColors: number[] = [];
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
        rectangle: (_x: number, _y: number, _width: number, _height: number, fillColor: number) => {
          currentColors.push(fillColor);
          return rectangle;
        },
        ellipse: () => rectangle,
        container: (_x: number, _y: number, children: unknown[]) => {
          const fillColors = [...currentColors];
          currentColors.length = 0;
          const container = {
            list: children,
            setPosition: (x: number, y: number) => {
              const match = descriptors.setDressingObjects.find((object) => object.x === x && object.y === y);
              if (match && ids.includes(match.id)) {
                captured.push({ id: match.id, childCount: children.length, fillColors });
              }
              return container;
            },
            setScale: () => container,
            setDepth: () => container,
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
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
    return captured;
  }

  it("renders cell and room set dressing as irregular pixel object silhouettes", () => {
    const renderer = new GameRenderer();
    const descriptors = renderer.describe(new GameSimulation().getSnapshot());
    const targetKinds = new Set(["cot", "toilet", "bars", "desk", "monitor", "weapon_rack", "supply_shelf", "supply_boxes"]);
    type RectCall = { x: number; y: number; width: number; height: number; fillColor: number };
    const captured: Array<{ id: string; kind: string; childCount: number; rects: RectCall[]; colors: number[] }> = [];
    let pendingRects: RectCall[] = [];
    const makeShape = () => {
      const shape = {
        destroy: () => undefined,
        setOrigin: () => shape,
        setPosition: () => shape,
        setSize: () => shape,
        setFillStyle: () => shape,
        setStrokeStyle: () => shape,
        setDepth: () => shape,
        setRotation: () => shape,
        setAlpha: () => shape,
        setVisible: () => shape,
        setBlendMode: () => shape,
      };
      return shape;
    };
    const scene = {
      add: {
        rectangle: (x: number, y: number, width: number, height: number, fillColor: number) => {
          pendingRects.push({ x, y, width, height, fillColor });
          return makeShape();
        },
        ellipse: () => makeShape(),
        container: (_x: number, _y: number, children: unknown[]) => {
          const rects = pendingRects.slice(-children.length);
          pendingRects = [];
          const container = {
            list: children,
            setPosition: (x: number, y: number) => {
              const object = descriptors.setDressingObjects.find((candidate) => candidate.x === x && candidate.y === y);
              if (object && targetKinds.has(object.kind)) {
                captured.push({
                  id: object.id,
                  kind: object.kind,
                  childCount: children.length,
                  rects,
                  colors: rects.map((rect) => rect.fillColor),
                });
              }
              return container;
            },
            setScale: () => container,
            setDepth: () => container,
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          return container;
        },
        circle: () => makeShape(),
        star: () => makeShape(),
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

    const byKind = (kind: string) => captured.find((object) => object.kind === kind);
    const cot = byKind("cot");
    expect(cot?.childCount).toBeGreaterThanOrEqual(8);
    expect(cot?.colors).toEqual(expect.arrayContaining([0xd7f7ff, 0x475766, 0x172231]));
    expect(cot?.colors).not.toContain(0xf28c38);
    expect(cot?.rects.some((rect) => rect.fillColor === 0xd7f7ff && rect.width > rect.height)).toBe(true);
    expect(cot?.rects.some((rect) => rect.fillColor === 0x475766 && rect.width > rect.height)).toBe(true);

    const toilet = byKind("toilet");
    expect(toilet?.childCount).toBeGreaterThanOrEqual(6);
    expect(toilet?.colors).toEqual(expect.arrayContaining([0xf0f6fa, 0xc8d3dc, 0x6a7d8f]));
    expect(toilet?.colors).not.toContain(0xfff0b8);
    expect(toilet?.colors).not.toContain(0xf28c38);
    expect(toilet?.rects.some((rect) => rect.fillColor === 0xc8d3dc && rect.y < 0)).toBe(true);
    expect(toilet?.rects.some((rect) => rect.fillColor === 0x6a7d8f && rect.width > rect.height)).toBe(true);
    expect(byKind("bars")?.rects.filter((rect) => rect.height > rect.width).length).toBeGreaterThanOrEqual(4);
    expect(byKind("desk")?.colors).toEqual(expect.arrayContaining([0x6bd3ff, 0xff5f56]));
    expect(byKind("monitor")?.colors).toContain(0xd7f7ff);
    expect(byKind("weapon_rack")?.rects.some((rect) => rect.width <= 6 && rect.height >= 10)).toBe(true);
    expect(byKind("supply_shelf")?.childCount).toBeGreaterThanOrEqual(10);
    expect(byKind("supply_boxes")?.colors).toEqual(expect.arrayContaining([0xfff0b8, 0x8fd694]));
  });

  it("renders lockers and cover as multi-part pixel props instead of plain rectangles", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const descriptors = renderer.describe(snapshot);
    type ContainerRecord = { x: number | null; y: number | null; depth: number | null; childCount: number; colors: number[] };
    const containers: ContainerRecord[] = [];
    const plainRectangles: Array<{ x: number; y: number; width: number; height: number; fillColor: number }> = [];
    let pendingColors: number[] = [];
    const makeShape = () => {
      const shape = {
        destroy: () => undefined,
        setOrigin: () => shape,
        setPosition: () => shape,
        setSize: () => shape,
        setFillStyle: () => shape,
        setStrokeStyle: () => shape,
        setDepth: () => shape,
        setRotation: () => shape,
        setAlpha: () => shape,
        setVisible: () => shape,
        setBlendMode: () => shape,
      };
      return shape;
    };
    const scene = {
      add: {
        rectangle: (x: number, y: number, width: number, height: number, fillColor: number) => {
          plainRectangles.push({ x, y, width, height, fillColor });
          pendingColors.push(fillColor);
          return makeShape();
        },
        ellipse: () => makeShape(),
        container: (_x: number, _y: number, children: unknown[]) => {
          const record = {
            x: null as number | null,
            y: null as number | null,
            depth: null as number | null,
            childCount: children.length,
            colors: pendingColors.slice(-children.length),
          };
          pendingColors = [];
          const container = {
            list: children,
            destroy: () => undefined,
            setPosition: (x: number, y: number) => {
              record.x = x;
              record.y = y;
              return container;
            },
            setScale: () => container,
            setDepth: (depth: number) => {
              record.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          containers.push(record);
          return container;
        },
        circle: () => makeShape(),
        star: () => makeShape(),
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

    renderer.render(scene as never, snapshot);

    const locker = descriptors.hidingSpots.find((spot) => spot.type === "locker");
    const cover = descriptors.coverObjects.find((object) => object.id === "storage_room_crate" || object.id === "central_low_cover");
    const lockerContainer = containers.find((container) => container.x === locker?.x && container.y === locker?.y);
    const coverContainer = containers.find((container) => container.x === cover?.x && container.y === cover?.y);

    expect(lockerContainer?.childCount).toBeGreaterThanOrEqual(7);
    expect(lockerContainer?.colors).toEqual(expect.arrayContaining([0x566b7f, 0x90a9bf, 0xd7f7ff]));
    expect(coverContainer?.childCount).toBeGreaterThanOrEqual(6);
    expect(coverContainer?.colors).toEqual(expect.arrayContaining([0x6b5845, 0xfff0b8]));
    expect(plainRectangles.some((rect) => rect.x === locker?.x && rect.y === locker?.y && rect.width === 34 && rect.height === 46)).toBe(false);
  });

  it("recreates cached cover containers when visual dimensions change", () => {
    const renderer = new GameRenderer();
    const cover = prisonMap.coverObjects[0];
    const originalWidth = cover.width;
    const originalHeight = cover.height;
    type RectCall = { width: number; height: number };
    const coverContainers: Array<{ rects: RectCall[]; destroyCount: number; childDestroyCount: number }> = [];
    let pendingRects: RectCall[] = [];
    const makeShape = () => {
      const shape = {
        destroy: () => undefined,
        setOrigin: () => shape,
        setPosition: () => shape,
        setSize: () => shape,
        setFillStyle: () => shape,
        setStrokeStyle: () => shape,
        setDepth: () => shape,
        setRotation: () => shape,
        setAlpha: () => shape,
        setVisible: () => shape,
        setBlendMode: () => shape,
      };
      return shape;
    };
    const scene = {
      add: {
        rectangle: (_x: number, _y: number, width: number, height: number) => {
          pendingRects.push({ width, height });
          return makeShape();
        },
        ellipse: () => makeShape(),
        container: (_x: number, _y: number, children: Array<{ destroy?: () => void }>) => {
          const rects = pendingRects.slice(-children.length);
          pendingRects = [];
          const record = { rects, destroyCount: 0, childDestroyCount: 0 };
          const container = {
            list: children,
            destroy: () => {
              record.destroyCount += 1;
            },
            setPosition: (x: number, y: number) => {
              if (x === cover.position.x * 64 && y === cover.position.y * 64) {
                coverContainers.push(record);
              }
              return container;
            },
            setScale: () => container,
            setDepth: () => container,
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          children.forEach((child) => {
            const originalDestroy = child.destroy;
            child.destroy = () => {
              record.childDestroyCount += 1;
              originalDestroy?.();
            };
          });
          return container;
        },
        circle: () => makeShape(),
        star: () => makeShape(),
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

    try {
      renderer.render(scene as never, new GameSimulation().getSnapshot());
      cover.width = originalWidth + 0.5;
      cover.height = originalHeight + 0.25;
      renderer.render(scene as never, new GameSimulation().getSnapshot());
    } finally {
      cover.width = originalWidth;
      cover.height = originalHeight;
    }

    expect(coverContainers).toHaveLength(2);
    expect(coverContainers[0].destroyCount).toBe(1);
    expect(coverContainers[0].childDestroyCount).toBeGreaterThan(0);
    expect(coverContainers[1].rects[0]).toEqual({
      width: (originalWidth + 0.5) * 64,
      height: (originalHeight + 0.25) * 64,
    });
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

  it("renders the player with a warm pixel contrast highlight", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const playerDescriptor = renderer.describe(snapshot).player;
    const playerContainers: Array<{ childCount: number; colors: number[]; depth: number | null; x: number | null; y: number | null }> = [];
    let pendingColors: number[] = [];
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
        rectangle: (_x: number, _y: number, _width: number, _height: number, fillColor: number) => {
          pendingColors.push(fillColor);
          return rectangle;
        },
        ellipse: () => rectangle,
        container: (_x: number, _y: number, children: unknown[]) => {
          const containerRecord = {
            childCount: children.length,
            colors: pendingColors.slice(-children.length),
            depth: null as number | null,
            x: null as number | null,
            y: null as number | null,
          };
          pendingColors = [];
          const container = {
            list: children,
            setPosition: (x: number, y: number) => {
              containerRecord.x = x;
              containerRecord.y = y;
              return container;
            },
            setScale: () => container,
            setDepth: (depth: number) => {
              containerRecord.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          playerContainers.push(containerRecord);
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

    renderer.render(scene as never, snapshot);

    const playerContainer = playerContainers.find(
      (container) => container.x === playerDescriptor.x && container.y === playerDescriptor.y && container.depth === 18,
    );
    expect(playerContainer?.childCount).toBeGreaterThanOrEqual(21);
    expect(playerContainer?.colors).toContain(0xfff0b8);
  });

  it("accepts visual-only player render state without changing player descriptor position", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const descriptor = renderer.describe(snapshot).player;
    const playerContainers: Array<{
      depth: number | null;
      scaleX: number | null;
      x: number | null;
      y: number | null;
    }> = [];
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
          const containerRecord = {
            depth: null as number | null,
            scaleX: null as number | null,
            x: null as number | null,
            y: null as number | null,
          };
          const container = {
            list: children,
            setPosition: (x: number, y: number) => {
              containerRecord.x = x;
              containerRecord.y = y;
              return container;
            },
            setScale: (scaleX: number) => {
              containerRecord.scaleX = scaleX;
              return container;
            },
            setDepth: (depth: number) => {
              containerRecord.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          playerContainers.push(containerRecord);
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

    renderer.render(scene as never, snapshot, { facing: "left", walkPhase: 1, moving: true });

    const playerContainer = playerContainers.find((container) => container.depth === 18);
    expect(playerContainer).toMatchObject({
      depth: 18,
      scaleX: -1,
      x: descriptor.x,
      y: descriptor.y,
    });
    expect(renderer.describe(snapshot).player).toEqual(descriptor);
  });

  it("renders side-profile player geometry with a distinct part placement", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const playerDescriptor = renderer.describe(snapshot).player;
    type RectCall = { x: number; y: number; width: number; height: number; fillColor: number };
    const createdPlayers: Array<{ depth: number | null; x: number | null; y: number | null; rects: RectCall[] }> = [];
    let pendingRects: RectCall[] = [];
    const makeShape = () => {
      const shape = {
        destroy: () => undefined,
        setOrigin: () => shape,
        setPosition: () => shape,
        setSize: () => shape,
        setFillStyle: () => shape,
        setStrokeStyle: () => shape,
        setDepth: () => shape,
        setRotation: () => shape,
        setAlpha: () => shape,
        setVisible: () => shape,
        setBlendMode: () => shape,
      };
      return shape;
    };
    const shape = makeShape();
    const scene = {
      add: {
        rectangle: (x: number, y: number, width: number, height: number, fillColor: number) => {
          pendingRects.push({ x, y, width, height, fillColor });
          return makeShape();
        },
        ellipse: () => shape,
        container: (_x: number, _y: number, children: Array<{ destroy?: () => void }>) => {
          const playerRecord = {
            depth: null as number | null,
            x: null as number | null,
            y: null as number | null,
            rects: pendingRects.slice(-children.length),
          };
          pendingRects = [];
          const container = {
            list: children,
            destroy: () => undefined,
            setPosition: (x: number, y: number) => {
              playerRecord.x = x;
              playerRecord.y = y;
              return container;
            },
            setScale: () => container,
            setDepth: (depth: number) => {
              playerRecord.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          createdPlayers.push(playerRecord);
          return container;
        },
        circle: () => shape,
        star: () => shape,
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

    renderer.render(scene as never, snapshot, { facing: "down", walkPhase: 0, moving: false });
    renderer.render(scene as never, snapshot, { facing: "left", walkPhase: 0, moving: false });
    renderer.render(scene as never, snapshot, { facing: "up", walkPhase: 0, moving: false });

    const playerBuilds = createdPlayers.filter(
      (container) => container.depth === 18 && container.x === playerDescriptor.x && container.y === playerDescriptor.y,
    );
    const hasSideOnlyHead = (rects: RectCall[]) =>
      rects.some((rect) => rect.x === 3 && rect.y === -15 && rect.width === 16 && rect.height === 17);

    expect(playerBuilds).toHaveLength(3);
    expect(hasSideOnlyHead(playerBuilds[1].rects)).toBe(true);
    expect(hasSideOnlyHead(playerBuilds[0].rects)).toBe(false);
    expect(hasSideOnlyHead(playerBuilds[2].rects)).toBe(false);
  });

  it("renders distinct player pixel silhouettes for front back and side walking", () => {
    const snapshot = new GameSimulation().getSnapshot();
    const descriptor = new GameRenderer().describe(snapshot).player;
    type RectCall = { x: number; y: number; width: number; height: number; fillColor: number };
    type PlayerBuild = {
      childCount: number;
      colors: number[];
      depth: number | null;
      rects: RectCall[];
      x: number | null;
      y: number | null;
    };
    const renderPlayer = (state: { facing: "up" | "down" | "left" | "right"; walkPhase: 0 | 1; moving: boolean }) => {
      const renderer = new GameRenderer();
      const createdPlayers: PlayerBuild[] = [];
      let pendingRects: RectCall[] = [];
      const makeShape = () => {
        const shape = {
          destroy: () => undefined,
          setOrigin: () => shape,
          setPosition: () => shape,
          setSize: () => shape,
          setFillStyle: () => shape,
          setStrokeStyle: () => shape,
          setDepth: () => shape,
          setRotation: () => shape,
          setAlpha: () => shape,
          setVisible: () => shape,
          setBlendMode: () => shape,
        };
        return shape;
      };
      const shape = makeShape();
      const scene = {
        add: {
          rectangle: (x: number, y: number, width: number, height: number, fillColor: number) => {
            pendingRects.push({ x, y, width, height, fillColor });
            return makeShape();
          },
          ellipse: () => shape,
          container: (_x: number, _y: number, children: Array<{ destroy?: () => void }>) => {
            const rects = pendingRects.slice(-children.length);
            pendingRects = [];
            const playerRecord = {
              childCount: children.length,
              colors: rects.map((rect) => rect.fillColor),
              depth: null as number | null,
              rects,
              x: null as number | null,
              y: null as number | null,
            };
            const container = {
              list: children,
              destroy: () => undefined,
              setPosition: (x: number, y: number) => {
                playerRecord.x = x;
                playerRecord.y = y;
                return container;
              },
              setScale: () => container,
              setDepth: (depth: number) => {
                playerRecord.depth = depth;
                return container;
              },
              setAlpha: () => container,
              setVisible: () => container,
              setRotation: () => container,
            };
            createdPlayers.push(playerRecord);
            return container;
          },
          circle: () => shape,
          star: () => shape,
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

      renderer.render(scene as never, snapshot, state);
      const player = createdPlayers.find(
        (container) => container.depth === 18 && container.x === descriptor.x && container.y === descriptor.y,
      );
      expect(player).toBeDefined();
      return player as PlayerBuild;
    };

    const front = renderPlayer({ facing: "down", walkPhase: 0, moving: false });
    const back = renderPlayer({ facing: "up", walkPhase: 0, moving: false });
    const sideMoving = renderPlayer({ facing: "right", walkPhase: 1, moving: true });
    const sideIdle = renderPlayer({ facing: "right", walkPhase: 0, moving: true });
    const geometryKey = (rect: RectCall) => `${rect.x}:${rect.y}:${rect.width}:${rect.height}:${rect.fillColor}`;
    const geometryKeys = (rects: RectCall[]) => rects.map(geometryKey);
    const sideHeadGeometry = (rect: RectCall) =>
      rect.x === 3 && rect.y === -15 && rect.width === 16 && rect.height === 17;

    expect(front.colors.some((color) => color === 0xf8fbff || color === 0xfff0b8)).toBe(true);
    expect(front.colors).toContain(0xfff0b8);
    expect(front.colors).not.toContain(0x6a7d8f);
    expect(back.colors).toContain(0x6a7d8f);
    expect(back.colors).not.toContain(0xfff0b8);
    expect(sideMoving.colors).toContain(0xfff0b8);
    expect(sideMoving.colors).not.toContain(0x6a7d8f);
    expect(geometryKeys(front.rects)).not.toEqual(geometryKeys(back.rects));
    expect(geometryKeys(sideMoving.rects)).not.toEqual(geometryKeys(front.rects));
    expect(sideMoving.rects.some(sideHeadGeometry)).toBe(true);
    expect(front.rects.some(sideHeadGeometry)).toBe(false);
    expect(sideMoving.childCount).not.toBe(front.childCount);
    expect(geometryKeys(sideMoving.rects)).not.toEqual(geometryKeys(back.rects));
    expect(geometryKeys(sideMoving.rects)).not.toEqual(geometryKeys(sideIdle.rects));
    expect(sideMoving).toMatchObject({ x: sideIdle.x, y: sideIdle.y });
  });

  it("rebuilds the player sprite when visual silhouette changes", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const playerDescriptor = renderer.describe(snapshot).player;
    const destroyedContainers: unknown[] = [];
    const createdContainers: Array<{ colors: number[]; depth: number | null; x: number | null; y: number | null }> = [];
    let pendingColors: number[] = [];
    const rectangle = {
      destroy: () => undefined,
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
        rectangle: (_x: number, _y: number, _width: number, _height: number, fillColor: number) => {
          pendingColors.push(fillColor);
          return rectangle;
        },
        ellipse: () => rectangle,
        container: (_x: number, _y: number, children: Array<{ destroy?: () => void }>) => {
          const colors = pendingColors.slice(-children.length);
          pendingColors = [];
          const containerRecord = {
            colors,
            depth: null as number | null,
            x: null as number | null,
            y: null as number | null,
          };
          const container = {
            list: children,
            destroy: () => {
              destroyedContainers.push(container);
            },
            setPosition: (x: number, y: number) => {
              containerRecord.x = x;
              containerRecord.y = y;
              return container;
            },
            setScale: () => container,
            setDepth: (depth: number) => {
              containerRecord.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          createdContainers.push(containerRecord);
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

    renderer.render(scene as never, snapshot, { facing: "down", walkPhase: 0, moving: false });
    renderer.render(scene as never, snapshot, { facing: "left", walkPhase: 0, moving: false });
    renderer.render(scene as never, snapshot, { facing: "up", walkPhase: 0, moving: false });

    const createdPlayerColors = createdContainers
      .filter((container) => container.depth === 18 && container.x === playerDescriptor.x && container.y === playerDescriptor.y)
      .map((container) => container.colors);

    expect(destroyedContainers.length).toBeGreaterThanOrEqual(1);
    expect(createdPlayerColors[0]).toContain(0xfff0b8);
    expect(createdPlayerColors[0]).not.toContain(0xd7f7ff);
    expect(createdPlayerColors[1]).toContain(0x75e1ff);
    expect(createdPlayerColors[1]).toContain(0xfff0b8);
    expect(createdPlayerColors[1]).not.toContain(0xd7f7ff);
    expect(createdPlayerColors.slice(2).some((colors) => colors.includes(0xd7f7ff))).toBe(true);
  });

  it("reuses the player sprite when movement changes without a visual step", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const playerDescriptor = renderer.describe(snapshot).player;
    type RectCall = { x: number; y: number; width: number; height: number; fillColor: number };
    const destroyedContainers: unknown[] = [];
    const createdPlayers: Array<{ depth: number | null; x: number | null; y: number | null; rects: RectCall[] }> = [];
    let pendingRects: RectCall[] = [];
    const makeShape = () => {
      const shape = {
        destroy: () => undefined,
        setOrigin: () => shape,
        setPosition: () => shape,
        setSize: () => shape,
        setFillStyle: () => shape,
        setStrokeStyle: () => shape,
        setDepth: () => shape,
        setRotation: () => shape,
        setAlpha: () => shape,
        setVisible: () => shape,
        setBlendMode: () => shape,
      };
      return shape;
    };
    const scene = {
      add: {
        rectangle: (x: number, y: number, width: number, height: number, fillColor: number) => {
          pendingRects.push({ x, y, width, height, fillColor });
          return makeShape();
        },
        ellipse: () => makeShape(),
        container: (_x: number, _y: number, children: Array<{ destroy?: () => void }>) => {
          const playerRecord = {
            depth: null as number | null,
            x: null as number | null,
            y: null as number | null,
            rects: pendingRects.slice(-children.length),
          };
          pendingRects = [];
          const container = {
            list: children,
            destroy: () => {
              destroyedContainers.push(container);
            },
            setPosition: (x: number, y: number) => {
              playerRecord.x = x;
              playerRecord.y = y;
              return container;
            },
            setScale: () => container,
            setDepth: (depth: number) => {
              playerRecord.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          createdPlayers.push(playerRecord);
          return container;
        },
        circle: () => makeShape(),
        star: () => makeShape(),
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
    const geometryKeys = (rects: RectCall[]) => rects.map((rect) => `${rect.x}:${rect.y}:${rect.width}:${rect.height}:${rect.fillColor}`);
    const playerBuilds = () =>
      createdPlayers.filter((container) => container.depth === 18 && container.x === playerDescriptor.x && container.y === playerDescriptor.y);

    renderer.render(scene as never, snapshot, { facing: "down", walkPhase: 0, moving: false });
    const idleGeometry = geometryKeys(playerBuilds()[0].rects);

    renderer.render(scene as never, snapshot, { facing: "down", walkPhase: 0, moving: true });

    expect(playerBuilds()).toHaveLength(1);
    expect(destroyedContainers).toHaveLength(0);

    renderer.render(scene as never, snapshot, { facing: "down", walkPhase: 1, moving: true });

    expect(playerBuilds()).toHaveLength(2);
    expect(destroyedContainers).toHaveLength(1);
    expect(geometryKeys(playerBuilds()[1].rects)).not.toEqual(idleGeometry);
  });

  it("renders guards with cold security contrast chips distinct from the player", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const guardPositions = renderer.describe(snapshot).guards.map((guard) => `${guard.x}:${guard.y}`);
    const guardContainers: Array<{ childCount: number; colors: number[]; depth: number | null; x: number | null; y: number | null }> = [];
    const makeShape = (fillColor?: number) => {
      const shape = {
        fillColor,
        setOrigin: () => shape,
        setPosition: () => shape,
        setSize: () => shape,
        setFillStyle: () => shape,
        setStrokeStyle: () => shape,
        setDepth: () => shape,
        setRotation: () => shape,
        setAlpha: () => shape,
        setVisible: () => shape,
        setBlendMode: () => shape,
      };
      return shape;
    };
    const rectangle = makeShape();
    const scene = {
      add: {
        rectangle: (_x: number, _y: number, _width: number, _height: number, fillColor: number) => makeShape(fillColor),
        ellipse: () => rectangle,
        container: (_x: number, _y: number, children: unknown[]) => {
          const colors = children
            .map((child) => (child as { fillColor?: number }).fillColor)
            .filter((fillColor): fillColor is number => fillColor !== undefined);
          const containerRecord = {
            childCount: children.length,
            colors,
            depth: null as number | null,
            x: null as number | null,
            y: null as number | null,
          };
          const container = {
            list: children,
            setPosition: (x: number, y: number) => {
              containerRecord.x = x;
              containerRecord.y = y;
              return container;
            },
            setScale: () => container,
            setDepth: (depth: number) => {
              containerRecord.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          guardContainers.push(containerRecord);
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

    renderer.render(scene as never, snapshot);

    const renderedGuards = guardContainers.filter(
      (container) => guardPositions.includes(`${container.x}:${container.y}`) && container.depth === 18,
    );
    expect(renderedGuards.length).toBeGreaterThanOrEqual(3);
    expect(renderedGuards.every((guard) => guard.childCount >= 23)).toBe(true);
    expect(renderedGuards.some((guard) => guard.colors.includes(0x8bd3ff))).toBe(true);
    expect(renderedGuards.some((guard) => guard.colors.includes(0x6bd3ff))).toBe(true);
    expect(renderedGuards.every((guard) => guard.colors.slice(-3).includes(0x8bd3ff))).toBe(true);
  });

  it("renders set dressing props as pixel object containers", () => {
    const renderer = new GameRenderer();
    const createdContainers: Array<{ depth: number | null; childCount: number }> = [];
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
            setPosition: () => container,
            setScale: () => container,
            setDepth: (depth: number) => {
              container.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          createdContainers.push({ depth: container.depth, childCount: children.length });
          const index = createdContainers.length - 1;
          container.setDepth = (depth: number) => {
            container.depth = depth;
            createdContainers[index].depth = depth;
            return container;
          };
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

    const propContainers = createdContainers.filter((container) => container.depth === 3);
    expect(propContainers.length).toBeGreaterThanOrEqual(10);
    expect(propContainers.every((container) => container.childCount >= 2)).toBe(true);
  });

  it("renders cell fixtures as recognizable pixel-object silhouettes", () => {
    const props = captureSetDressingRender(["starter_cell_bars", "starter_cell_cot", "starter_cell_toilet"]);

    expect(props).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "starter_cell_bars", childCount: expect.any(Number) }),
      expect.objectContaining({ id: "starter_cell_cot", childCount: expect.any(Number) }),
      expect.objectContaining({ id: "starter_cell_toilet", childCount: expect.any(Number) }),
    ]));
    expect(props.find((prop) => prop.id === "starter_cell_bars")?.childCount).toBeGreaterThanOrEqual(7);
    expect(props.find((prop) => prop.id === "starter_cell_bars")?.childCount).toBe(17);
    expect(props.find((prop) => prop.id === "starter_cell_bars")?.fillColors).toEqual(expect.arrayContaining([0x0b1118, 0xb8c6d1]));
    expect(props.find((prop) => prop.id === "starter_cell_cot")?.childCount).toBeGreaterThanOrEqual(8);
    expect(props.find((prop) => prop.id === "starter_cell_toilet")?.childCount).toBeGreaterThanOrEqual(6);
    expect(props.find((prop) => prop.id === "starter_cell_cot")?.fillColors).toEqual(expect.arrayContaining([0xd7f7ff, 0x475766, 0x172231]));
    expect(props.find((prop) => prop.id === "starter_cell_toilet")?.fillColors).toEqual(expect.arrayContaining([0xf0f6fa, 0xc8d3dc, 0x6a7d8f]));
  });

  it("renders security props as control-room silhouettes", () => {
    const props = captureSetDressingRender([
      "security_desk",
      "security_monitor_bank",
      "security_weapon_rack",
      "security_wall_panel",
      "security_camera_marker",
    ]);

    expect(props.find((prop) => prop.id === "security_desk")?.childCount).toBeGreaterThanOrEqual(6);
    expect(props.find((prop) => prop.id === "security_monitor_bank")?.childCount).toBeGreaterThanOrEqual(5);
    expect(props.find((prop) => prop.id === "security_monitor_bank")?.childCount).toBe(23);
    expect(props.find((prop) => prop.id === "security_weapon_rack")?.childCount).toBeGreaterThanOrEqual(5);
    expect(props.find((prop) => prop.id === "security_weapon_rack")?.childCount).toBe(24);
    expect(props.find((prop) => prop.id === "security_monitor_bank")?.fillColors).toEqual(expect.arrayContaining([0x173142, 0x75e1ff, 0xff5f56]));
    expect(props.find((prop) => prop.id === "security_weapon_rack")?.fillColors).toEqual(expect.arrayContaining([0x3d4650, 0xc7d1db, 0xffd166]));
    expect(props.find((prop) => prop.id === "security_wall_panel")?.fillColors).toEqual(expect.arrayContaining([0x75e1ff, 0xff5f56]));
    expect(props.find((prop) => prop.id === "security_camera_marker")?.fillColors).toEqual(expect.arrayContaining([0x111820, 0x6bd3ff]));
  });

  it("renders storage and route markers with stronger object silhouettes", () => {
    const props = captureSetDressingRender([
      "storage_supply_shelf",
      "storage_supply_boxes",
      "storage_bandage_marker",
      "central_corridor_floor_stripe",
      "east_corridor_signage",
      "exit_floor_chevrons",
    ]);

    expect(props.find((prop) => prop.id === "storage_supply_shelf")?.childCount).toBeGreaterThanOrEqual(7);
    expect(props.find((prop) => prop.id === "storage_supply_shelf")?.childCount).toBe(30);
    expect(props.find((prop) => prop.id === "storage_supply_shelf")?.fillColors).toEqual(expect.arrayContaining([0x5f4938, 0xd6a04f, 0x566b7f, 0xcfffd5]));
    expect(props.find((prop) => prop.id === "storage_supply_boxes")?.childCount).toBeGreaterThanOrEqual(6);
    expect(props.find((prop) => prop.id === "storage_supply_boxes")?.childCount).toBe(23);
    expect(props.find((prop) => prop.id === "storage_supply_boxes")?.fillColors).toEqual(expect.arrayContaining([0xd6a04f, 0xb28b63, 0x8b5f3c, 0xffefb0]));
    expect(props.find((prop) => prop.id === "storage_bandage_marker")?.fillColors).toEqual(expect.arrayContaining([0xcfffd5, 0x72d18b]));
    expect(props.find((prop) => prop.id === "central_corridor_floor_stripe")?.childCount).toBeGreaterThanOrEqual(5);
    expect(props.find((prop) => prop.id === "east_corridor_signage")?.fillColors).toEqual(expect.arrayContaining([0x173142, 0xffd166]));
    expect(props.find((prop) => prop.id === "exit_floor_chevrons")?.childCount).toBeGreaterThanOrEqual(4);
    expect(props.find((prop) => prop.id === "exit_floor_chevrons")?.childCount).toBe(19);
    expect(props.find((prop) => prop.id === "exit_floor_chevrons")?.fillColors).toEqual(expect.arrayContaining([0x57d7ff, 0xd7f7ff]));
  });

  it("renders storage and security identity props as multi-part pixel containers", () => {
    const renderer = new GameRenderer();
    const renderedProps: Array<{ id: string; childCount: number }> = [];
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
            setPosition: (x: number, y: number) => {
              const match = new GameRenderer().describe(new GameSimulation().getSnapshot()).setDressingObjects.find(
                (object) => object.x === x && object.y === y,
              );
              if (
                match &&
                [
                  "storage_supply_shelf",
                  "storage_floor_labels",
                  "storage_supply_boxes",
                  "security_wall_panel",
                  "security_camera_marker",
                  "security_status_lights",
                ].includes(match.id)
              ) {
                renderedProps.push({ id: match.id, childCount: children.length });
              }
              return container;
            },
            setScale: () => container,
            setDepth: () => container,
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
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

    expect(renderedProps).toEqual(expect.arrayContaining([
      { id: "storage_supply_shelf", childCount: expect.any(Number) },
      { id: "storage_floor_labels", childCount: expect.any(Number) },
      { id: "storage_supply_boxes", childCount: expect.any(Number) },
      { id: "security_wall_panel", childCount: expect.any(Number) },
      { id: "security_camera_marker", childCount: expect.any(Number) },
      { id: "security_status_lights", childCount: expect.any(Number) },
    ]));
    expect(renderedProps.every((prop) => prop.childCount >= 3)).toBe(true);
  });

  it("renders the expanded environment props as multi-part pixel containers", () => {
    const renderer = new GameRenderer();
    const renderedProps: Array<{ id: string; childCount: number }> = [];
    const descriptors = new GameRenderer().describe(new GameSimulation().getSnapshot());
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
            setPosition: (x: number, y: number) => {
              const match = descriptors.setDressingObjects.find((object) => object.x === x && object.y === y);
              if (
                match &&
                [
                  "starter_cell_wall_marks",
                  "prisoner_cell_a_shadow",
                  "central_corridor_floor_stripe",
                  "east_corridor_signage",
                  "storage_bandage_marker",
                  "exit_floor_chevrons",
                  "security_camera_sweep_marks",
                ].includes(match.id)
              ) {
                renderedProps.push({ id: match.id, childCount: children.length });
              }
              return container;
            },
            setScale: () => container,
            setDepth: () => container,
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
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

    expect(renderedProps).toEqual(expect.arrayContaining([
      { id: "starter_cell_wall_marks", childCount: expect.any(Number) },
      { id: "prisoner_cell_a_shadow", childCount: expect.any(Number) },
      { id: "central_corridor_floor_stripe", childCount: expect.any(Number) },
      { id: "east_corridor_signage", childCount: expect.any(Number) },
      { id: "storage_bandage_marker", childCount: expect.any(Number) },
      { id: "exit_floor_chevrons", childCount: expect.any(Number) },
      { id: "security_camera_sweep_marks", childCount: expect.any(Number) },
    ]));
    const expectedMinimumChildCounts = new Map([
      ["starter_cell_wall_marks", 3],
      ["prisoner_cell_a_shadow", 2],
      ["central_corridor_floor_stripe", 3],
      ["east_corridor_signage", 3],
      ["storage_bandage_marker", 3],
      ["exit_floor_chevrons", 3],
      ["security_camera_sweep_marks", 3],
    ]);

    for (const prop of renderedProps) {
      expect(prop.childCount).toBeGreaterThanOrEqual(expectedMinimumChildCounts.get(prop.id) ?? 3);
    }
  });

  it("destroys old guard sprite parts when facing changes to a different silhouette", () => {
    const renderer = new GameRenderer();
    let childDestroyCount = 0;
    let containerDestroyCount = 0;
    const createShape = () => ({
      destroy: () => {
        childDestroyCount += 1;
      },
      setOrigin: () => createShape(),
      setPosition: () => createShape(),
      setSize: () => createShape(),
      setFillStyle: () => createShape(),
      setStrokeStyle: () => createShape(),
      setDepth: () => createShape(),
      setRotation: () => createShape(),
      setAlpha: () => createShape(),
      setVisible: () => createShape(),
      setBlendMode: () => createShape(),
    });
    const rectangle = createShape();
    const scene = {
      add: {
        rectangle: () => rectangle,
        ellipse: () => rectangle,
        container: (_x: number, _y: number, children: Array<{ destroy?: () => void }>) => {
          const container = {
            list: children,
            destroy: () => {
              containerDestroyCount += 1;
            },
            setPosition: () => container,
            setScale: () => container,
            setDepth: () => container,
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
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
    const downward = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 18.5, y: 5.5 }, facing: { x: 0, y: 1 } }],
    });
    const sideways = new GameSimulation({
      guardOverrides: [{ id: "guard-a", position: { x: 18.5, y: 5.5 }, facing: { x: 1, y: 0 } }],
    });

    renderer.render(scene as never, downward.getSnapshot());
    renderer.render(scene as never, sideways.getSnapshot());

    expect(containerDestroyCount).toBe(1);
    expect(childDestroyCount).toBeGreaterThan(0);
  });

  it("mounts room identity details over the base tile map", () => {
    const renderer = new GameRenderer();
    const rectangles: Array<{ alpha?: number; fillColor?: number; strokeAlpha?: number; strokeColor?: number }> = [];
    const circles: Array<{ alpha?: number; fillColor?: number }> = [];
    const rectangle = {
      setOrigin: () => rectangle,
      setStrokeStyle: (_lineWidth: number, strokeColor: number, strokeAlpha?: number) => {
        rectangles[rectangles.length - 1].strokeColor = strokeColor;
        rectangles[rectangles.length - 1].strokeAlpha = strokeAlpha;
        return rectangle;
      },
      setBlendMode: () => rectangle,
      setDepth: () => rectangle,
      setRotation: () => rectangle,
    };
    const circle = {
      setBlendMode: () => circle,
      setDepth: () => circle,
    };
    const scene = {
      add: {
        rectangle: (_x: number, _y: number, _width: number, _height: number, fillColor: number, alpha?: number) => {
          rectangles.push({ fillColor, alpha });
          return rectangle;
        },
        circle: (_x: number, _y: number, _radius: number, fillColor: number, alpha?: number) => {
          circles.push({ fillColor, alpha });
          return circle;
        },
      },
    };

    renderer.mount(scene as never);

    expect(rectangles.length).toBeGreaterThan(260);
    expect(rectangles.some((rect) => rect.fillColor === 0x1f2c38 && rect.alpha === 0.78)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x1a2430 && rect.alpha === 0.76)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x101923 && rect.alpha === 0.82)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x314352 && rect.alpha === 0.38)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x3a2f25 && rect.alpha === 0.36)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x0e2a3a && rect.alpha === 0.34)).toBe(true);
    expect(rectangles.some((rect) => rect.strokeColor === 0x465b6c)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x0d141c)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x23313d)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x6a7d8f && rect.alpha === 0.5)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x05090e && rect.alpha === 0.48)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x2a3642 && rect.alpha === 0.24)).toBe(true);
    expect(rectangles.some((rect) => rect.strokeColor === 0x405568 && rect.strokeAlpha === 0.78)).toBe(true);
    expect(rectangles.some((rect) => rect.strokeColor === 0x314252 && rect.strokeAlpha === 0.18)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0xffd166 && rect.alpha === 0.36)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x425566 && rect.alpha === 0.3)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0xffd166 && rect.alpha === 0.2)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x0b1118 && rect.alpha === 0.5)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x75e1ff && rect.alpha === 0.42)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0xff5f56 && rect.alpha === 0.46)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x8b5f3c && rect.alpha === 0.22)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x6a7d8f && rect.alpha === 0.26)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x57d7ff && rect.alpha === 0.28)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0xcfffd5 && rect.alpha === 0.18)).toBe(true);
    expect(circles.some((light) => light.fillColor === 0x6bd3ff)).toBe(true);
    expect(circles.some((light) => light.fillColor === 0xffd166)).toBe(true);
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

  it("renders doors as pixel prop containers with hinges handles and lock cues", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const descriptors = renderer.describe(snapshot);
    const doorContainers: Array<{ x: number | null; y: number | null; rotation: number | null; colors: number[]; childCount: number }> = [];
    let pendingColors: number[] = [];
    const makeShape = () => {
      const shape = {
        destroy: () => undefined,
        setOrigin: () => shape,
        setPosition: () => shape,
        setSize: () => shape,
        setFillStyle: () => shape,
        setStrokeStyle: () => shape,
        setDepth: () => shape,
        setRotation: () => shape,
        setAlpha: () => shape,
        setVisible: () => shape,
        setBlendMode: () => shape,
      };
      return shape;
    };
    const scene = {
      add: {
        rectangle: (_x: number, _y: number, _width: number, _height: number, fillColor: number) => {
          pendingColors.push(fillColor);
          return makeShape();
        },
        ellipse: () => makeShape(),
        container: (_x: number, _y: number, children: unknown[]) => {
          const record = { x: null as number | null, y: null as number | null, rotation: null as number | null, colors: pendingColors.slice(-children.length), childCount: children.length };
          pendingColors = [];
          const container = {
            list: children,
            destroy: () => undefined,
            setOrigin: () => container,
            setPosition: (x: number, y: number) => {
              record.x = x;
              record.y = y;
              return container;
            },
            setSize: () => container,
            setFillStyle: () => container,
            setStrokeStyle: () => container,
            setDepth: () => container,
            setRotation: (rotation: number) => {
              record.rotation = rotation;
              return container;
            },
            setScale: () => container,
            setAlpha: () => container,
            setVisible: () => container,
          };
          doorContainers.push(record);
          return container;
        },
        circle: () => makeShape(),
        star: () => makeShape(),
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

    renderer.render(scene as never, snapshot);

    const door = descriptors.doors.find((candidate) => candidate.id === "security_room_door") ?? descriptors.doors[0];
    const rendered = doorContainers.find(
      (container) => container.x === door.hingeX && container.y === door.hingeY && container.colors.includes(0x5a3a28),
    );
    expect(rendered?.childCount).toBeGreaterThanOrEqual(6);
    expect(rendered?.colors).toEqual(expect.arrayContaining([0x5a3a28, 0xff7a6f, 0xfff0b8]));
    expect(rendered?.rotation).toBe(door.visualRotation);
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

  it("renders interactables with stronger pixel-world silhouette cues", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const descriptors = renderer.describe(snapshot);
    type InteractableLabel = "pebble" | "weapon" | "healing" | "lockedDoor" | "mainKey" | "exit" | "other";
    type StrokeCall = { lineWidth: number; strokeColor: number; alpha?: number };
    type FillCall = { fillColor: number; alpha?: number };
    const shapes: Array<{ label: InteractableLabel; strokes: StrokeCall[]; fills: FillCall[] }> = [];
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const matchesPosition = (x: number, y: number, target: { x: number; y: number }) =>
      near(x, target.x) && near(y, target.y);
    const labelRectangle = (x: number, y: number, width: number, height: number): InteractableLabel => {
      if (
        descriptors.weaponPickups.some((pickup) => matchesPosition(x, y, pickup)) &&
        width === 26 &&
        height === 12
      ) {
        return "weapon";
      }
      if (
        descriptors.healingPickups.some((pickup) => matchesPosition(x, y, pickup)) &&
        width === 24 &&
        height === 16
      ) {
        return "healing";
      }
      if (
        descriptors.doors.some((door) => !door.unlocked && matchesPosition(x, y, { x: door.hingeX, y: door.hingeY }))
      ) {
        return "lockedDoor";
      }
      if (matchesPosition(x, y, descriptors.objectives.exit) && width === 40 && height === 52) {
        return "exit";
      }
      return "other";
    };
    const makeShape = (label: InteractableLabel) => {
      const shape = {
        label,
        strokes: [] as StrokeCall[],
        fills: [] as FillCall[],
        setOrigin: () => shape,
        setPosition: () => shape,
        setSize: () => shape,
        setFillStyle: (fillColor: number, alpha?: number) => {
          shape.fills.push({ fillColor, alpha });
          return shape;
        },
        setStrokeStyle: (lineWidth: number, strokeColor: number, alpha?: number) => {
          shape.strokes.push({ lineWidth, strokeColor, alpha });
          return shape;
        },
        setDepth: () => shape,
        setRotation: () => shape,
        setAlpha: () => shape,
        setVisible: () => shape,
        setBlendMode: () => shape,
      };
      shapes.push(shape);
      return shape;
    };
    const scene = {
      add: {
        rectangle: (x: number, y: number, width: number, height: number) => {
          return makeShape(labelRectangle(x, y, width, height));
        },
        ellipse: () => makeShape("other"),
        container: (_x: number, _y: number, children: unknown[]) => {
          const container = {
            list: children,
            setPosition: (x: number, y: number) => {
              if (
                descriptors.doors.some((door) => !door.unlocked && matchesPosition(x, y, { x: door.hingeX, y: door.hingeY }))
              ) {
                const [slab] = children as Array<{ label?: InteractableLabel }>;
                if (slab) {
                  slab.label = "lockedDoor";
                }
              }
              return container;
            },
            setScale: () => container,
            setDepth: () => container,
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
          };
          return container;
        },
        circle: (x: number, y: number) => {
          return makeShape(descriptors.pebbles.some((pebble) => matchesPosition(x, y, pebble)) ? "pebble" : "other");
        },
        star: (x: number, y: number) => {
          return makeShape(matchesPosition(x, y, descriptors.objectives.key) ? "mainKey" : "other");
        },
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

    renderer.render(scene as never, snapshot);

    expect(shapes.find((shape) => shape.label === "pebble")?.strokes).toContainEqual({
      lineWidth: 3,
      strokeColor: 0xfff0b8,
      alpha: 0.62,
    });
    expect(shapes.find((shape) => shape.label === "weapon")?.strokes).toContainEqual({
      lineWidth: 5,
      strokeColor: 0xfff0b8,
      alpha: 0.92,
    });
    expect(shapes.find((shape) => shape.label === "weapon")?.fills).toContainEqual({
      fillColor: 0xd5dde5,
      alpha: 0.98,
    });
    expect(shapes.find((shape) => shape.label === "healing")?.strokes).toContainEqual({
      lineWidth: 5,
      strokeColor: 0xcfffd5,
      alpha: 0.94,
    });
    expect(shapes.find((shape) => shape.label === "healing")?.fills).toContainEqual({
      fillColor: 0x72d18b,
      alpha: 0.98,
    });
    expect(shapes.find((shape) => shape.label === "lockedDoor")?.strokes).toContainEqual({
      lineWidth: 4,
      strokeColor: 0xff7a6f,
      alpha: 0.9,
    });
    expect(shapes.find((shape) => shape.label === "mainKey")?.strokes).toContainEqual({
      lineWidth: 5,
      strokeColor: 0xfff0b8,
      alpha: 0.94,
    });
    expect(shapes.find((shape) => shape.label === "exit")?.strokes).toContainEqual({
      lineWidth: 5,
      strokeColor: 0xd7f7ff,
      alpha: 0.9,
    });
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
