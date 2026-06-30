# Cot And Toilet Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify cot and toilet pixel sprites so they read as real object parts first and pixel decoration second.

**Architecture:** Keep this renderer-only. Update `createSetDressingSprite(...)` branches for `cot` and `toilet`, and tighten renderer tests around the required object anatomy and restrained palettes.

**Tech Stack:** TypeScript, Phaser primitive rectangles/containers, Vitest renderer tests.

---

## File Structure

- Modify `client/src/render/GameRenderer.ts`
  - Replace noisy cot chunks with pillow, blanket/mattress, metal frame, rails, legs, and shadow.
  - Replace noisy toilet chunks with tank, bowl/seat, inner basin, base/pipe, and shadow.
- Modify `tests/client/renderer.test.ts`
  - Update object silhouette tests so cot/toilet assertions reward clear parts and reject unrelated orange/noisy chips.

## Task 1: Cot And Toilet Object Anatomy

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Write/update failing renderer test**

In `tests/client/renderer.test.ts`, update `renders cell and room set dressing as irregular pixel object silhouettes` so the cot and toilet expectations are:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts -t "renders cell and room set dressing as irregular pixel object silhouettes"
```

Expected: FAIL because current cot still includes orange blanket/noisy chips and toilet has excess small pieces.

- [ ] **Step 3: Simplify cot and toilet branches**

In `client/src/render/GameRenderer.ts`, inside `createSetDressingSprite(...)`, replace only the `cot` and `toilet` branches.

Cot branch must use these readable parts:

```ts
  } else if (kind === "cot") {
    addPart(0, 0, width * 0.92, height * 0.58, 0x475766, 0x7f93a8, 0.96);
    addPart(-width * 0.25, -height * 0.06, width * 0.3, height * 0.34, 0xd7f7ff, 0xf8fbff, 0.94);
    addPart(width * 0.16, height * 0.02, width * 0.46, height * 0.34, 0x2d3b49, 0x7f93a8, 0.94);
    addPart(0, -height * 0.36, width * 0.84, Math.max(3, height * 0.08), 0x172231, 0x7f93a8, 0.9);
    addPart(0, height * 0.36, width * 0.84, Math.max(3, height * 0.08), 0x172231, 0x7f93a8, 0.9);
    for (const xOffset of [-0.42, 0.42]) {
      addPart(width * xOffset, 0, width * 0.08, height * 0.62, 0x172231, 0x7f93a8, 0.9);
      addPart(width * xOffset, height * 0.42, width * 0.1, height * 0.18, 0x101820, 0x293341, 0.68);
    }
    addPart(0, height * 0.48, width * 0.76, Math.max(3, height * 0.1), 0x101820, 0x293341, 0.42);
```

Toilet branch must use these readable parts:

```ts
  } else if (kind === "toilet") {
    addPart(0, -height * 0.3, width * 0.58, height * 0.32, 0xc8d3dc, 0xf0f6fa, 0.96);
    addPart(0, height * 0.08, width * 0.76, height * 0.44, 0xf0f6fa, 0xc8d3dc, 0.96);
    addPart(0, height * 0.08, width * 0.42, height * 0.18, 0x6a7d8f, 0xd7f7ff, 0.72);
    addPart(0, height * 0.34, width * 0.44, height * 0.24, 0xc8d3dc, 0xf0f6fa, 0.9);
    addPart(width * 0.32, -height * 0.42, width * 0.14, height * 0.24, 0x9aa7b4, 0xd7f7ff, 0.82);
    addPart(-width * 0.28, height * 0.38, width * 0.16, height * 0.18, 0x44515f, 0x9aa7b4, 0.78);
    addPart(0, height * 0.52, width * 0.6, Math.max(3, height * 0.1), 0x101820, 0x293341, 0.42);
```

- [ ] **Step 4: Verify focused and full renderer tests**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts -t "renders cell and room set dressing as irregular pixel object silhouettes"
npm test -- --run tests/client/renderer.test.ts
npm run typecheck
```

Expected: focused test, full renderer tests, and typecheck pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Clarify cot and toilet pixel silhouettes"
```

## Task 2: Full Verification And Browser Check

**Files:**
- No expected edits unless visual tuning is needed.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test -- --run
npm run typecheck
```

Expected: all tests pass and typecheck exits 0.

- [ ] **Step 2: Browser inspection**

Reload `http://127.0.0.1:5173/` and inspect the cell area.

Verify:

- Cot reads as pillow, blanket/mattress, and metal frame.
- Toilet reads as tank, bowl/seat, basin, base/pipe.
- Cot no longer has unrelated orange dots/chips.
- Toilet no longer reads as blurry circles.

- [ ] **Step 3: Commit tuning if needed**

If the browser check shows remaining clarity issues, make renderer-only tuning changes, then run:

```bash
npm test -- --run tests/client/renderer.test.ts
npm run typecheck
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Tune cot and toilet readability"
```
