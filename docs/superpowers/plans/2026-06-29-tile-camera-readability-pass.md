# Tile And Camera Readability Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the base floor/wall layer so the prison reads less like a uniform grid and more like structured prison space.

**Architecture:** Keep camera behavior unchanged because `GameRenderer.followCamera()` already centers on the player every frame and is low-risk for playability. Refine `GameRenderer.mount()` and `addRoomDetails()` with quieter floor scuffs, stronger wall edge colors, and corridor lane/trim accents, then verify visually in the browser.

**Tech Stack:** TypeScript, Phaser, Vitest.

---

## File Structure

- Modify `client/src/render/GameRenderer.ts`: tune tile base colors, wall edge colors, floor scuff alpha, and add low-depth corridor lane/trim accents.
- Modify `tests/client/renderer.test.ts`: extend existing mount tests to verify the new wall/floor/corridor colors.
- Do not modify `client/src/scenes/GameScene.ts`; camera follow already centers on the player, and this pass should avoid camera risk.
- Do not modify map, collision, patrols, pickups, doors, objectives, combat, or level data.

---

### Task 1: Tune Base Floor And Wall Tiles

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Add failing expectations for base tile readability colors**

In `tests/client/renderer.test.ts`, in the existing `mounts room identity details over the base tile map` test, add these expectations near the existing base tile color checks:

```ts
    expect(rectangles.some((rect) => rect.fillColor === 0x0d141c)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x23313d)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x6a7d8f && rect.alpha === 0.5)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x05090e && rect.alpha === 0.48)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x2a3642 && rect.alpha === 0.24)).toBe(true);
```

- [ ] **Step 2: Run focused renderer test and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because the current base wall/floor/scuff colors are still the older values.

- [ ] **Step 3: Update base tile colors and scuff weight**

In `client/src/render/GameRenderer.ts`, in `mount()`, replace:

```ts
            isWall ? 0x111820 : 0x263341,
```

with:

```ts
            isWall ? 0x0d141c : 0x23313d,
```

Replace:

```ts
          .setStrokeStyle(1, isWall ? 0x334151 : 0x34495c, isWall ? 0.75 : 0.25);
```

with:

```ts
          .setStrokeStyle(1, isWall ? 0x405568 : 0x314252, isWall ? 0.78 : 0.18);
```

Replace the wall top highlight color/alpha:

```ts
.rectangle(tileCenterX, world(y + 0.16), renderScale, world(0.14), 0x526171, 0.52)
```

with:

```ts
.rectangle(tileCenterX, world(y + 0.16), renderScale, world(0.14), 0x6a7d8f, 0.5)
```

Replace the wall lower face color/alpha:

```ts
.rectangle(tileCenterX, world(y + 0.92), renderScale, world(0.16), 0x071018, 0.42)
```

with:

```ts
.rectangle(tileCenterX, world(y + 0.92), renderScale, world(0.16), 0x05090e, 0.48)
```

Replace floor scuff color/alpha:

```ts
                  0x2d3a47,
                  0.34,
```

with:

```ts
                  0x2a3642,
                  0.24,
```

- [ ] **Step 4: Run focused renderer tests**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit base tile readability**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Tune base tile readability"
```

Expected: commit succeeds.

---

### Task 2: Add Corridor Lane And Wall Trim Accents

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Add failing corridor lane expectations**

In `tests/client/renderer.test.ts`, in `mounts room identity details over the base tile map`, add:

```ts
    expect(rectangles.some((rect) => rect.fillColor === 0x425566 && rect.alpha === 0.3)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0xffd166 && rect.alpha === 0.2)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x0b1118 && rect.alpha === 0.5)).toBe(true);
```

- [ ] **Step 2: Run focused renderer test and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because corridor lane/trim accents are not mounted yet.

- [ ] **Step 3: Add corridor lane and trim accents**

In `client/src/render/GameRenderer.ts`, inside `addRoomDetails()`, after the existing loops that add corridor grid strips:

```ts
  for (const x of [2.5, 5.35, 7.8, 10.5, 13.5, 16.5, 19.5, 22.5]) {
    addRect(x, 9.02, 0.05, 1.85, 0x465b6c, 0.24, 0);
  }
  for (const y of [5.02, 6.98, 8.98]) {
    addRect(16.5, y, 15.0, 0.05, 0x465b6c, 0.22, 0);
  }
```

add:

```ts
  for (const y of [4.5, 6.5, 8.5]) {
    addRect(16.5, y, 15.0, 0.06, 0x425566, 0.3, 1);
  }
  for (const x of [10.5, 14.5, 18.5, 22.5]) {
    addRect(x, 5.5, 0.72, 0.05, 0xffd166, 0.2, 1);
    addRect(x, 9.5, 0.72, 0.05, 0xffd166, 0.18, 1);
  }
  addRect(9.0, 4.02, 16.0, 0.08, 0x0b1118, 0.5, 2);
  addRect(17.0, 4.02, 0.08, 7.0, 0x0b1118, 0.42, 2);
```

- [ ] **Step 4: Run focused renderer tests**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit corridor accents**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Add corridor lane readability accents"
```

Expected: commit succeeds.

---

### Task 3: Final Verification And Browser Check

**Files:**
- Modify: `docs/superpowers/plans/2026-06-29-tile-camera-readability-pass.md`

- [ ] **Step 1: Run full tests**

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

- [ ] **Step 4: Commit plan if still uncommitted**

Run:

```bash
git add docs/superpowers/plans/2026-06-29-tile-camera-readability-pass.md
git commit -m "Plan tile and camera readability pass"
```

Expected: commit succeeds.

- [ ] **Step 5: Browser visual check**

Reload `http://127.0.0.1:5173`, start a run, and capture a screenshot.

Expected visual result:

- Floor grid is quieter and less dominant.
- Walls read as more solid through brighter top edges and darker lower faces.
- Corridors have clearer directional lane rhythm.
- The opening player-centered view still works, with no camera behavior changes.
- Characters, interactables, and guard vision cones remain visually dominant over base tile accents.

