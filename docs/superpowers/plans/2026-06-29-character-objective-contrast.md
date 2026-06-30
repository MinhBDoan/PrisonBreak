# Character Objective Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve pixel-style readability for the player, guards, and important objective/interactable objects without changing gameplay.

**Architecture:** Keep this as a renderer-only pass in `client/src/render/GameRenderer.ts`. Add chunky outline/highlight rectangles to existing primitive sprites and strengthen interactable colors/strokes through the existing render loops. Do not touch simulation, map, AI, speed, collision, camera, or input files.

**Tech Stack:** TypeScript, Phaser primitive game objects, Vitest renderer tests.

---

## File Structure

- Modify `client/src/render/GameRenderer.ts`
  - `createPlayerSprite(...)`: add pixel contrast chips/highlight bands to the existing player container.
  - `createGuardSprite(...)`: add colder security-blue outline/highlight chips to front and side guard containers.
  - `render(...)` interactable loops: strengthen pickup/objective fill/stroke colors using existing Phaser shapes.
- Modify `tests/client/renderer.test.ts`
  - Add renderer tests that capture character container colors/child counts.
  - Extend interactable tests to assert stronger signature contrast colors.

## Task 1: Player Pixel Contrast

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Write the failing player contrast test**

Add this test after `"creates character containers for prisoner dressing instead of flat rectangles"` in `tests/client/renderer.test.ts`.

```ts
  it("renders the player with warm pixel contrast chips separate from guards", () => {
    const renderer = new GameRenderer();
    const descriptors = renderer.describe(new GameSimulation().getSnapshot());
    const playerDescriptor = descriptors.player;
    const playerColors: number[] = [];
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
          playerColors.push(fillColor);
          return rectangle;
        },
        ellipse: () => rectangle,
        container: (_x: number, _y: number, children: unknown[]) => ({
          list: children,
          setPosition: (x: number, y: number) => {
            if (x === playerDescriptor.x && y === playerDescriptor.y) {
              expect(children.length).toBeGreaterThanOrEqual(21);
            }
            return scene.add.container(0, 0, []);
          },
          setScale: () => scene.add.container(0, 0, []),
          setDepth: () => scene.add.container(0, 0, []),
          setAlpha: () => scene.add.container(0, 0, []),
          setVisible: () => scene.add.container(0, 0, []),
          setRotation: () => scene.add.container(0, 0, []),
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

    renderer.render(scene as never, new GameSimulation().getSnapshot());

    expect(playerColors).toEqual(expect.arrayContaining([0xfff0b8, 0xffd166, 0xf8fbff]));
  });
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because the player container has fewer than 21 parts and/or does not include the new `0xfff0b8` warm contrast chip.

- [ ] **Step 3: Add warm pixel chips to the player sprite**

In `client/src/render/GameRenderer.ts`, inside `createPlayerSprite(...)`, after `stripeB`, add:

```ts
  const chestHighlight = addPixelRect(scene, 7, 2, 4, 13, 0xfff0b8, 0.92);
  const shoulderChipLeft = addPixelRect(scene, -12, -5, 4, 5, 0xffd166, 0.92);
  const shoulderChipRight = addPixelRect(scene, 12, -5, 4, 5, 0xffd166, 0.92);
  const headRim = addPixelRect(scene, 0, -24, 14, 3, 0xf8fbff, 0.72);
```

Add these four variables to the `parts` array immediately after `stripeB`.

- [ ] **Step 4: Run the targeted test and verify it passes**

Run:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS for the new player contrast test and all existing renderer tests.

- [ ] **Step 5: Commit Task 1**

```powershell
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Add player pixel contrast highlights"
```

## Task 2: Guard Pixel Contrast

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Write the failing guard contrast test**

Add this test after the player contrast test.

```ts
  it("renders guards with cold security contrast chips distinct from the player", () => {
    const renderer = new GameRenderer();
    const descriptors = renderer.describe(new GameSimulation().getSnapshot());
    const guardPositions = descriptors.guards.map((guard) => `${guard.x}:${guard.y}`);
    const guardContainers: Array<{ childCount: number; colors: number[] }> = [];
    let pendingColors: number[] = [];
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
          pendingColors.push(fillColor);
          return rectangle;
        },
        ellipse: () => rectangle,
        container: (_x: number, _y: number, children: unknown[]) => {
          const colors = [...pendingColors];
          pendingColors = [];
          const container = {
            list: children,
            setPosition: (x: number, y: number) => {
              if (guardPositions.includes(`${x}:${y}`)) {
                guardContainers.push({ childCount: children.length, colors });
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

    expect(guardContainers.length).toBeGreaterThanOrEqual(3);
    expect(guardContainers.every((guard) => guard.childCount >= 23)).toBe(true);
    expect(guardContainers.some((guard) => guard.colors.includes(0x8bd3ff))).toBe(true);
    expect(guardContainers.some((guard) => guard.colors.includes(0x6bd3ff))).toBe(true);
  });
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because guard sprites do not yet include the cold security contrast chips.

- [ ] **Step 3: Add cold pixel chips to front guards**

In `createGuardSprite(...)`, inside the front-silhouette branch after `badge`, add:

```ts
    const radioGlow = addPixelRect(scene, -8, 1, 4, 5, 0x8bd3ff, 0.9);
    const cuffLeft = addPixelRect(scene, -15, 17, 5, 4, 0x6bd3ff, 0.82);
    const cuffRight = addPixelRect(scene, 15, 17, 5, 4, 0x6bd3ff, 0.82);
    const visorChip = addPixelRect(scene, 0, -23, 13, 3, 0x8bd3ff, 0.68);
```

Add them to the returned front guard container immediately after `badge`.

- [ ] **Step 4: Add cold pixel chips to side guards**

In the side-silhouette branch after `badge`, add:

```ts
  const radioGlow = addPixelRect(scene, 1, 1, 4, 5, 0x8bd3ff, 0.9);
  const cuffBack = addPixelRect(scene, -10, 17, 5, 4, 0x6bd3ff, 0.78);
  const cuffFront = addPixelRect(scene, 13, 18, 5, 4, 0x6bd3ff, 0.82);
  const visorChip = addPixelRect(scene, 8, -24, 12, 3, 0x8bd3ff, 0.68);
```

Add them to the returned side guard container immediately after `badge`.

- [ ] **Step 5: Run the targeted test and verify it passes**

Run:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS for guard contrast and existing renderer tests.

- [ ] **Step 6: Commit Task 2**

```powershell
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Add guard security contrast highlights"
```

## Task 3: Objective And Interactable Contrast

**Files:**
- Modify: `tests/client/renderer.test.ts`
- Modify: `client/src/render/GameRenderer.ts`

- [ ] **Step 1: Extend the failing interactable contrast test**

In `"renders interactables with stronger pixel-world silhouette cues"`, extend `shapes` to capture fill style calls:

```ts
    type FillCall = { fillColor: number; alpha?: number };
    const shapes: Array<{ label: InteractableLabel; strokes: StrokeCall[]; fills: FillCall[] }> = [];
```

In `makeShape`, add `fills: [] as FillCall[]` and replace `setFillStyle: () => shape` with:

```ts
        setFillStyle: (fillColor: number, alpha?: number) => {
          shape.fills.push({ fillColor, alpha });
          return shape;
        },
```

At the end of the test, add:

```ts
    expect(shapes.find((shape) => shape.label === "weapon")?.fills).toContainEqual({
      fillColor: 0xd5dde5,
      alpha: 0.98,
    });
    expect(shapes.find((shape) => shape.label === "healing")?.fills).toContainEqual({
      fillColor: 0x72d18b,
      alpha: 0.98,
    });
    expect(shapes.find((shape) => shape.label === "mainKey")?.strokes).toContainEqual({
      lineWidth: 5,
      strokeColor: 0xfff0b8,
      alpha: 0.94,
    });
    expect(shapes.find((shape) => shape.label === "exit")?.strokes).toContainEqual({
      lineWidth: 5,
      strokeColor: 0xd7f7ff,
      alpha: 0.9,
    });
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: FAIL because weapon/healing/main key/exit do not yet use the stronger contrast values.

- [ ] **Step 3: Strengthen weapon and healing pickup contrast**

In `GameRenderer.render(...)`, update the weapon pickup loop:

```ts
      const existing =
        objects.weaponPickups.get(pickup.id) ??
        scene.add.rectangle(pickup.x, pickup.y, 26, 12, 0xd5dde5, 0.98);
      existing.setPosition(pickup.x, pickup.y);
      existing.setVisible(!pickup.collected);
      existing.setRotation(-0.18);
      existing.setFillStyle(0xd5dde5, 0.98);
      existing.setStrokeStyle(5, 0xfff0b8, 0.92);
```

Update the healing pickup loop:

```ts
      const existing =
        objects.healingPickups.get(pickup.id) ??
        scene.add.rectangle(pickup.x, pickup.y, 24, 16, 0x72d18b, 0.98);
      existing.setPosition(pickup.x, pickup.y);
      existing.setVisible(!pickup.collected);
      existing.setFillStyle(0x72d18b, 0.98);
      existing.setStrokeStyle(5, 0xcfffd5, 0.94);
```

- [ ] **Step 4: Strengthen key and exit objective contrast**

In the main objective key render block, change:

```ts
    objects.key.setStrokeStyle(4, descriptors.objectives.key.strokeColor, 0.92);
```

to:

```ts
    objects.key.setStrokeStyle(5, 0xfff0b8, 0.94);
```

In the exit render block, change:

```ts
    objects.exit.setStrokeStyle(4, descriptors.objectives.exit.unlocked ? 0xd7f7ff : 0xfff0b8, 0.88);
```

to:

```ts
    objects.exit.setStrokeStyle(5, descriptors.objectives.exit.unlocked ? 0xcfffd5 : 0xd7f7ff, 0.9);
```

- [ ] **Step 5: Run the targeted test and verify it passes**

Run:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: PASS for interactable contrast and existing renderer tests.

- [ ] **Step 6: Commit Task 3**

```powershell
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Strengthen objective item pixel contrast"
```

## Task 4: Full Verification And Browser Inspection

**Files:**
- No planned code edits.

- [ ] **Step 1: Verify no gameplay files changed**

Run:

```powershell
git diff --name-only HEAD~3..HEAD
```

Expected: only `client/src/render/GameRenderer.ts` and `tests/client/renderer.test.ts` for implementation commits.

- [ ] **Step 2: Run full tests**

```powershell
npm test -- --run
```

Expected: all test files and tests pass.

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

- Player is easier to see against the cell block floor.
- Guards remain readable inside vision cones.
- Key/weapon/healing/exit stand out as interactables.
- Environment props do not look like pickups.
- Movement speed feels unchanged.

- [ ] **Step 5: Commit any final test-only adjustment if needed**

Only if verification requires a test expectation cleanup:

```powershell
git add tests/client/renderer.test.ts
git commit -m "Tighten contrast renderer expectations"
```
