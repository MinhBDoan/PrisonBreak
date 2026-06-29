# Playfield Readability Art Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve at-a-glance playfield readability by reducing HUD obstruction and strengthening large room/floor hierarchy without changing gameplay.

**Architecture:** Keep the current Phaser primitive renderer and HUD DOM structure. Refine `addRoomDetails()` and tile/floor accent rendering in `GameRenderer.ts`, then tune HUD opacity/spacing in `styles.css` with tests that preserve existing HUD text and verify lighter visual weight.

**Tech Stack:** TypeScript, Phaser, Vitest, CSS.

---

## File Structure

- Modify `client/src/render/GameRenderer.ts`: strengthen large room bands, cell interiors, corridor trim, and room boundary cues through primitive rectangles/circles only.
- Modify `tests/client/renderer.test.ts`: extend room-detail mount tests to verify stronger boundary colors and lower-depth readable room accents.
- Modify `client/src/styles.css`: reduce HUD panel/equipment opacity and footprint slightly while preserving current layout and text.
- Modify `tests/client/hud.test.ts`: add a CSS contract test that checks the HUD keeps required selectors and uses lighter overlay values.
- Do not modify gameplay files or map data.

---

### Task 1: Strengthen Room Boundary Hierarchy

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Add failing room hierarchy expectations**

In `tests/client/renderer.test.ts`, in the existing `mounts room identity details over the base tile map` test, add these expectations after the existing storage/security/cell background checks:

```ts
    expect(rectangles.some((rect) => rect.fillColor === 0x101923 && rect.alpha === 0.82)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x314352 && rect.alpha === 0.38)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x3a2f25 && rect.alpha === 0.36)).toBe(true);
    expect(rectangles.some((rect) => rect.fillColor === 0x0e2a3a && rect.alpha === 0.34)).toBe(true);
```

- [ ] **Step 2: Run focused renderer test and verify failure**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because these stronger room-boundary colors are not mounted yet.

- [ ] **Step 3: Add stronger large-scale room accents**

In `client/src/render/GameRenderer.ts`, inside `addRoomDetails()`, immediately after the existing first four room background `addRect(...)` calls, add:

```ts
  addRect(5, 2.48, 8.35, 2.98, 0x101923, 0.82, 0, 0x6a7d8f);
  addRect(5, 3.86, 8.35, 0.18, 0x314352, 0.38, 2);
  addRect(14.9, 7.34, 4.25, 2.75, 0x3a2f25, 0.36, 0, 0xb28b63);
  addRect(20.75, 2.5, 7.55, 3.15, 0x0e2a3a, 0.34, 0, 0x6bd3ff);
```

These are broad low-depth bands: cell darkness, cell front trim, warm storage field, cool security field.

- [ ] **Step 4: Run focused renderer test**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit room hierarchy**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Strengthen playfield room hierarchy"
```

Expected: commit succeeds.

---

### Task 2: Reduce HUD Overlay Weight

**Files:**
- Modify: `client/src/styles.css`
- Modify: `tests/client/hud.test.ts`

- [ ] **Step 1: Add failing CSS contract test for lighter HUD overlay**

In `tests/client/hud.test.ts`, add this import at the top:

```ts
import { readFileSync } from "node:fs";
```

Then add this test at the end of the `describe("createHudModel", ...)` block:

```ts
  it("keeps HUD information while reducing overlay weight over the playfield", () => {
    const css = readFileSync("client/src/styles.css", "utf8");
    const root = {
      innerHTML: "",
      classList: { add() {} },
    } as HTMLElement;

    new Hud(root).update(new GameSimulation().getSnapshot());

    expect(root.innerHTML).toContain("Find the master key");
    expect(root.innerHTML).toContain('aria-label="Equipment"');
    expect(css).toContain("background: rgba(7, 15, 23, 0.56);");
    expect(css).toContain("background: rgba(7, 15, 23, 0.6);");
    expect(css).toContain("padding: 13px 15px;");
    expect(css).toContain("bottom: 16px;");
  });
```

- [ ] **Step 2: Run focused HUD test and verify failure**

Run:

```bash
npm test -- --run tests/client/hud.test.ts
```

Expected: FAIL because the current CSS uses heavier opacity and larger panel spacing.

- [ ] **Step 3: Tune HUD panel and equipment styling**

In `client/src/styles.css`, update `.hud__panel`:

Replace:

```css
  padding: 16px 18px;
  border: 1px solid rgba(155, 190, 215, 0.22);
  border-radius: 16px;
  background: rgba(7, 15, 23, 0.68);
  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(10px);
```

with:

```css
  padding: 13px 15px;
  border: 1px solid rgba(155, 190, 215, 0.18);
  border-radius: 12px;
  background: rgba(7, 15, 23, 0.56);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(6px);
```

In `.hud__equipment`, replace:

```css
  bottom: 22px;
  gap: 8px;
  width: min(760px, calc(100vw - 32px));
  padding: 8px;
  border: 1px solid rgba(155, 190, 215, 0.2);
  border-radius: 14px;
  background: rgba(7, 15, 23, 0.72);
  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(10px);
```

with:

```css
  bottom: 16px;
  gap: 7px;
  width: min(720px, calc(100vw - 28px));
  padding: 7px;
  border: 1px solid rgba(155, 190, 215, 0.17);
  border-radius: 12px;
  background: rgba(7, 15, 23, 0.6);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(6px);
```

- [ ] **Step 4: Run focused HUD tests**

Run:

```bash
npm test -- --run tests/client/hud.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit HUD readability**

Run:

```bash
git add client/src/styles.css tests/client/hud.test.ts
git commit -m "Reduce HUD playfield obstruction"
```

Expected: commit succeeds.

---

### Task 3: Final Verification And Browser Check

**Files:**
- Modify: `docs/superpowers/plans/2026-06-29-playfield-readability-art-pass.md`

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

- [ ] **Step 3: Inspect status**

Run:

```bash
git status --short
git log --oneline --decorate -8
```

Expected: only this plan file is uncommitted before the plan commit.

- [ ] **Step 4: Commit plan if still uncommitted**

Run:

```bash
git add docs/superpowers/plans/2026-06-29-playfield-readability-art-pass.md
git commit -m "Plan playfield readability art pass"
```

Expected: commit succeeds.

- [ ] **Step 5: Browser visual check**

With the existing Vite client and service running, reload `http://127.0.0.1:5173`, start a run, and capture a screenshot.

Expected visual result:

- HUD panels are still readable but less visually heavy.
- Cell block has clearer dark cell interior and front trim.
- Storage reads warmer than nearby corridors.
- Security reads cooler than storage.
- Characters, interactables, and guard vision cones remain higher priority than background bands.

