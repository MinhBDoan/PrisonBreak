# Pixel Prison Environment Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing primitive pixel art so cells, corridors, storage, security, and interactables are easier to read while preserving current gameplay.

**Architecture:** Keep the current Phaser primitive renderer and authored map data. Add a few new `SetDressingKind` variants, place non-blocking props in `prisonMap.setDressingObjects`, extend `createSetDressingSprite()` and `addRoomDetails()`, and tune existing interactable render loops with stronger pixel-world cues.

**Tech Stack:** TypeScript, Phaser, Vitest.

---

## File Structure

- Modify `client/src/game/types.ts`: add new set dressing kinds for cell grime, corridor striping, signage, prisoner shadows, and supply/exit accent props.
- Modify `client/src/game/map.ts`: add authored, non-blocking `setDressingObjects` only. Do not change `tiles`, `coverObjects`, patrol routes, pickup positions, doors, or collision helpers.
- Modify `client/src/render/GameRenderer.ts`: add primitive rendering branches for the new dressing kinds, enhance room details, and improve interactable silhouettes for doors, pickups, hiding spots, key, and exit.
- Modify `tests/client/renderer.test.ts`: add descriptor and renderer smoke tests for new props and interactable treatments.
- Modify `tests/client/simulation.test.ts`: add a map-safety test that new set dressing remains non-blocking and off wall tiles.

---

### Task 1: Describe More Pixel-Prison Environment Props

**Files:**
- Modify: `client/src/game/types.ts`
- Modify: `client/src/game/map.ts`
- Modify: `tests/client/renderer.test.ts`
- Modify: `tests/client/simulation.test.ts`

- [ ] **Step 1: Add failing descriptor expectations for new room identity props**

In `tests/client/renderer.test.ts`, add this test after the existing stable descriptor test:

```ts
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
```

- [ ] **Step 2: Add a failing non-blocking map safety test**

In `tests/client/simulation.test.ts`, import `isWall` and add this test near the other map/simulation safety tests:

```ts
import { isWall, prisonMap } from "../../client/src/game/map";
```

If `prisonMap` is already imported from this file, extend the existing import instead of adding a duplicate.

Add the test:

```ts
it("keeps decorative set dressing on traversable map tiles and outside solid collision lists", () => {
  const solidIds = new Set(prisonMap.coverObjects.map((object) => object.id));

  for (const object of prisonMap.setDressingObjects) {
    expect(solidIds.has(object.id)).toBe(false);
    expect(isWall(prisonMap, object.position)).toBe(false);
  }
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts tests/client/simulation.test.ts
```

Expected: FAIL because the new `SetDressingKind` values and map entries do not exist yet.

- [ ] **Step 4: Extend `SetDressingKind`**

In `client/src/game/types.ts`, replace the current `SetDressingKind` union with:

```ts
export type SetDressingKind =
  | "bars"
  | "cot"
  | "bench"
  | "floor_marking"
  | "toilet"
  | "prisoner"
  | "desk"
  | "monitor"
  | "weapon_rack"
  | "supply_shelf"
  | "supply_boxes"
  | "floor_label"
  | "control_panel"
  | "camera_marker"
  | "status_lights"
  | "cell_grime"
  | "prisoner_shadow"
  | "corridor_stripe"
  | "zone_sign"
  | "supply_marker"
  | "exit_marker"
  | "surveillance_marks";
```

- [ ] **Step 5: Add authored non-blocking set dressing**

In `client/src/game/map.ts`, add these entries inside `setDressingObjects`. Keep them near related room props:

```ts
    { id: "starter_cell_wall_marks", kind: "cell_grime", position: { x: 3.0, y: 1.45 }, width: 1.15, height: 0.22 },
    { id: "prisoner_cell_a_wall_marks", kind: "cell_grime", position: { x: 5.75, y: 1.45 }, width: 0.95, height: 0.2 },
    { id: "prisoner_cell_b_wall_marks", kind: "cell_grime", position: { x: 8.05, y: 1.45 }, width: 0.9, height: 0.2 },
    { id: "prisoner_cell_a_shadow", kind: "prisoner_shadow", position: { x: 5.55, y: 3.08 }, width: 0.58, height: 0.12 },
    { id: "prisoner_cell_b_shadow", kind: "prisoner_shadow", position: { x: 7.95, y: 3.08 }, width: 0.58, height: 0.12 },
    { id: "central_corridor_floor_stripe", kind: "corridor_stripe", position: { x: 12.7, y: 5.05 }, width: 6.4, height: 0.08 },
    { id: "east_corridor_floor_stripe", kind: "corridor_stripe", position: { x: 21.0, y: 5.05 }, width: 6.1, height: 0.08 },
    { id: "east_corridor_signage", kind: "zone_sign", position: { x: 18.55, y: 4.25 }, width: 0.72, height: 0.18 },
    { id: "storage_bandage_marker", kind: "supply_marker", position: { x: 13.4, y: 7.68 }, width: 0.5, height: 0.12 },
    { id: "exit_floor_chevrons", kind: "exit_marker", position: { x: 23.8, y: 9.5 }, width: 0.9, height: 0.22 },
    { id: "security_camera_sweep_marks", kind: "surveillance_marks", position: { x: 23.05, y: 2.55 }, width: 0.75, height: 0.32 },
```

- [ ] **Step 6: Run focused tests and verify descriptors pass**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts tests/client/simulation.test.ts
```

Expected: descriptor and map-safety tests pass, while renderer smoke tests may still lack visual-specific expectations for the new kinds.

- [ ] **Step 7: Commit the map/type/test baseline**

Run:

```bash
git add client/src/game/types.ts client/src/game/map.ts tests/client/renderer.test.ts tests/client/simulation.test.ts
git commit -m "Add pixel prison environment prop descriptors"
```

Expected: commit succeeds.

---

### Task 2: Render New Props As Chunky Pixel Containers

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Add a failing renderer smoke test for new prop containers**

In `tests/client/renderer.test.ts`, add this test near the other set dressing rendering tests:

```ts
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
  expect(renderedProps.every((prop) => prop.childCount >= 2)).toBe(true);
});
```

- [ ] **Step 2: Run the focused renderer test and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because new prop kinds currently use the generic fallback, and at least some expected child counts are too low or visually indistinct.

- [ ] **Step 3: Add primitive branches for the new prop kinds**

In `client/src/render/GameRenderer.ts`, inside `createSetDressingSprite()`, add these branches before the final `else`:

```ts
  } else if (kind === "cell_grime") {
    addPart(-width * 0.28, -height * 0.12, width * 0.32, Math.max(4, height * 0.38), 0x0b1118, 0x465b6c, 0.34);
    addPart(width * 0.08, height * 0.05, width * 0.22, Math.max(4, height * 0.28), 0x394958, 0x6a7d8f, 0.28);
    addPart(width * 0.34, -height * 0.04, width * 0.12, Math.max(4, height * 0.24), 0x8b5f3c, 0xb28b63, 0.24);
  } else if (kind === "prisoner_shadow") {
    addPart(0, 0, width, height, 0x05080c, 0x05080c, 0.38);
    addPart(width * 0.18, 0, width * 0.42, Math.max(3, height * 0.55), 0x111820, 0x05080c, 0.22);
  } else if (kind === "corridor_stripe") {
    addPart(0, 0, width, height, 0xffd166, 0xfff0b8, 0.28);
    addPart(-width * 0.32, 0, width * 0.12, height * 1.4, 0x6a7d8f, 0xd5dde5, 0.24);
    addPart(width * 0.32, 0, width * 0.12, height * 1.4, 0x6a7d8f, 0xd5dde5, 0.24);
  } else if (kind === "zone_sign") {
    addPart(0, 0, width, height, 0x173142, 0x6bd3ff, 0.88);
    addPart(-width * 0.24, 0, width * 0.12, height * 0.72, 0x6bd3ff, 0xd7f7ff, 0.82);
    addPart(width * 0.08, 0, width * 0.34, Math.max(4, height * 0.18), 0xffd166, 0xfff0b8, 0.72);
  } else if (kind === "supply_marker") {
    addPart(0, 0, width, height, 0xcfffd5, 0x72d18b, 0.52);
    addPart(0, 0, width * 0.18, height * 1.5, 0x72d18b, 0xcfffd5, 0.78);
    addPart(0, 0, width * 0.64, height * 0.34, 0x72d18b, 0xcfffd5, 0.78);
  } else if (kind === "exit_marker") {
    addPart(-width * 0.22, 0, width * 0.22, height, 0x57d7ff, 0xd7f7ff, 0.58).setRotation(0.42);
    addPart(0, 0, width * 0.22, height, 0x57d7ff, 0xd7f7ff, 0.66).setRotation(0.42);
    addPart(width * 0.22, 0, width * 0.22, height, 0x57d7ff, 0xd7f7ff, 0.58).setRotation(0.42);
  } else if (kind === "surveillance_marks") {
    addPart(0, 0, width, Math.max(4, height * 0.12), 0x6bd3ff, 0xd7f7ff, 0.3);
    addPart(-width * 0.24, height * 0.18, width * 0.32, Math.max(4, height * 0.1), 0xff5f56, 0xffb3b0, 0.26).setRotation(-0.28);
    addPart(width * 0.24, height * 0.18, width * 0.32, Math.max(4, height * 0.1), 0xff5f56, 0xffb3b0, 0.26).setRotation(0.28);
```

- [ ] **Step 4: Run the focused renderer test**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit prop rendering**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Render expanded pixel prison environment props"
```

Expected: commit succeeds.

---

### Task 3: Strengthen Room Background Details

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Add failing expectations for broader room detail colors**

In the existing `mounts room identity details over the base tile map` test in `tests/client/renderer.test.ts`, add these expectations before the final circle assertions:

```ts
    expect(rectangles.some((rect) => rect.fillColor === 0x8b5f3c && rect.alpha === 0.22)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x6a7d8f && rect.alpha === 0.26)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x57d7ff && rect.alpha === 0.28)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0xcfffd5 && rect.alpha === 0.18)).toBe(true);
```

- [ ] **Step 2: Run focused renderer test and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because those additional background marks are not mounted yet.

- [ ] **Step 3: Extend `addRoomDetails()` with pixel background accents**

In `client/src/render/GameRenderer.ts`, inside `addRoomDetails()` after the existing corridor line loops and before the monitor/security accent rectangles, add:

```ts
  for (const x of [2.2, 4.9, 7.4]) {
    addRect(x, 1.42, 0.34, 0.05, 0x8b5f3c, 0.22, 1);
    addRect(x + 0.28, 1.58, 0.22, 0.04, 0x6a7d8f, 0.18, 1);
  }
  for (const x of [10.5, 12.5, 14.5, 18.5, 20.5, 22.5]) {
    addRect(x, 4.28, 0.52, 0.05, 0x6a7d8f, 0.26, 1);
  }
  addRect(13.4, 7.62, 0.48, 0.06, 0xcfffd5, 0.18, 1);
  addRect(24.05, 9.5, 0.42, 0.08, 0x57d7ff, 0.28, 1);
  addRect(23.65, 9.5, 0.28, 0.08, 0x57d7ff, 0.22, 1);
```

- [ ] **Step 4: Run focused renderer test**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit room background details**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Add pixel prison room background accents"
```

Expected: commit succeeds.

---

### Task 4: Improve Interactable World Readability

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Add a failing smoke test for stronger interactable silhouettes**

In `tests/client/renderer.test.ts`, add this test near the door/key/pickup rendering tests:

```ts
it("renders interactables with stronger pixel-world silhouette cues", () => {
  const renderer = new GameRenderer();
  const rectangles: Array<{ fillColor?: number; alpha?: number; strokeColor?: number; lineWidth?: number }> = [];
  const stars: Array<{ fillColor?: number; strokeColor?: number; lineWidth?: number }> = [];
  const circles: Array<{ fillColor?: number; strokeColor?: number; lineWidth?: number }> = [];
  const makeRect = () => ({
    setOrigin: () => makeRect(),
    setPosition: () => makeRect(),
    setSize: () => makeRect(),
    setFillStyle: (fillColor: number, alpha?: number) => {
      rectangles.push({ fillColor, alpha });
      return makeRect();
    },
    setStrokeStyle: (lineWidth: number, strokeColor: number) => {
      rectangles.push({ lineWidth, strokeColor });
      return makeRect();
    },
    setDepth: () => makeRect(),
    setRotation: () => makeRect(),
    setAlpha: () => makeRect(),
    setVisible: () => makeRect(),
    setBlendMode: () => makeRect(),
  });
  const rectangle = makeRect();
  const circle = {
    setPosition: () => circle,
    setVisible: () => circle,
    setStrokeStyle: (lineWidth: number, strokeColor: number) => {
      circles.push({ lineWidth, strokeColor });
      return circle;
    },
    setBlendMode: () => circle,
    setDepth: () => circle,
  };
  const star = {
    setPosition: () => star,
    setVisible: () => star,
    setFillStyle: (fillColor: number) => {
      stars.push({ fillColor });
      return star;
    },
    setStrokeStyle: (lineWidth: number, strokeColor: number) => {
      stars.push({ lineWidth, strokeColor });
      return star;
    },
  };
  const scene = {
    add: {
      rectangle: (_x: number, _y: number, _width: number, _height: number, fillColor: number, alpha?: number) => {
        rectangles.push({ fillColor, alpha });
        return rectangle;
      },
      ellipse: () => rectangle,
      container: (_x: number, _y: number, children: unknown[]) => ({
        list: children,
        setPosition: () => undefined,
        setScale: () => undefined,
        setDepth: () => undefined,
        setAlpha: () => undefined,
        setVisible: () => undefined,
        setRotation: () => undefined,
      }),
      circle: (_x: number, _y: number, _radius: number, fillColor: number) => {
        circles.push({ fillColor });
        return circle;
      },
      star: (_x: number, _y: number, _points: number, _inner: number, _outer: number, fillColor: number) => {
        stars.push({ fillColor });
        return star;
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

  renderer.render(scene as never, new GameSimulation().getSnapshot());

  expect(rectangles.some((rect) => rect.strokeColor === 0xd7f7ff && rect.lineWidth === 4)).toBe(true);
  expect(rectangles.some((rect) => rect.strokeColor === 0xfff0b8 && rect.lineWidth === 4)).toBe(true);
  expect(stars.some((shape) => shape.strokeColor === 0xd7f7ff && shape.lineWidth === 4)).toBe(true);
  expect(circles.some((shape) => shape.strokeColor === 0xfff0b8 && shape.lineWidth === 3)).toBe(true);
});
```

- [ ] **Step 2: Run focused renderer test and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because existing interactable outlines are thinner and less differentiated.

- [ ] **Step 3: Strengthen pickup and objective outlines**

In `client/src/render/GameRenderer.ts`, update these existing render loops:

For pebbles, replace:

```ts
      existing.setStrokeStyle(2, 0xefe1c8, 0.4);
```

with:

```ts
      existing.setStrokeStyle(3, 0xfff0b8, 0.62);
```

For weapon pickups, replace:

```ts
      existing.setStrokeStyle(2, 0xffd166, 0.78);
```

with:

```ts
      existing.setStrokeStyle(4, 0xfff0b8, 0.86);
```

For healing pickups, replace:

```ts
      existing.setStrokeStyle(2, 0x72d18b, 0.85);
```

with:

```ts
      existing.setStrokeStyle(4, 0xcfffd5, 0.9);
```

For the main objective key, replace:

```ts
    objects.key.setStrokeStyle(3, descriptors.objectives.key.strokeColor, 0.86);
```

with:

```ts
    objects.key.setStrokeStyle(4, descriptors.objectives.key.strokeColor, 0.92);
```

- [ ] **Step 4: Strengthen door and exit outlines**

In the door render loop, replace:

```ts
      existing.setStrokeStyle(3, door.unlocked ? 0xffd166 : 0xc45a4a, 0.86);
```

with:

```ts
      existing.setStrokeStyle(4, door.unlocked ? 0xfff0b8 : 0xff7a6f, 0.9);
```

In the exit render block, find the current `objects.exit.setStrokeStyle(...)` call and set it to:

```ts
    objects.exit.setStrokeStyle(4, descriptors.objectives.exit.unlocked ? 0xd7f7ff : 0xfff0b8, 0.88);
```

- [ ] **Step 5: Run focused renderer test**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit interactable readability**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Improve pixel interactable readability"
```

Expected: commit succeeds.

---

### Task 5: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-29-pixel-prison-environment-readability.md`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 2: Inspect the final diff and status**

Run:

```bash
git status --short
git log --oneline --decorate -5
```

Expected: only the plan file remains uncommitted, plus the pre-existing untracked `.superpowers/` scratch directory if it is still present.

- [ ] **Step 3: Commit the implementation plan if it is still uncommitted**

Run:

```bash
git add docs/superpowers/plans/2026-06-29-pixel-prison-environment-readability.md
git commit -m "Plan pixel prison environment readability pass"
```

Expected: commit succeeds.

