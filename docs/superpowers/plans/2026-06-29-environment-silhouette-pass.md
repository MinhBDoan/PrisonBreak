# Environment Silhouette Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing prison environment props read as recognizable chunky pixel objects while preserving current gameplay and primitive rendering.

**Architecture:** Refine the existing `createSetDressingSprite()` branches in `client/src/render/GameRenderer.ts` rather than adding imported assets or a new renderer. Add targeted renderer tests that prove specific prop families have enough child parts and signature colors to distinguish cells, storage, security, corridors, and exits from generic rectangles.

**Tech Stack:** TypeScript, Phaser, Vitest.

---

## File Structure

- Modify `client/src/render/GameRenderer.ts`: strengthen existing `SetDressingKind` rendering branches for bars, cot, toilet, desk, monitor, weapon rack, supply shelf, supply boxes, control panel, camera marker, corridor signs, and exit markers.
- Modify `tests/client/renderer.test.ts`: add targeted prop-family smoke tests with per-kind child counts and signature colors. Reuse the existing scene-double style; do not add browser or screenshot tests in this pass.
- Do not modify `client/src/game/map.ts` unless a reviewer finds an existing prop placement prevents a silhouette from reading. No gameplay data, collision data, patrols, pickups, doors, or objectives should change.

---

### Task 1: Cell Fixture Silhouettes

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Add a failing cell fixture silhouette test**

In `tests/client/renderer.test.ts`, add this helper near the other renderer scene-double tests:

```ts
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
```

Then add this test near the existing set dressing rendering tests:

```ts
it("renders cell fixtures as recognizable pixel-object silhouettes", () => {
  const props = captureSetDressingRender(["starter_cell_bars", "starter_cell_cot", "starter_cell_toilet"]);

  expect(props).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "starter_cell_bars", childCount: expect.any(Number) }),
    expect.objectContaining({ id: "starter_cell_cot", childCount: expect.any(Number) }),
    expect.objectContaining({ id: "starter_cell_toilet", childCount: expect.any(Number) }),
  ]));
  expect(props.find((prop) => prop.id === "starter_cell_bars")?.childCount).toBeGreaterThanOrEqual(7);
  expect(props.find((prop) => prop.id === "starter_cell_cot")?.childCount).toBeGreaterThanOrEqual(6);
  expect(props.find((prop) => prop.id === "starter_cell_toilet")?.childCount).toBeGreaterThanOrEqual(5);
  expect(props.find((prop) => prop.id === "starter_cell_cot")?.fillColors).toEqual(expect.arrayContaining([0xd6dde4, 0x2d3b49, 0x7f93a8]));
  expect(props.find((prop) => prop.id === "starter_cell_toilet")?.fillColors).toEqual(expect.arrayContaining([0xe9f1f6, 0x91a8b6]));
});
```

- [ ] **Step 2: Run the focused renderer test and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because current cot, toilet, and some bar variants do not meet the stronger child-count requirements.

- [ ] **Step 3: Strengthen bars, cot, and toilet branches**

In `client/src/render/GameRenderer.ts`, inside `createSetDressingSprite()`, replace the `bars`, `cot`, and `toilet` branches with:

```ts
  if (kind === "bars") {
    const barCount = Math.max(5, Math.floor(width / 10));
    addPart(0, 0, width, Math.max(5, height), 0x263341, 0x9aa7b4, 0.82);
    addPart(0, -Math.max(11, height + 8), width, 4, 0x0b1118, 0x9aa7b4, 0.86);
    addPart(0, Math.max(11, height + 8), width, 4, 0x0b1118, 0x9aa7b4, 0.78);
    for (let index = 0; index < barCount; index += 1) {
      const x = -width / 2 + ((index + 0.5) * width) / barCount;
      addPart(x, 0, 5, Math.max(24, height + 22), 0xb8c6d1, 0xe2e8ef, 0.96);
    }
  } else if (kind === "cot") {
    addPart(0, 0, width, height, 0x3e5364, 0x7f93a8, 0.96);
    addPart(-width * 0.32, -height * 0.18, width * 0.3, height * 0.46, 0xd6dde4, 0xf0f6fa, 0.98);
    addPart(width * 0.14, height * 0.06, width * 0.66, height * 0.58, 0x2d3b49, 0x6a7d8f, 0.96);
    addPart(width * 0.14, -height * 0.22, width * 0.6, Math.max(4, height * 0.16), 0x7f93a8, 0xd5dde5, 0.9);
    addPart(-width * 0.42, height * 0.34, width * 0.1, Math.max(5, height * 0.35), 0x111820, 0x465b6c, 0.88);
    addPart(width * 0.42, height * 0.34, width * 0.1, Math.max(5, height * 0.35), 0x111820, 0x465b6c, 0.88);
  } else if (kind === "toilet") {
    addPart(0, 3, width * 0.82, height * 0.66, 0xc8d3dc, 0xf0f6fa, 0.98);
    addPart(0, -height * 0.3, width * 0.62, height * 0.34, 0xe9f1f6, 0xffffff, 0.98);
    addPart(0, 4, width * 0.36, height * 0.22, 0x91a8b6, 0xf0f6fa, 0.86);
    addPart(-width * 0.28, height * 0.32, width * 0.14, Math.max(4, height * 0.2), 0x7f93a8, 0xf0f6fa, 0.74);
    addPart(width * 0.28, -height * 0.46, width * 0.1, Math.max(4, height * 0.18), 0x91a8b6, 0xf0f6fa, 0.72);
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit cell fixture silhouettes**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Sharpen cell fixture silhouettes"
```

Expected: commit succeeds.

---

### Task 2: Security Room Silhouettes

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Add a failing security silhouette test**

In `tests/client/renderer.test.ts`, add this test near the other set dressing rendering tests:

```ts
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
  expect(props.find((prop) => prop.id === "security_weapon_rack")?.childCount).toBeGreaterThanOrEqual(5);
  expect(props.find((prop) => prop.id === "security_wall_panel")?.fillColors).toEqual(expect.arrayContaining([0x75e1ff, 0xff5f56]));
  expect(props.find((prop) => prop.id === "security_camera_marker")?.fillColors).toEqual(expect.arrayContaining([0x111820, 0x6bd3ff]));
});
```

- [ ] **Step 2: Run the focused renderer test and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because desk, monitor, and weapon rack currently have too few structural parts.

- [ ] **Step 3: Strengthen security branches**

In `client/src/render/GameRenderer.ts`, inside `createSetDressingSprite()`, replace the `desk`, `monitor`, `weapon_rack`, `control_panel`, and `camera_marker` branches with:

```ts
  } else if (kind === "desk") {
    addPart(0, 0, width, height, 0x4d3f34, 0x9b7459, 0.96);
    addPart(0, -height * 0.24, width * 0.86, Math.max(5, height * 0.18), 0x173142, 0x6bd3ff, 0.88);
    addPart(-width * 0.26, height * 0.2, width * 0.18, height * 0.45, 0x2f2721, 0x7a5b45, 0.98);
    addPart(width * 0.26, height * 0.2, width * 0.18, height * 0.45, 0x2f2721, 0x7a5b45, 0.98);
    addPart(-width * 0.18, -height * 0.3, width * 0.16, Math.max(4, height * 0.16), 0x75e1ff, 0xd7f7ff, 0.82);
    addPart(width * 0.18, -height * 0.3, width * 0.16, Math.max(4, height * 0.16), 0xff5f56, 0xffb3b0, 0.82);
  } else if (kind === "monitor") {
    addPart(0, 0, width, Math.max(10, height), 0x173142, 0x6bd3ff, 0.96);
    addPart(-width * 0.32, 0, width * 0.18, Math.max(6, height * 0.62), 0x75e1ff, 0xd7f7ff, 0.9);
    addPart(-width * 0.08, 0, width * 0.18, Math.max(6, height * 0.62), 0x2bc3ff, 0xd7f7ff, 0.88);
    addPart(width * 0.16, 0, width * 0.18, Math.max(6, height * 0.62), 0x75e1ff, 0xd7f7ff, 0.78);
    addPart(width * 0.38, 0, width * 0.08, Math.max(5, height * 0.55), 0xff5f56, 0xffb3b0, 0.78);
  } else if (kind === "weapon_rack") {
    addPart(0, 0, width, Math.max(8, height), 0x3d4650, 0x8b929a, 0.96);
    addPart(-width * 0.32, -height * 0.1, width * 0.1, height + 18, 0xc7d1db, 0xffd166, 0.96).setRotation(-0.32);
    addPart(0, -height * 0.06, width * 0.1, height + 18, 0xaab5bf, 0xffd166, 0.96).setRotation(0.18);
    addPart(width * 0.28, -height * 0.06, width * 0.1, height + 16, 0x8090a0, 0xffd166, 0.94).setRotation(0.36);
    addPart(-width * 0.08, height * 0.34, width * 0.82, Math.max(4, height * 0.18), 0xffd166, 0xfff0b8, 0.7);
  } else if (kind === "control_panel") {
    addPart(0, 0, width, height, 0x173142, 0x6bd3ff, 0.94);
    addPart(-width * 0.24, -height * 0.1, width * 0.2, height * 0.3, 0x75e1ff, 0xd7f7ff, 0.9);
    addPart(0, -height * 0.1, width * 0.16, height * 0.24, 0x2bc3ff, 0xd7f7ff, 0.88);
    addPart(width * 0.24, -height * 0.1, width * 0.12, height * 0.2, 0x75e1ff, 0xd7f7ff, 0.76);
    addPart(width * 0.28, height * 0.22, width * 0.12, height * 0.12, 0xff5f56, 0xffb3b0, 0.92);
    addPart(-width * 0.28, height * 0.22, width * 0.12, height * 0.12, 0xffd166, 0xfff0b8, 0.86);
  } else if (kind === "camera_marker") {
    addPart(0, 0, width, height, 0x3d4650, 0xd5dde5, 0.94);
    addPart(width * 0.16, 0, width * 0.36, height * 0.54, 0x111820, 0x6bd3ff, 0.96);
    addPart(-width * 0.28, -height * 0.2, width * 0.18, height * 0.2, 0x8b929a, 0xd5dde5, 0.9);
    addPart(-width * 0.36, height * 0.22, width * 0.2, height * 0.2, 0x6bd3ff, 0xd7f7ff, 0.78);
    addPart(width * 0.38, height * 0.18, width * 0.16, height * 0.16, 0xff5f56, 0xffb3b0, 0.7);
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit security silhouettes**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Sharpen security room silhouettes"
```

Expected: commit succeeds.

---

### Task 3: Storage And Route Silhouettes

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Add a failing storage and route silhouette test**

In `tests/client/renderer.test.ts`, add this test near the other set dressing rendering tests:

```ts
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
  expect(props.find((prop) => prop.id === "storage_supply_boxes")?.childCount).toBeGreaterThanOrEqual(6);
  expect(props.find((prop) => prop.id === "storage_bandage_marker")?.fillColors).toEqual(expect.arrayContaining([0xcfffd5, 0x72d18b]));
  expect(props.find((prop) => prop.id === "central_corridor_floor_stripe")?.childCount).toBeGreaterThanOrEqual(5);
  expect(props.find((prop) => prop.id === "east_corridor_signage")?.fillColors).toEqual(expect.arrayContaining([0x173142, 0xffd166]));
  expect(props.find((prop) => prop.id === "exit_floor_chevrons")?.childCount).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 2: Run focused renderer test and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because shelf, boxes, corridor stripe, and exit marker currently have fewer parts than the new silhouette target.

- [ ] **Step 3: Strengthen storage and route branches**

In `client/src/render/GameRenderer.ts`, inside `createSetDressingSprite()`, replace the `supply_shelf`, `supply_boxes`, `corridor_stripe`, `zone_sign`, `supply_marker`, and `exit_marker` branches with:

```ts
  } else if (kind === "supply_shelf") {
    addPart(0, 0, width, height, 0x5f4938, 0xb28b63, 0.92);
    addPart(-width * 0.42, 0, width * 0.08, height * 1.06, 0x2f2721, 0xb28b63, 0.9);
    addPart(width * 0.42, 0, width * 0.08, height * 1.06, 0x2f2721, 0xb28b63, 0.9);
    addPart(0, -height * 0.18, width * 0.82, Math.max(4, height * 0.12), 0x2f2721, 0x9b7459, 0.9);
    addPart(0, height * 0.22, width * 0.82, Math.max(4, height * 0.12), 0x2f2721, 0x9b7459, 0.9);
    addPart(-width * 0.22, -height * 0.28, width * 0.22, height * 0.24, 0xd6a04f, 0xffd166, 0.94);
    addPart(width * 0.18, -height * 0.26, width * 0.28, height * 0.2, 0x566b7f, 0x90a9bf, 0.94);
    addPart(width * 0.04, height * 0.12, width * 0.18, height * 0.18, 0xcfffd5, 0x72d18b, 0.78);
  } else if (kind === "supply_boxes") {
    addPart(-width * 0.22, height * 0.08, width * 0.42, height * 0.62, 0xd6a04f, 0xffd166, 0.94);
    addPart(width * 0.18, -height * 0.08, width * 0.36, height * 0.52, 0xb28b63, 0xffd166, 0.92);
    addPart(width * 0.02, height * 0.24, width * 0.34, height * 0.38, 0x8b5f3c, 0xffd166, 0.88);
    addPart(-width * 0.22, -height * 0.16, width * 0.3, Math.max(4, height * 0.12), 0xffefb0, 0xffd166, 0.78);
    addPart(width * 0.2, -height * 0.28, width * 0.22, Math.max(4, height * 0.1), 0x566b7f, 0x90a9bf, 0.9);
    addPart(width * 0.02, height * 0.04, width * 0.18, Math.max(4, height * 0.1), 0xffefb0, 0xffd166, 0.72);
  } else if (kind === "corridor_stripe") {
    addPart(0, 0, width, height, 0xffd166, 0xfff0b8, 0.28);
    addPart(-width * 0.38, 0, width * 0.1, height * 1.5, 0x6a7d8f, 0xd5dde5, 0.24);
    addPart(-width * 0.12, 0, width * 0.1, height * 1.5, 0x6a7d8f, 0xd5dde5, 0.2);
    addPart(width * 0.14, 0, width * 0.1, height * 1.5, 0x6a7d8f, 0xd5dde5, 0.24);
    addPart(width * 0.4, 0, width * 0.1, height * 1.5, 0x6a7d8f, 0xd5dde5, 0.2);
  } else if (kind === "zone_sign") {
    addPart(0, 0, width, height, 0x173142, 0x6bd3ff, 0.88);
    addPart(-width * 0.28, 0, width * 0.12, height * 0.72, 0x6bd3ff, 0xd7f7ff, 0.82);
    addPart(width * 0.02, 0, width * 0.38, Math.max(4, height * 0.18), 0xffd166, 0xfff0b8, 0.72);
    addPart(width * 0.28, 0, width * 0.1, height * 0.58, 0xff5f56, 0xffb3b0, 0.68);
  } else if (kind === "supply_marker") {
    addPart(0, 0, width, height, 0xcfffd5, 0x72d18b, 0.52);
    addPart(0, 0, width * 0.18, height * 1.5, 0x72d18b, 0xcfffd5, 0.78);
    addPart(0, 0, width * 0.64, height * 0.34, 0x72d18b, 0xcfffd5, 0.78);
    addPart(width * 0.32, 0, width * 0.12, height * 1.12, 0xfff0b8, 0xcfffd5, 0.46);
  } else if (kind === "exit_marker") {
    addPart(-width * 0.28, 0, width * 0.22, height, 0x57d7ff, 0xd7f7ff, 0.58).setRotation(0.42);
    addPart(0, 0, width * 0.22, height, 0x57d7ff, 0xd7f7ff, 0.66).setRotation(0.42);
    addPart(width * 0.28, 0, width * 0.22, height, 0x57d7ff, 0xd7f7ff, 0.58).setRotation(0.42);
    addPart(0, height * 0.42, width * 0.86, Math.max(4, height * 0.12), 0xd7f7ff, 0x57d7ff, 0.34);
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit storage and route silhouettes**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Sharpen storage and route silhouettes"
```

Expected: commit succeeds.

---

### Task 4: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-29-environment-silhouette-pass.md`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect status and recent commits**

Run:

```bash
git status --short
git log --oneline --decorate -8
```

Expected: only this plan file is uncommitted before the plan commit.

- [ ] **Step 4: Commit the implementation plan if still uncommitted**

Run:

```bash
git add docs/superpowers/plans/2026-06-29-environment-silhouette-pass.md
git commit -m "Plan environment silhouette art pass"
```

Expected: commit succeeds.

