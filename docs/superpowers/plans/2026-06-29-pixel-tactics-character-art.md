# Pixel Tactics Character Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade character visuals so prisoners are orange-jumpsuit animal variants and basic guards are dog guards in blue uniforms.

**Architecture:** Keep the current Phaser shape-based renderer. Extend render descriptors with reusable character visual data, then render player, guards, and prisoner set-dressing through character sprite helpers instead of plain rectangles.

**Tech Stack:** TypeScript, Phaser, Vitest.

---

## File Structure

- Modify `client/src/render/GameRenderer.ts`: extend `CharacterVisualDescriptor`, add deterministic prisoner species selection, change player/guard colors and species, add NPC prisoner sprite rendering for set-dressing objects.
- Modify `tests/client/renderer.test.ts`: update existing visual expectations and add coverage for NPC prisoner character visuals.
- No simulation or map behavior changes are required.

---

### Task 1: Update Character Descriptor Tests

**Files:**
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Write failing expectations for player, guards, and prisoner dressing**

In `tests/client/renderer.test.ts`, update the first descriptor test so the player expects an orange prisoner uniform, guards expect dog/blue uniforms, and prisoner dressing expects visual data.

Replace the player visual expectation block with:

```ts
visual: expect.objectContaining({
  artStyle: "pixel_tactics",
  variant: "readable_hybrid",
  species: "raccoon",
  role: "prisoner",
  uniformColor: 0xf28c38,
  playerHighlight: true,
}),
```

Replace the guard visual expectation block for `guard-1` with:

```ts
visual: expect.objectContaining({
  artStyle: "pixel_tactics",
  variant: "readable_hybrid",
  species: "dog",
  role: "guard",
  uniformColor: 0x234f86,
}),
```

Replace the `setDressingObjects` expectation with:

```ts
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
```

- [ ] **Step 2: Add deterministic NPC species assertions**

Add this test after the stable descriptor test:

```ts
it("assigns deterministic animal variants to NPC prisoner dressing", () => {
  const descriptors = new GameRenderer().describe(new GameSimulation().getSnapshot());

  const prisoners = descriptors.setDressingObjects.filter((object) => object.kind === "prisoner");

  expect(prisoners.map((object) => object.visual?.species)).toEqual(["cat", "possum"]);
  expect(prisoners.every((object) => object.visual?.uniformColor === 0xf28c38)).toBe(true);
  expect(prisoners.every((object) => object.visual?.role === "prisoner")).toBe(true);
});
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because `CharacterVisualDescriptor` does not yet allow `dog`, `cat`, or `possum`, does not expose `playerHighlight`, and `setDressingObjects` has no `visual` property.

---

### Task 2: Extend Character Visual Descriptors

**Files:**
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Update descriptor types**

In `client/src/render/GameRenderer.ts`, replace `CharacterVisualDescriptor` with:

```ts
export type CharacterSpecies = "raccoon" | "dog" | "cat" | "possum";

export type CharacterVisualDescriptor = {
  artStyle: "pixel_tactics";
  variant: "readable_hybrid";
  species: CharacterSpecies;
  role: "prisoner" | "guard";
  uniformColor: number;
  accentColor: number;
  outlineColor: number;
  playerHighlight: boolean;
};
```

Replace the `setDressingObjects` field in `RenderDescriptors` with:

```ts
setDressingObjects: Array<{
  id: string;
  kind: SetDressingKind;
  x: number;
  y: number;
  width: number;
  height: number;
  visual: CharacterVisualDescriptor | null;
}>;
```

- [ ] **Step 2: Update player and guard visual factories**

Replace `playerVisual()` with:

```ts
function playerVisual(): CharacterVisualDescriptor {
  return {
    artStyle: "pixel_tactics",
    variant: "readable_hybrid",
    species: "raccoon",
    role: "prisoner",
    uniformColor: 0xf28c38,
    accentColor: 0xffd166,
    outlineColor: 0x0b1118,
    playerHighlight: true,
  };
}
```

Replace `guardVisual()` with:

```ts
function guardVisual(): CharacterVisualDescriptor {
  return {
    artStyle: "pixel_tactics",
    variant: "readable_hybrid",
    species: "dog",
    role: "guard",
    uniformColor: 0x234f86,
    accentColor: 0xc7d1db,
    outlineColor: 0x101820,
    playerHighlight: false,
  };
}
```

- [ ] **Step 3: Add NPC prisoner visual helpers**

Add these helpers near `playerVisual()` and `guardVisual()`:

```ts
const npcPrisonerSpecies: CharacterSpecies[] = ["raccoon", "cat", "possum"];

function stableSpeciesIndex(id: string): number {
  return [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % npcPrisonerSpecies.length;
}

function npcPrisonerVisual(id: string): CharacterVisualDescriptor {
  return {
    artStyle: "pixel_tactics",
    variant: "readable_hybrid",
    species: npcPrisonerSpecies[stableSpeciesIndex(id)],
    role: "prisoner",
    uniformColor: 0xf28c38,
    accentColor: 0xffd166,
    outlineColor: 0x0b1118,
    playerHighlight: false,
  };
}
```

- [ ] **Step 4: Attach visuals to set-dressing descriptors**

In `describe()`, update the `setDressingObjects` map result to include:

```ts
visual: object.kind === "prisoner" ? npcPrisonerVisual(object.id) : null,
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: descriptor assertions pass or fail only because rendering still treats prisoner dressing as rectangles.

---

### Task 3: Render NPC Prisoners As Character Sprites

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Split set-dressing render object storage**

In `RenderObjects`, replace:

```ts
setDressingObjects: Map<string, Phaser.GameObjects.Rectangle>;
```

with:

```ts
setDressingObjects: Map<string, Phaser.GameObjects.Rectangle | Phaser.GameObjects.Container>;
```

- [ ] **Step 2: Add reusable prisoner sprite species details**

Update `createPlayerSprite()` so it uses `visual.uniformColor` for the jumpsuit and species-specific parts. Keep the existing raccoon mask and tail, and add branches for cat and possum:

```ts
const hasMask = visual.species === "raccoon";
const skinColor = visual.species === "possum" ? 0xb8aeb6 : visual.species === "cat" ? 0xb9946b : 0x8d9bab;
const tailColor = visual.species === "possum" ? 0xd2b7c0 : visual.species === "cat" ? 0x9b7654 : 0x6f7d8d;
```

Use `skinColor` for head, ears, and arms. Use `tailColor` for the tail. Only add the mask rectangle when `hasMask` is true. Keep the snout and eyes for all species.

- [ ] **Step 3: Render prisoner dressing as scaled sprites**

In the `for (const object of descriptors.setDressingObjects)` loop, branch on `object.visual`.

Use this shape:

```ts
if (object.visual) {
  const existing = objects.setDressingObjects.get(object.id);
  const container =
    existing && "list" in existing
      ? existing
      : createPlayerSprite(scene, object.visual);
  container.setPosition(object.x, object.y);
  container.setScale(0.48);
  container.setDepth(5);
  objects.setDressingObjects.set(object.id, container);
  continue;
}
```

Keep the existing rectangle path for non-character dressing objects.

- [ ] **Step 4: Add a renderer smoke test for character dressing containers**

Add this test to `tests/client/renderer.test.ts`:

```ts
it("creates character containers for prisoner dressing instead of flat rectangles", () => {
  const renderer = new GameRenderer();
  const createdContainers: unknown[] = [];
  const rectangle = {
    setOrigin: () => rectangle,
    setPosition: () => rectangle,
    setSize: () => rectangle,
    setFillStyle: () => rectangle,
    setStrokeStyle: () => rectangle,
    setDepth: () => rectangle,
  };
  const scene = {
    add: {
      rectangle: () => rectangle,
      ellipse: () => rectangle,
      container: (_x: number, _y: number, children: unknown[]) => {
        const container = {
          list: children,
          setPosition: () => container,
          setScale: () => container,
          setDepth: () => container,
        };
        createdContainers.push(container);
        return container;
      },
      circle: () => rectangle,
      star: () => rectangle,
      graphics: () => ({
        clear: () => undefined,
        fillStyle: () => undefined,
        slice: () => undefined,
        fillPath: () => undefined,
      }),
    },
    cameras: { main: { setBounds: () => undefined, centerOn: () => undefined } },
  };

  renderer.render(scene as never, new GameSimulation().getSnapshot());

  expect(createdContainers.length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

---

### Task 4: Final Verification And Commit

**Files:**
- Modify: `client/src/render/GameRenderer.ts`
- Modify: `tests/client/renderer.test.ts`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 2: Inspect git diff**

Run:

```bash
git diff -- client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git status --short
```

Expected: only `client/src/render/GameRenderer.ts`, `tests/client/renderer.test.ts`, and this plan file are modified, plus any existing untracked local `.superpowers/` scratch files.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts docs/superpowers/plans/2026-06-29-pixel-tactics-character-art.md
git commit -m "Refine pixel tactics character art"
```

Expected: commit succeeds.

---

## Self-Review Notes

- Spec coverage: player raccoon prisoner, random animal NPC prisoners, dog guards, orange prisoner uniforms, blue guard uniforms, and shape-based Phaser rendering are each covered by a task.
- Scope check: this plan does not introduce sprite sheets, animations, new gameplay, or new guard types.
- Type consistency: `CharacterSpecies`, `CharacterVisualDescriptor`, and `setDressingObjects.visual` are introduced before use.
