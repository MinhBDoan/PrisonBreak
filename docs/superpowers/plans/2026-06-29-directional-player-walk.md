# Directional Player Walk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual-only pixel directional walking for the player so left, right, up, and down movement no longer looks like one static sliding sprite.

**Architecture:** Keep movement direction and walk phase out of `GameSimulation`; `GameScene` owns visual-only facing/phase based on current input and passes it to `GameRenderer.render(...)` as optional render state. `GameRenderer` recreates the player container only when the selected pixel silhouette changes, flips side-profile left/right with scale, and applies a tiny two-phase foot/arm chip offset without changing world position.

**Tech Stack:** TypeScript, Phaser primitive rectangles/containers, Vitest scene and renderer tests.

---

## File Structure

- Modify `client/src/render/GameRenderer.ts`
  - Add exported visual-only player types.
  - Extend `CharacterVisualDescriptor.silhouette` to include `back`.
  - Add an optional `PlayerRenderState` parameter to `render(...)`.
  - Recreate player container when silhouette changes.
  - Flip side-profile player by `facingX`.
  - Use `walkPhase` to pick a subtle pixel stance variant.
- Modify `client/src/scenes/GameScene.ts`
  - Track player visual facing and walk phase from input.
  - Pass visual state to `viewRenderer.render(...)`.
  - Do not modify simulation input values, speed constants, or movement rules.
- Modify `tests/client/renderer.test.ts`
  - Verify renderer exposes distinct player silhouettes/colors for front/back/side.
  - Verify horizontal facing flips via scale.
  - Verify walk phase changes only player sprite construction, not descriptor position.
- Modify `tests/client/game-scene.test.ts`
  - Verify `GameScene` passes visual-only facing/phase to renderer while simulation still receives unchanged input.

## Task 1: Renderer Contract For Player Visual State

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Write failing renderer contract tests**

Add these tests near the existing player/guard renderer tests in `tests/client/renderer.test.ts`.

```ts
  it("accepts visual-only player render state without changing player descriptor position", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const descriptor = renderer.describe(snapshot).player;
    const playerContainers: Array<{ x: number | null; y: number | null; scaleX: number | null; depth: number | null }> = [];
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
        container: (_x: number, _y: number, _children: unknown[]) => {
          const record = { x: null as number | null, y: null as number | null, scaleX: null as number | null, depth: null as number | null };
          const container = {
            list: [],
            setPosition: (x: number, y: number) => {
              record.x = x;
              record.y = y;
              return container;
            },
            setScale: (x: number) => {
              record.scaleX = x;
              return container;
            },
            setDepth: (depth: number) => {
              record.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
            destroy: () => undefined,
          };
          playerContainers.push(record);
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

    renderer.render(scene as never, snapshot, { facing: "left", walkPhase: 1, moving: true });

    const renderedPlayer = playerContainers.find((container) => container.depth === 18);
    expect(renderedPlayer).toMatchObject({ x: descriptor.x, y: descriptor.y, scaleX: -1 });
    expect(renderer.describe(snapshot).player).toMatchObject({ x: descriptor.x, y: descriptor.y });
  });

  it("rebuilds the player sprite when visual silhouette changes", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const destroyed: unknown[] = [];
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
      destroy: () => destroyed.push(rectangle),
    };
    const scene = {
      add: {
        rectangle: () => rectangle,
        ellipse: () => rectangle,
        container: (_x: number, _y: number, children: unknown[]) => ({
          list: children,
          setPosition: () => undefined,
          setScale: () => undefined,
          setDepth: () => undefined,
          setAlpha: () => undefined,
          setVisible: () => undefined,
          setRotation: () => undefined,
          destroy: () => destroyed.push(children),
        }),
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

    renderer.render(scene as never, snapshot, { facing: "down", walkPhase: 0, moving: false });
    renderer.render(scene as never, snapshot, { facing: "up", walkPhase: 0, moving: false });

    expect(destroyed.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because `GameRenderer.render` does not yet accept a third render-state argument and the player sprite does not track/rebuild visual silhouettes.

- [ ] **Step 3: Add renderer visual-state types**

In `client/src/render/GameRenderer.ts`, add after `const npcPrisonerSpriteScale = 1;`:

```ts
export type PlayerVisualFacing = "up" | "down" | "left" | "right";

export type PlayerRenderState = {
  facing: PlayerVisualFacing;
  walkPhase: 0 | 1;
  moving: boolean;
};

const defaultPlayerRenderState: PlayerRenderState = {
  facing: "down",
  walkPhase: 0,
  moving: false,
};
```

Change:

```ts
silhouette: "front" | "side_profile";
```

to:

```ts
silhouette: "front" | "back" | "side_profile";
```

Add:

```ts
function playerSilhouette(facing: PlayerVisualFacing): CharacterVisualDescriptor["silhouette"] {
  if (facing === "up") {
    return "back";
  }
  if (facing === "left" || facing === "right") {
    return "side_profile";
  }
  return "front";
}

function playerFacingX(facing: PlayerVisualFacing): 1 | -1 {
  return facing === "left" ? -1 : 1;
}
```

- [ ] **Step 4: Store player visual silhouette in render objects**

In `RenderObjects`, add:

```ts
  playerSilhouette?: CharacterVisualDescriptor["silhouette"];
```

In `mount(...)`, initialize:

```ts
      playerSilhouette: undefined,
```

- [ ] **Step 5: Update `render(...)` signature and player container rebuild**

Change:

```ts
  render(scene: Phaser.Scene, snapshot: SimulationSnapshot): void {
```

to:

```ts
  render(scene: Phaser.Scene, snapshot: SimulationSnapshot, playerState: PlayerRenderState = defaultPlayerRenderState): void {
```

Replace the player creation block with:

```ts
    const playerVisual = {
      ...descriptors.player.visual,
      silhouette: playerSilhouette(playerState.facing),
    };
    if (objects.player && objects.playerSilhouette !== playerVisual.silhouette) {
      destroyContainerWithChildren(objects.player);
      objects.player = undefined;
      objects.playerSilhouette = undefined;
    }
    if (!objects.player) {
      objects.player = createPlayerSprite(scene, playerVisual, playerState);
      objects.player.setDepth(18);
      objects.playerSilhouette = playerVisual.silhouette;
    }
    objects.player.setPosition(descriptors.player.x, descriptors.player.y);
    objects.player.setScale(playerFacingX(playerState.facing), 1);
    objects.player.setAlpha(descriptors.player.hidden ? 0.42 : 1);
```

- [ ] **Step 6: Make `createPlayerSprite` accept state without using it yet**

Change:

```ts
function createPlayerSprite(scene: Phaser.Scene, visual: CharacterVisualDescriptor): Phaser.GameObjects.Container {
```

to:

```ts
function createPlayerSprite(
  scene: Phaser.Scene,
  visual: CharacterVisualDescriptor,
  playerState: PlayerRenderState = defaultPlayerRenderState,
): Phaser.GameObjects.Container {
```

Add this temporary line near the top of the function to satisfy strict unused checks if needed:

```ts
  void playerState;
```

- [ ] **Step 7: Run targeted tests**

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS for renderer tests.

- [ ] **Step 8: Commit Task 1**

```powershell
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Add visual-only player render state"
```

## Task 2: Scene-Owned Facing And Walk Phase

**Files:**
- Modify: `tests/client/game-scene.test.ts`
- Modify: `client/src/scenes/GameScene.ts`

- [ ] **Step 1: Write failing GameScene visual-state tests**

In `tests/client/game-scene.test.ts`, add `render: vi.fn()` to `rendererCalls`:

```ts
  render: vi.fn(),
```

Reset it in `mockSceneCollaborators()`:

```ts
  rendererCalls.render.mockReset();
```

Change the mocked `GameRenderer.render` method to:

```ts
      render(...args: unknown[]) {
        rendererCalls.render(...args);
      }
```

Add this test near other `GameScene` input tests:

```ts
  it("passes visual-only player facing and walk phase to the renderer", async () => {
    const { scene, keys } = await createSceneHarness();

    startRun(scene, 12);
    rendererCalls.render.mockClear();

    keys.D.isDown = true;
    scene.update();
    keys.D.isDown = false;
    keys.W.isDown = true;
    scene.update();
    keys.W.isDown = false;
    scene.update();

    const renderStates = rendererCalls.render.mock.calls.map((call) => call[2]);
    expect(renderStates[0]).toMatchObject({ facing: "right", moving: true, walkPhase: 1 });
    expect(renderStates[1]).toMatchObject({ facing: "up", moving: true, walkPhase: 0 });
    expect(renderStates[2]).toMatchObject({ facing: "up", moving: false, walkPhase: 0 });
  });
```

- [ ] **Step 2: Run tests to verify failure**

```powershell
npm test -- --run tests/client/game-scene.test.ts
```

Expected: FAIL because `GameScene` does not yet pass render-state as the third argument.

- [ ] **Step 3: Import render-state type**

In `client/src/scenes/GameScene.ts`, change:

```ts
import { clampThrowTarget, GameRenderer, renderScale } from "../render/GameRenderer";
```

to:

```ts
import { clampThrowTarget, GameRenderer, renderScale, type PlayerRenderState, type PlayerVisualFacing } from "../render/GameRenderer";
```

- [ ] **Step 4: Add visual-only scene fields**

Inside `GameScene`, after `private pebbleAimStartedAtMs = -1;`, add:

```ts
  private playerVisualFacing: PlayerVisualFacing = "down";
  private playerWalkPhase: 0 | 1 = 0;
```

In `create(...)`, after `this.pebbleAimStartedAtMs = -1;`, add:

```ts
    this.playerVisualFacing = "down";
    this.playerWalkPhase = 0;
```

- [ ] **Step 5: Add helper methods**

Add these methods after `readInput()`:

```ts
  private updatePlayerVisualState(direction: Vector): PlayerRenderState {
    const moving = direction.x !== 0 || direction.y !== 0;
    if (moving) {
      if (Math.abs(direction.x) >= Math.abs(direction.y) && direction.x !== 0) {
        this.playerVisualFacing = direction.x < 0 ? "left" : "right";
      } else if (direction.y !== 0) {
        this.playerVisualFacing = direction.y < 0 ? "up" : "down";
      }
      this.playerWalkPhase = this.playerWalkPhase === 0 ? 1 : 0;
    } else {
      this.playerWalkPhase = 0;
    }
    return {
      facing: this.playerVisualFacing,
      walkPhase: this.playerWalkPhase,
      moving,
    };
  }
```

- [ ] **Step 6: Pass visual state to renderer**

In `create(...)`, replace:

```ts
    this.viewRenderer.render(this, snapshot);
```

with:

```ts
    this.viewRenderer.render(this, snapshot, {
      facing: this.playerVisualFacing,
      walkPhase: this.playerWalkPhase,
      moving: false,
    });
```

In `update()`, after `const input = this.readInput();`, add:

```ts
    const playerVisualState = this.updatePlayerVisualState(input.direction);
```

Replace:

```ts
    this.viewRenderer.render(this, snapshot);
```

with:

```ts
    this.viewRenderer.render(this, snapshot, playerVisualState);
```

- [ ] **Step 7: Run scene tests**

```powershell
npm test -- --run tests/client/game-scene.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run simulation movement test to confirm no speed changes**

```powershell
npm test -- --run tests/client/simulation.test.ts
```

Expected: PASS, including `"keeps walking and sprinting player movement readable"`.

- [ ] **Step 9: Commit Task 2**

```powershell
git add client/src/scenes/GameScene.ts tests/client/game-scene.test.ts
git commit -m "Pass visual-only player facing from scene"
```

## Task 3: Pixel Silhouette Variants And Walk Stance

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Write failing silhouette/color tests**

Add this test near the player renderer tests in `tests/client/renderer.test.ts`.

```ts
  it("renders distinct player pixel silhouettes for front back and side walking", () => {
    const renderer = new GameRenderer();
    const snapshot = new GameSimulation().getSnapshot();
    const playerContainers: Array<{ colors: number[]; childCount: number; depth: number | null }> = [];
    const makeShape = (fillColor?: number) => {
      const shape = {
        fillColor,
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
        destroy: () => undefined,
      };
      return shape;
    };
    const scene = {
      add: {
        rectangle: (_x: number, _y: number, _width: number, _height: number, fillColor: number) => makeShape(fillColor),
        ellipse: () => makeShape(),
        container: (_x: number, _y: number, children: unknown[]) => {
          const record = {
            colors: children
              .map((child) => (child as { fillColor?: number }).fillColor)
              .filter((fillColor): fillColor is number => fillColor !== undefined),
            childCount: children.length,
            depth: null as number | null,
          };
          const container = {
            list: children,
            setPosition: () => container,
            setScale: () => container,
            setDepth: (depth: number) => {
              record.depth = depth;
              return container;
            },
            setAlpha: () => container,
            setVisible: () => container,
            setRotation: () => container,
            destroy: () => undefined,
          };
          playerContainers.push(record);
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

    renderer.render(scene as never, snapshot, { facing: "down", walkPhase: 0, moving: false });
    renderer.render(scene as never, snapshot, { facing: "up", walkPhase: 0, moving: false });
    renderer.render(scene as never, snapshot, { facing: "right", walkPhase: 1, moving: true });

    const playerSprites = playerContainers.filter((container) => container.depth === 18);
    expect(playerSprites[0].colors).toContain(0xf8fbff);
    expect(playerSprites[1].colors).toContain(0x6a7d8f);
    expect(playerSprites[2].colors).toContain(0xfff0b8);
    expect(new Set(playerSprites.map((sprite) => sprite.childCount)).size).toBeGreaterThanOrEqual(2);
  });
```

- [ ] **Step 2: Run renderer tests to verify failure**

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because `back` and `side_profile` player silhouettes do not yet change colors/part counts distinctly.

- [ ] **Step 3: Implement silhouette-sensitive player sprite**

In `createPlayerSprite(...)`, remove `void playerState;`.

Add after existing dimension constants:

```ts
  const isBack = visual.silhouette === "back";
  const isSide = visual.silhouette === "side_profile";
  const stepOffset = playerState.moving && playerState.walkPhase === 1 ? 2 : 0;
```

Change leg creation:

```ts
  const legLeft = addPixelRect(scene, -5, 21 + stepOffset, 6, 10, 0x172231);
  const legRight = addPixelRect(scene, 5, 21 - stepOffset, 6, 10, 0x172231);
```

Change arm creation:

```ts
  const armLeft = addPixelRect(scene, isSide ? -9 : -13, 5 - stepOffset, 5, 18, skinColor);
  const armRight = addPixelRect(scene, isSide ? 12 : 13, 5 + stepOffset, 5, 18, skinColor);
```

Change highlight/head additions:

```ts
  const chestHighlight = isBack
    ? addPixelRect(scene, 0, 2, 12, 4, 0x6a7d8f, 0.86)
    : addPixelRect(scene, isSide ? 5 : 7, 2, 4, 13, 0xfff0b8, 0.92);
  const shoulderChipLeft = addPixelRect(scene, isSide ? -9 : -12, -5, 4, 5, isBack ? 0x2b7bb9 : 0xffd166, 0.92);
  const shoulderChipRight = addPixelRect(scene, isSide ? 11 : 12, -5, 4, 5, isBack ? 0x2b7bb9 : 0xffd166, 0.92);
  const headRim = addPixelRect(scene, isSide ? 4 : 0, -24, isSide ? 10 : 14, 3, isBack ? 0x6a7d8f : 0xf8fbff, 0.72);
```

Change face details:

```ts
  const mask = hasMask && !isBack ? addPixelRect(scene, 0, -17, 18, 5, 0x202a36) : null;
  const snout = isBack
    ? null
    : addPixelRect(scene, isSide ? 8 : visual.species === "possum" ? 1 : 0, -11, visual.species === "possum" ? 10 : 8, 4, snoutColor);
  const eyeLeft = isBack ? null : addPixelRect(scene, isSide ? 7 : -4, -17, 2, 2, 0xf8fbff);
  const eyeRight = isBack || isSide ? null : addPixelRect(scene, 4, -17, 2, 2, 0xf8fbff);
  const backCollar = isBack ? addPixelRect(scene, 0, -10, 14, 4, 0x2b7bb9, 0.9) : null;
```

In the `parts` array, remove `snout`, `eyeLeft`, and `eyeRight` from the initial required array. After the `if (mask)` block, add:

```ts
  if (snout) {
    parts.push(snout);
  }
  if (eyeLeft) {
    parts.push(eyeLeft);
  }
  if (eyeRight) {
    parts.push(eyeRight);
  }
  if (backCollar) {
    parts.push(backCollar);
  }
```

- [ ] **Step 4: Run renderer tests**

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Add directional player pixel walk silhouettes"
```

## Task 4: Full Verification And Browser Inspection

**Files:**
- No planned code edits.

- [ ] **Step 1: Verify changed files**

```powershell
git diff --name-only HEAD~3..HEAD
```

Expected implementation files:

```text
client/src/render/GameRenderer.ts
client/src/scenes/GameScene.ts
tests/client/game-scene.test.ts
tests/client/renderer.test.ts
```

- [ ] **Step 2: Run full tests**

```powershell
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

```powershell
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Inspect in browser**

Open or reload:

```text
http://127.0.0.1:5173/
```

Check:

- Player walking left and right uses side profile and flips horizontally.
- Player walking down uses front view.
- Player walking up uses back view.
- Idle after moving preserves last facing with a stable stance.
- Movement speed feels unchanged.
- Prior guard, prop, and objective readability remains intact.

- [ ] **Step 5: If inspection reveals a visual-only issue, fix in renderer only**

Allowed files for an inspection fix:

```text
client/src/render/GameRenderer.ts
tests/client/renderer.test.ts
```

Run renderer tests again after any fix:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Commit any inspection fix:

```powershell
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Tune directional player walk readability"
```
