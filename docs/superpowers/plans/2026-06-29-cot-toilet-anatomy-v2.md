# Cot Toilet Anatomy V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cot and toilet props read as recognizable real objects by clarifying their major parts before adding more pixel decoration.

**Architecture:** This is a renderer-only art pass. `GameRenderer.ts` already creates set-dressing sprites as layered pixel rectangles; this pass keeps that path and changes only the cot/toilet part geometry and tests.

**Tech Stack:** TypeScript, Phaser display objects, Vitest renderer/unit tests.

---

## File Structure

- Modify: `client/src/render/GameRenderer.ts`
  - Refine `createSetDressingSprite(...)` for `kind === "cot"` and `kind === "toilet"`.
  - Cot should expose pillow, blanket/mattress, metal rails, legs, and shadow as separate readable parts.
  - Toilet should expose rear tank, front seat/bowl, dark basin, base/pipe, and shadow as separate readable parts.
- Modify: `client/src/render/GameRenderer.test.ts`
  - Strengthen the existing set-dressing tests so they assert anatomy, not only color presence.

---

### Task 1: Cot And Toilet Anatomy Tests

**Files:**
- Modify: `client/src/render/GameRenderer.test.ts`

- [ ] **Step 1: Write failing anatomy assertions**

In the existing `renders cell and room set dressing as irregular pixel object silhouettes` test, keep the broad color checks and add geometry checks like this near the current cot/toilet assertions:

```ts
const pillow = cotParts.find((part) => part.fillColor === 0xd7f7ff);
const bedding = cotParts.find((part) => part.fillColor === 0x2d3b49);
const cotFrameParts = cotParts.filter((part) => part.fillColor === 0x172231);
const cotLegParts = cotParts.filter((part) => part.fillColor === 0x101820);
expect(pillow).toBeDefined();
expect(bedding).toBeDefined();
expect(pillow!.width).toBeGreaterThan(pillow!.height);
expect(pillow!.width).toBeGreaterThanOrEqual(cotBackground.width * 0.34);
expect(pillow!.x).toBeLessThan(0);
expect(bedding!.width).toBeGreaterThan(pillow!.width);
expect(bedding!.x).toBeGreaterThan(pillow!.x);
expect(cotFrameParts.length).toBeGreaterThanOrEqual(4);
expect(cotLegParts.length).toBeGreaterThanOrEqual(2);

const toiletTank = toiletParts.find((part) => part.fillColor === 0xc8d3dc && part.y < 0);
const toiletBowl = toiletParts.find((part) => part.fillColor === 0xf0f6fa && part.y >= 0);
const toiletBasin = toiletParts.find((part) => part.fillColor === 0x6a7d8f);
const toiletBase = toiletParts.find((part) => part.fillColor === 0xc8d3dc && part.y > 0);
const toiletPipe = toiletParts.find((part) => part.fillColor === 0x44515f);
expect(toiletTank).toBeDefined();
expect(toiletBowl).toBeDefined();
expect(toiletBasin).toBeDefined();
expect(toiletBase).toBeDefined();
expect(toiletPipe).toBeDefined();
expect(toiletTank!.width).toBeGreaterThan(toiletTank!.height);
expect(toiletBowl!.width).toBeGreaterThan(toiletBowl!.height);
expect(toiletBasin!.width).toBeGreaterThan(toiletBasin!.height);
expect(toiletBase!.y).toBeGreaterThan(toiletBowl!.y);
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
npm test -- client/src/render/GameRenderer.test.ts -t "renders cell and room set dressing as irregular pixel object silhouettes"
```

Expected: FAIL because the current cot pillow is narrower than the new readability threshold and cot/toilet anatomy checks are stricter than the existing pass.

- [ ] **Step 3: Commit the failing tests**

```bash
git add client/src/render/GameRenderer.test.ts
git commit -m "test: specify cot and toilet anatomy readability"
```

---

### Task 2: Cot And Toilet Anatomy Renderer

**Files:**
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Refine cot parts**

Replace the cot branch inside `createSetDressingSprite(...)` with this anatomy-first version:

```ts
  } else if (kind === "cot") {
    addPart(0, 0, width * 0.94, height * 0.58, 0x475766, 0x7f93a8, 0.96);
    addPart(-width * 0.28, -height * 0.04, width * 0.36, height * 0.36, 0xd7f7ff, 0xf8fbff, 0.95);
    addPart(width * 0.16, height * 0.02, width * 0.52, height * 0.38, 0x2d3b49, 0x7f93a8, 0.95);
    addPart(0, -height * 0.42, width * 0.96, Math.max(3, height * 0.08), 0x172231, 0x7f93a8, 0.92);
    addPart(0, height * 0.42, width * 0.96, Math.max(3, height * 0.08), 0x172231, 0x7f93a8, 0.92);
    for (const xOffset of [-0.48, 0.48]) {
      addPart(width * xOffset, 0, width * 0.07, height * 0.68, 0x172231, 0x7f93a8, 0.92);
    }
    for (const xOffset of [-0.4, 0.4]) {
      addPart(width * xOffset, height * 0.46, width * 0.1, height * 0.22, 0x101820, 0x293341, 0.72);
    }
    addPart(0, height * 0.52, width * 0.78, Math.max(3, height * 0.1), 0x101820, 0x293341, 0.42);
```

- [ ] **Step 2: Refine toilet parts**

Replace the toilet branch inside `createSetDressingSprite(...)` with this anatomy-first version:

```ts
  } else if (kind === "toilet") {
    addPart(0, -height * 0.36, width * 0.64, height * 0.28, 0xc8d3dc, 0xf0f6fa, 0.97);
    addPart(0, height * 0.08, width * 0.76, height * 0.38, 0xf0f6fa, 0xc8d3dc, 0.97);
    addPart(0, height * 0.08, width * 0.48, height * 0.18, 0x6a7d8f, 0xd7f7ff, 0.74);
    addPart(0, height * 0.38, width * 0.42, height * 0.22, 0xc8d3dc, 0xf0f6fa, 0.92);
    addPart(width * 0.34, -height * 0.42, width * 0.12, height * 0.24, 0x9aa7b4, 0xd7f7ff, 0.82);
    addPart(-width * 0.28, height * 0.42, width * 0.16, height * 0.18, 0x44515f, 0x9aa7b4, 0.78);
    addPart(0, height * 0.54, width * 0.6, Math.max(3, height * 0.1), 0x101820, 0x293341, 0.42);
```

- [ ] **Step 3: Run targeted renderer test**

```bash
npm test -- client/src/render/GameRenderer.test.ts -t "renders cell and room set dressing as irregular pixel object silhouettes"
```

Expected: PASS.

- [ ] **Step 4: Run full verification**

```bash
npm test
npm run typecheck
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit implementation**

```bash
git add client/src/render/GameRenderer.ts client/src/render/GameRenderer.test.ts
git commit -m "refine cot and toilet pixel anatomy"
```
