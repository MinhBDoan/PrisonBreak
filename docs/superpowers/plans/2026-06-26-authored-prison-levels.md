# Authored Prison Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current prototype map into Level 1 of an authored prison campaign and prepare the game to load future prison sections one level at a time.

**Architecture:** Keep the current `PrisonMap` shape as the runtime map contract, then wrap maps in a small `PrisonLevel` metadata layer. The simulation should default to Level 1, expose level metadata in snapshots, and complete Level 1 as a transition to the next prison section rather than the whole escape.

**Tech Stack:** TypeScript, Vite, Phaser renderer, Vitest.

---

### Task 1: Add Level Metadata Types

**Files:**
- Modify: `client/src/game/types.ts`
- Test: `tests/client/simulation.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test near the existing map structure tests in `tests/client/simulation.test.ts`:

```ts
it("exposes the active authored level in the snapshot", () => {
  const simulation = new GameSimulation();
  const snapshot = simulation.getSnapshot();

  expect(snapshot.level).toEqual({
    id: "cell_block",
    name: "Cell Block",
    section: "Cell Block to Security Room",
    nextLevelId: "security_wing",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/client/simulation.test.ts
```

Expected: FAIL because `snapshot.level` does not exist.

- [ ] **Step 3: Add the types**

In `client/src/game/types.ts`, add these definitions near `PrisonMap`:

```ts
export type PrisonLevelId = "cell_block" | "security_wing" | "cafeteria_riot" | "maintenance" | "outer_gate";

export type PrisonLevel = {
  id: PrisonLevelId;
  name: string;
  section: string;
  nextLevelId: PrisonLevelId | null;
  map: PrisonMap;
};
```

Update `SimulationSnapshot`:

```ts
level: {
  id: PrisonLevelId;
  name: string;
  section: string;
  nextLevelId: PrisonLevelId | null;
};
```

- [ ] **Step 4: Run test to verify it still fails for implementation, not types**

Run:

```bash
npm test -- tests/client/simulation.test.ts
```

Expected: FAIL because `GameSimulation.getSnapshot()` does not return `level` yet.

---

### Task 2: Create the Level Registry

**Files:**
- Create: `client/src/game/levels.ts`
- Modify: `client/src/game/map.ts`
- Modify: `client/src/game/GameSimulation.ts`
- Test: `tests/client/simulation.test.ts`

- [ ] **Step 1: Create the level registry**

Create `client/src/game/levels.ts`:

```ts
import { prisonMap } from "./map";
import type { PrisonLevel, PrisonLevelId } from "./types";

export const prisonLevels: PrisonLevel[] = [
  {
    id: "cell_block",
    name: "Cell Block",
    section: "Cell Block to Security Room",
    nextLevelId: "security_wing",
    map: prisonMap,
  },
];

export const defaultLevelId: PrisonLevelId = "cell_block";

export function levelById(levelId: PrisonLevelId = defaultLevelId): PrisonLevel {
  const level = prisonLevels.find((candidate) => candidate.id === levelId);
  if (!level) {
    throw new Error(`Unknown prison level: ${levelId}`);
  }
  return level;
}
```

- [ ] **Step 2: Add simulation option for active level**

In `client/src/game/types.ts`, update `SimulationOptions`:

```ts
export type SimulationOptions = {
  nextRunConfig?: { adaptations: ActiveAdaptation[] };
  guardOverrides?: GuardOverride[];
  levelId?: PrisonLevelId;
};
```

- [ ] **Step 3: Load the level in the simulation**

In `client/src/game/GameSimulation.ts`, replace the direct `prisonMap` assignment with `levelById`.

Add imports:

```ts
import { levelById } from "./levels";
import type { PrisonLevel } from "./types";
```

Add a class field:

```ts
private readonly level: PrisonLevel;
```

Update the constructor:

```ts
this.level = levelById(options.levelId);
this.map = this.level.map;
```

Remove the old constructor line:

```ts
this.map = prisonMap;
```

- [ ] **Step 4: Expose level metadata in snapshots**

In `GameSimulation.getSnapshot()`, add:

```ts
level: {
  id: this.level.id,
  name: this.level.name,
  section: this.level.section,
  nextLevelId: this.level.nextLevelId,
},
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/client/simulation.test.ts
```

Expected: PASS.

---

### Task 3: Rename Current Map Identity to Level 1

**Files:**
- Modify: `client/src/game/map.ts`
- Test: `tests/client/simulation.test.ts`

- [ ] **Step 1: Write the failing layout identity test**

Add this test near the existing map structure tests:

```ts
it("frames level one as a cell block route into the security room", () => {
  expect(prisonMap.corridors).toHaveProperty("cell_block");
  expect(prisonMap.corridors).toHaveProperty("security_room");
  expect(prisonMap.key.id).toBe("master_key");
  expect(prisonMap.doors.some((door) => door.id === "security_room_door" && door.locked)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/client/simulation.test.ts
```

Expected: FAIL because the current corridor id is `west_corridor`, not `cell_block`.

- [ ] **Step 3: Update corridor naming without changing gameplay**

In `client/src/game/types.ts`, update `CorridorId` to include `cell_block` and remove `west_corridor` if no test or map still references it.

In `client/src/game/map.ts`, rename:

```ts
west_corridor: { minX: 1, maxX: 8, minY: 1, maxY: 10 },
```

to:

```ts
cell_block: { minX: 1, maxX: 8, minY: 1, maxY: 10 },
```

If any patrol point references `"west_corridor"`, change it to `"cell_block"`.

- [ ] **Step 4: Run tests to catch stale corridor references**

Run:

```bash
npm test -- tests/client/simulation.test.ts tests/client/combat-integration.test.ts
```

Expected: PASS.

---

### Task 4: Show Level Identity in the HUD

**Files:**
- Modify: `client/src/ui/Hud.ts`
- Test: `tests/client/hud.test.ts`

- [ ] **Step 1: Write the failing HUD test**

Add this test in `tests/client/hud.test.ts`:

```ts
it("shows the active prison level name", () => {
  const model = createHudModel(new GameSimulation().getSnapshot());

  expect(model.levelLabel).toBe("Cell Block");
  expect(model.sectionLabel).toBe("Cell Block to Security Room");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/client/hud.test.ts
```

Expected: FAIL because `levelLabel` and `sectionLabel` do not exist.

- [ ] **Step 3: Extend the HUD model**

In `client/src/ui/Hud.ts`, add fields to `HudModel`:

```ts
levelLabel: string;
sectionLabel: string;
```

In `createHudModel`, return:

```ts
levelLabel: snapshot.level.name,
sectionLabel: snapshot.level.section,
```

In `Hud.update`, add a compact row near the objective:

```html
<div class="hud__row">
  <span>Level</span>
  <strong>${escapeHtml(model.levelLabel)}</strong>
</div>
```

- [ ] **Step 4: Run HUD tests**

Run:

```bash
npm test -- tests/client/hud.test.ts
```

Expected: PASS.

---

### Task 5: Treat Level Exit as Next-Level Transition

**Files:**
- Modify: `client/src/game/ObjectiveSystem.ts`
- Modify: `client/src/game/GameSimulation.ts`
- Test: `tests/client/simulation.test.ts`

- [ ] **Step 1: Write the failing completion test**

Add this test near the objective tests:

```ts
it("completes level one as a next-level transition", () => {
  const simulation = new GameSimulation();

  simulation.setPlayerPosition(prisonMap.key.position);
  simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });
  simulation.setPlayerPosition(prisonMap.exit.position);
  simulation.step({ direction: { x: 0, y: 0 }, sprint: false, interact: true });

  expect(simulation.getSnapshot().completed).toMatchObject({ outcome: "escape" });
  expect(simulation.getSnapshot().level.nextLevelId).toBe("security_wing");
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run:

```bash
npm test -- tests/client/simulation.test.ts
```

Expected: PASS after previous tasks. This task documents that the current `escape` outcome means “leave this section” until a dedicated `level_complete` outcome is added.

- [ ] **Step 3: Update wording only**

Do not change shared contracts yet. Keep the `RunOutcome` value as `"escape"` so analytics and existing tests remain stable. Update HUD objective wording to:

```ts
objective: snapshot.objectives.hasKey ? "Reach the next section door" : "Find the master key",
```

Run:

```bash
npm test -- tests/client/hud.test.ts tests/client/simulation.test.ts
```

Expected: PASS.

---

### Task 6: Final Verification

**Files:**
- Verify: all changed files

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/client/simulation.test.ts tests/client/hud.test.ts tests/client/renderer.test.ts tests/client/combat-integration.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: TypeScript completes with no errors.

- [ ] **Step 3: Refresh the in-app browser**

Open or reload:

```text
http://127.0.0.1:5174/
```

Expected: HUD shows `Cell Block`, existing security room/key/pistol flow still works, and completing the exit still reaches the run-complete screen.

---

## Self-Review

- Spec coverage: The plan creates authored level metadata, keeps the current map as Level 1, exposes level identity to HUD/snapshots, and preserves the current playable objective flow.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: `PrisonLevelId`, `PrisonLevel`, `SimulationOptions.levelId`, and `SimulationSnapshot.level` are introduced before use.
