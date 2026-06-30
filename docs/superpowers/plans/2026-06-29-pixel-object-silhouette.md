# Pixel Object Silhouette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the most placeholder-like environment rectangles with recognizable irregular pixel-art prison object silhouettes while preserving gameplay and map layout.

**Architecture:** Keep the pass renderer-driven. `GameRenderer` will continue to derive descriptors from existing map/simulation state, but static props that are currently single rectangles will render as small Phaser containers made from many pixel chunks. Tests will use scene doubles to capture rectangle geometry/colors and prove objects are no longer plain boxes.

**Tech Stack:** TypeScript, Phaser primitive rectangles/ellipses/containers, Vitest renderer tests, Vite browser inspection.

---

## File Structure

- Modify `client/src/render/GameRenderer.ts`
  - Add small prop-sprite helpers for irregular pixel silhouettes.
  - Extend `createSetDressingSprite(...)` for cots, toilets, bars, desk, monitors, shelves, boxes, weapon rack, and signage.
  - Convert locker hiding spots and cover objects to container sprites with object-specific chunks.
  - Convert doors to container sprites with panel, hinge, handle, lock plate, and state cues.
- Modify `tests/client/renderer.test.ts`
  - Add scene-double tests for multi-part object silhouettes.
  - Verify no gameplay descriptor changes are required.
  - Verify key/weapon/healing pickups remain visually distinct from prop details.

## Task 1: Cell And Room Set-Dressing Silhouettes

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Write failing renderer tests for set-dressing object silhouettes**

Add this test near the existing set-dressing renderer tests in `tests/client/renderer.test.ts`.

```ts
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
    expect(byKind("cot")?.childCount).toBeGreaterThanOrEqual(8);
    expect(byKind("cot")?.colors).toEqual(expect.arrayContaining([0xd7f7ff, 0xf28c38]));
    expect(byKind("toilet")?.childCount).toBeGreaterThanOrEqual(7);
    expect(byKind("toilet")?.colors).toEqual(expect.arrayContaining([0xf0f6fa, 0x6a7d8f]));
    expect(byKind("bars")?.rects.filter((rect) => rect.height > rect.width).length).toBeGreaterThanOrEqual(4);
    expect(byKind("desk")?.colors).toEqual(expect.arrayContaining([0x6bd3ff, 0xff5f56]));
    expect(byKind("monitor")?.colors).toContain(0xd7f7ff);
    expect(byKind("weapon_rack")?.rects.some((rect) => rect.width <= 6 && rect.height >= 10)).toBe(true);
    expect(byKind("supply_shelf")?.childCount).toBeGreaterThanOrEqual(10);
    expect(byKind("supply_boxes")?.colors).toEqual(expect.arrayContaining([0xfff0b8, 0x8fd694]));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts -t "renders cell and room set dressing as irregular pixel object silhouettes"
```

Expected: FAIL because at least one target object lacks the required irregular geometry or signature colors.

- [ ] **Step 3: Add prop silhouette helpers and richer set-dressing sprites**

In `client/src/render/GameRenderer.ts`, inside `createSetDressingSprite(...)`, keep `createPixelMatrixSprite(...)` and `addPart(...)`, then add helpers before the `if (kind === "bars")` block:

```ts
  const notch = (x: number, y: number, partWidth: number, partHeight: number, color: number, alpha = 0.96) =>
    addPart(x, y, partWidth, partHeight, color, setDressingStroke(kind), alpha);
  const cap = (x: number, y: number, partWidth: number, partHeight: number, color: number) =>
    addPart(x, y, partWidth, partHeight, color, setDressingStroke(kind), 0.9);
```

Then replace the current `bars`, `cot`, `toilet`, `desk`, `monitor`, `weapon_rack`, `supply_shelf`, and `supply_boxes` branches with richer silhouettes. Use existing dimensions and the following required visual cues:

```ts
  if (kind === "bars") {
    addPart(0, -height * 0.42, width, Math.max(4, height * 0.22), 0xd5dde5, 0xeef6ff, 0.9);
    addPart(0, height * 0.42, width, Math.max(4, height * 0.22), 0x6a7d8f, 0xd5dde5, 0.88);
    for (const offset of [-0.36, -0.12, 0.12, 0.36]) {
      addPart(width * offset, 0, Math.max(3, width * 0.06), height * 1.12, 0x9aa7b4, 0xd5dde5, 0.92);
    }
    cap(-width * 0.48, 0, Math.max(3, width * 0.08), height * 1.2, 0x44515f);
    cap(width * 0.48, 0, Math.max(3, width * 0.08), height * 1.2, 0x44515f);
  } else if (kind === "cot") {
    addPart(0, 0, width * 0.92, height * 0.7, 0x475766, 0x7f93a8, 0.96);
    addPart(-width * 0.26, -height * 0.08, width * 0.28, height * 0.42, 0xd7f7ff, 0xf8fbff, 0.92);
    addPart(width * 0.17, height * 0.02, width * 0.42, height * 0.44, 0xf28c38, 0xffd166, 0.95);
    addPart(-width * 0.42, -height * 0.4, width * 0.12, height * 0.2, 0x172231, 0x7f93a8, 0.9);
    addPart(width * 0.42, -height * 0.4, width * 0.12, height * 0.2, 0x172231, 0x7f93a8, 0.9);
    addPart(-width * 0.42, height * 0.42, width * 0.12, height * 0.18, 0x172231, 0x7f93a8, 0.9);
    addPart(width * 0.42, height * 0.42, width * 0.12, height * 0.18, 0x172231, 0x7f93a8, 0.9);
    addPart(0, height * 0.46, width * 0.74, Math.max(3, height * 0.12), 0x101820, 0x293341, 0.5);
  } else if (kind === "toilet") {
    addPart(0, -height * 0.28, width * 0.58, height * 0.34, 0xc8d3dc, 0xf0f6fa, 0.96);
    addPart(0, height * 0.08, width * 0.76, height * 0.5, 0xf0f6fa, 0x6a7d8f, 0.96);
    addPart(0, height * 0.08, width * 0.38, height * 0.24, 0x6a7d8f, 0xd7f7ff, 0.76);
    addPart(-width * 0.26, height * 0.36, width * 0.18, height * 0.2, 0x44515f, 0x9aa7b4, 0.85);
    addPart(width * 0.28, -height * 0.44, width * 0.16, height * 0.22, 0xd7f7ff, 0xf0f6fa, 0.82);
    addPart(0, height * 0.5, width * 0.6, Math.max(3, height * 0.1), 0x101820, 0x293341, 0.45);
  }
```

For `desk`, `monitor`, `weapon_rack`, `supply_shelf`, and `supply_boxes`, preserve the existing colors and add enough extra parts so the tests pass: monitor screens must include `0xd7f7ff`; desk buttons must include `0xff5f56`; supply boxes must include `0xfff0b8` and `0x8fd694`; weapon rack must include narrow tall hook/weapon rectangles.

- [ ] **Step 4: Run focused renderer test**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts -t "renders cell and room set dressing as irregular pixel object silhouettes"
```

Expected: PASS.

- [ ] **Step 5: Run full renderer test and commit**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
npm run typecheck
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Add irregular set dressing pixel silhouettes"
```

Expected: renderer tests and typecheck pass.

## Task 2: Locker And Cover Object Containers

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Write failing renderer test for lockers and cover**

Add this test near the hiding spot and cover renderer coverage in `tests/client/renderer.test.ts`.

```ts
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
          const record = { x: null as number | null, y: null as number | null, depth: null as number | null, childCount: children.length, colors: pendingColors.slice(-children.length) };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts -t "renders lockers and cover as multi-part pixel props instead of plain rectangles"
```

Expected: FAIL because lockers and cover are still plain rectangles.

- [ ] **Step 3: Change render object maps and add container helpers**

In `client/src/render/GameRenderer.ts`, change `RenderObjects`:

```ts
  hidingSpots: Map<string, Phaser.GameObjects.Container>;
  coverObjects: Map<string, Phaser.GameObjects.Container>;
```

Add helpers near `createSetDressingSprite(...)`:

```ts
function createLockerSprite(scene: Phaser.Scene, bodyOccupied: boolean): Phaser.GameObjects.Container {
  const body = addPixelRect(scene, 0, 0, 30, 44, bodyOccupied ? 0x5b3240 : 0x566b7f, bodyOccupied ? 0.94 : 0.9);
  body.setStrokeStyle(2, bodyOccupied ? 0xff7a8a : 0x90a9bf, bodyOccupied ? 0.8 : 0.55);
  const doorSplit = addPixelRect(scene, 0, 0, 3, 40, bodyOccupied ? 0xff7a8a : 0x293746, 0.85);
  const ventTop = addPixelRect(scene, -6, -13, 9, 3, 0xd7f7ff, 0.72);
  const ventBottom = addPixelRect(scene, 6, -7, 9, 3, 0x90a9bf, 0.72);
  const handle = addPixelRect(scene, 9, 3, 3, 10, bodyOccupied ? 0xffd166 : 0xfff0b8, 0.9);
  const base = addPixelRect(scene, 0, 23, 26, 5, 0x101820, 0.55);
  const notchLeft = addPixelRect(scene, -17, -18, 4, 8, 0x101820, 0.34);
  const notchRight = addPixelRect(scene, 17, 15, 4, 8, 0x101820, 0.34);
  return scene.add.container(0, 0, [body, doorSplit, ventTop, ventBottom, handle, base, notchLeft, notchRight]);
}

function createCoverSprite(scene: Phaser.Scene, width: number, height: number): Phaser.GameObjects.Container {
  const body = addPixelRect(scene, 0, 0, width, height, 0x6b5845, 0.95);
  body.setStrokeStyle(2, 0xb28b63, 0.75);
  const top = addPixelRect(scene, 0, -height * 0.32, width * 0.84, Math.max(5, height * 0.18), 0x8a6a4c, 0.9);
  const strap = addPixelRect(scene, 0, 0, Math.max(5, width * 0.12), height * 0.86, 0xfff0b8, 0.72);
  const leftCap = addPixelRect(scene, -width * 0.44, height * 0.18, Math.max(5, width * 0.12), height * 0.35, 0x3b3028, 0.88);
  const rightCap = addPixelRect(scene, width * 0.44, -height * 0.1, Math.max(5, width * 0.12), height * 0.35, 0x3b3028, 0.88);
  const shadow = addPixelRect(scene, 0, height * 0.5, width * 0.76, Math.max(4, height * 0.14), 0x101820, 0.38);
  return scene.add.container(0, 0, [body, top, strap, leftCap, rightCap, shadow]);
}
```

- [ ] **Step 4: Use containers in render loops**

Replace the hiding spot and cover loops in `GameRenderer.render(...)` so they create containers once and update position/depth. For lockers, use `createLockerSprite(scene, spot.bodyOccupied)` and recreate if occupied state changes by adding `lockerOccupied: Map<string, boolean>` to `RenderObjects`. For shadow hiding spots, keep a simple dark low container or one rectangle inside a container.

For cover objects, create with `createCoverSprite(scene, cover.width, cover.height)` and set depth `3`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts -t "renders lockers and cover as multi-part pixel props instead of plain rectangles"
npm test -- --run tests/client/renderer.test.ts
npm run typecheck
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Render lockers and cover as pixel prop containers"
```

Expected: focused test, renderer tests, and typecheck pass.

## Task 3: Door Pixel Silhouettes And State Cues

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Write failing door renderer test**

Add this test near door renderer tests in `tests/client/renderer.test.ts`.

```ts
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
    const rendered = doorContainers.find((container) => container.x === door.hingeX && container.y === door.hingeY);
    expect(rendered?.childCount).toBeGreaterThanOrEqual(6);
    expect(rendered?.colors).toEqual(expect.arrayContaining([0x5a3a28, 0xff7a6f, 0xfff0b8]));
    expect(rendered?.rotation).toBe(door.visualRotation);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts -t "renders doors as pixel prop containers with hinges handles and lock cues"
```

Expected: FAIL because doors are currently single rectangles.

- [ ] **Step 3: Convert doors map to containers**

In `RenderObjects`, change:

```ts
  doors: Map<string, Phaser.GameObjects.Container>;
```

Add helper near prop helpers:

```ts
function createDoorSprite(scene: Phaser.Scene, door: RenderDescriptors["doors"][number]): Phaser.GameObjects.Container {
  const baseColor = door.open ? 0x51745a : door.unlocked ? 0x8f5f34 : 0x5a3a28;
  const cueColor = door.unlocked ? 0xfff0b8 : 0xff7a6f;
  const slab = addPixelRect(scene, door.width / 2, 0, door.width, door.height, baseColor, door.open ? 0.72 : 0.98);
  slab.setStrokeStyle(4, cueColor, 0.9);
  const hinge = addPixelRect(scene, 0, 0, Math.max(5, door.width * 0.08), door.height * 1.18, 0x2f2721, 0.94);
  const handle = addPixelRect(scene, door.width * 0.78, 0, Math.max(5, door.width * 0.08), Math.max(5, door.height * 0.42), 0xfff0b8, 0.95);
  const lockPlate = addPixelRect(scene, door.width * 0.64, 0, Math.max(6, door.width * 0.1), Math.max(5, door.height * 0.5), cueColor, 0.86);
  const panelA = addPixelRect(scene, door.width * 0.32, -door.height * 0.22, door.width * 0.28, Math.max(4, door.height * 0.18), 0xb28b63, 0.5);
  const panelB = addPixelRect(scene, door.width * 0.32, door.height * 0.22, door.width * 0.28, Math.max(4, door.height * 0.18), 0x3b3028, 0.45);
  return scene.add.container(0, 0, [slab, hinge, handle, lockPlate, panelA, panelB]);
}
```

In the door render loop, create/recreate the container when it is missing. Set position to `door.hingeX`, `door.hingeY`, rotation to `door.visualRotation`, and depth to match existing door depth behavior. Since door open/unlocked can change, either recreate every render for changed state by tracking `doorVisualStates: Map<string, string>` or update by destroying/recreating when `${door.open}:${door.unlocked}:${door.visualRotation}` changes.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts -t "renders doors as pixel prop containers with hinges handles and lock cues"
npm test -- --run tests/client/renderer.test.ts
npm run typecheck
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Render doors as pixel prop containers"
```

Expected: focused test, renderer tests, and typecheck pass.

## Task 4: Full Verification And Browser Inspection

**Files:**
- No new files expected.
- Inspect changes in `client/src/render/GameRenderer.ts` and `tests/client/renderer.test.ts`.

- [ ] **Step 1: Verify changed files**

Run:

```bash
git diff --stat HEAD~3..HEAD
git status --short
```

Expected: implementation commits touch only `client/src/render/GameRenderer.ts` and `tests/client/renderer.test.ts`, plus the already committed spec/plan docs. Existing untracked `.superpowers/` may remain untouched.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test -- --run
npm run typecheck
```

Expected: all tests pass and typecheck exits 0.

- [ ] **Step 3: Browser inspect object readability**

Open or reload `http://127.0.0.1:5173/` and start a run.

Inspect:

- Cells: cots, toilets, bars, and lockers are recognizable and less boxy.
- Storage: shelves/boxes read as supplies, not collectible pickups.
- Security: desk/monitor/rack/panel read as security objects.
- Doors: locked/unlocked/open state cues remain readable.
- Player, guards, keys, weapon pickup, healing pickup, and exit objective still stand out.
- Movement/sprint/guards feel unchanged.

- [ ] **Step 4: Commit browser tuning if needed**

If browser inspection reveals art clutter or weak silhouettes, make renderer-only tuning changes, run:

```bash
npm test -- --run tests/client/renderer.test.ts
npm run typecheck
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Tune pixel prop silhouette readability"
```

Expected: focused tests and typecheck pass before any tuning commit.
