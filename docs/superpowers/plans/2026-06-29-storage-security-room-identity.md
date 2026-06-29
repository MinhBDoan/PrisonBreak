# Storage Security Room Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-blocking Chunky Prison Noir room identity art to the storage and security rooms.

**Architecture:** Extend the existing map-authored `setDressingObjects` with new non-colliding prop kinds, then teach `GameRenderer` to draw those kinds as multi-part Phaser primitive pixel sprites. Keep gameplay collision and routes unchanged.

**Tech Stack:** TypeScript, Phaser primitive game objects, Vitest.

---

## File Structure

- `client/src/game/types.ts`: extend `SetDressingKind` with focused room identity kinds.
- `client/src/game/map.ts`: add storage/security set dressing entries.
- `client/src/render/GameRenderer.ts`: add fills/strokes and multi-part sprites for the new kinds.
- `tests/client/simulation.test.ts`: verify room identity objects exist and stay non-blocking.
- `tests/client/renderer.test.ts`: verify renderer creates multi-part containers for new props.

### Task 1: Add Map-Level Room Identity Props

**Files:**
- Modify: `client/src/game/types.ts`
- Modify: `client/src/game/map.ts`
- Test: `tests/client/simulation.test.ts`

- [ ] **Step 1: Write the failing simulation test**

Add this test near the existing room identity/map dressing tests:

```ts
it("adds non-blocking storage and security room identity dressing", () => {
  expect(prisonMap.setDressingObjects).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "storage_supply_shelf", kind: "supply_shelf" }),
    expect.objectContaining({ id: "storage_floor_labels", kind: "floor_label" }),
    expect.objectContaining({ id: "security_wall_panel", kind: "control_panel" }),
    expect.objectContaining({ id: "security_camera_marker", kind: "camera_marker" }),
  ]));

  const identityObjects = prisonMap.setDressingObjects.filter((object) =>
    ["storage_supply_shelf", "storage_floor_labels", "security_wall_panel", "security_camera_marker"].includes(object.id),
  );
  const samplePoints = identityObjects.map((object) => object.position);

  expect(samplePoints.every((point) => tileAt(prisonMap, point) !== "#")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/client/simulation.test.ts -t "storage and security room identity"`

Expected: FAIL because the new set dressing ids do not exist.

- [ ] **Step 3: Add prop kinds and map entries**

Extend the `SetDressingKind` union with:

```ts
| "supply_shelf"
| "floor_label"
| "control_panel"
| "camera_marker"
```

Add non-blocking set dressing entries in `client/src/game/map.ts`:

```ts
{ id: "storage_supply_shelf", kind: "supply_shelf", position: { x: 16.2, y: 7.85 }, width: 0.62, height: 0.38 },
{ id: "storage_floor_labels", kind: "floor_label", position: { x: 14.15, y: 7.9 }, width: 0.7, height: 0.12 },
{ id: "security_wall_panel", kind: "control_panel", position: { x: 18.55, y: 1.75 }, width: 0.5, height: 0.34 },
{ id: "security_camera_marker", kind: "camera_marker", position: { x: 23.25, y: 2.95 }, width: 0.32, height: 0.24 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/client/simulation.test.ts -t "storage and security room identity"`

Expected: PASS.

### Task 2: Render New Props As Pixel Containers

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Test: `tests/client/renderer.test.ts`

- [ ] **Step 1: Write the failing renderer test**

Add this test near the existing set dressing renderer tests:

```ts
it("renders storage and security identity props as multi-part pixel containers", () => {
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
            createdContainers.push({ depth, childCount: children.length });
            return container;
          },
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

  const propContainers = createdContainers.filter((container) => container.depth === 3);
  expect(propContainers.filter((container) => container.childCount >= 3).length).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/client/renderer.test.ts -t "storage and security identity props"`

Expected: FAIL because the new prop renderers are not multi-part yet.

- [ ] **Step 3: Implement renderer fills/strokes and shapes**

In `setDressingFill`, `setDressingStroke`, and `setDressingAlpha`, add colors for the new kinds:

```ts
if (kind === "supply_shelf") return 0x5f4938;
if (kind === "floor_label") return 0xffd166;
if (kind === "control_panel") return 0x173142;
if (kind === "camera_marker") return 0x8b929a;
```

In `createSetDressingSprite`, add branches that create at least three `addPart(...)` calls for each new kind: shelf body plus boxes/tools, floor label stripes, control panel body plus glowing buttons, camera body plus lens.

- [ ] **Step 4: Run renderer test**

Run: `npm test -- --run tests/client/renderer.test.ts -t "storage and security identity props"`

Expected: PASS.

### Task 3: Verify The Art Pass

**Files:**
- Verify only.

- [ ] **Step 1: Run focused client tests**

Run: `npm test -- --run tests/client/simulation.test.ts tests/client/renderer.test.ts`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run: `npm test -- --run`

Expected: PASS.
