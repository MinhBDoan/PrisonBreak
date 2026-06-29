# Code-Defined Pixel Props Implementation Plan

> **For Ronny/Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan step-by-step.

## Goal

Convert the most important prison environment props from proportional rectangle assemblies into authored pixel-matrix silhouettes, while preserving the current Phaser primitive renderer, existing map positions, gameplay behavior, and no-external-assets constraint.

## Design Reference

Spec: `docs/superpowers/specs/2026-06-29-code-defined-pixel-props-design.md`

Target props for this pass:

- `bars`
- `cot`
- `toilet`
- `supply_shelf`
- `supply_boxes`
- `monitor`
- `weapon_rack`
- `exit_marker`

## Task 1: Add Pixel Matrix Rendering Helper

Files:

- `client/src/render/GameRenderer.ts`
- `tests/client/renderer.test.ts`

Implementation:

1. In `client/src/render/GameRenderer.ts`, near `addPixelRect`, add local types for tokenized pixel sprites.

```ts
type PixelToken = "." | "O" | "M" | "D" | "F" | "G" | "W" | "S" | "H";
type PaintedPixelToken = Exclude<PixelToken, ".">;

type PixelMatrixSprite = {
  rows: readonly string[];
  palette: Record<PaintedPixelToken, number>;
  alpha?: Partial<Record<PaintedPixelToken, number>>;
};
```

2. Add `countPaintedPixels(sprite)` to count every non-empty matrix cell.

```ts
function countPaintedPixels(sprite: PixelMatrixSprite): number {
  return sprite.rows.reduce(
    (total, row) => total + [...row].filter((token) => token !== ".").length,
    0,
  );
}
```

3. Add `createPixelMatrixSprite(scene, sprite, width, height)` before `createSetDressingSprite`.

Expected behavior:

- Determine `rowCount` and max `columnCount`.
- Compute `pixelSize = Math.max(1, Math.floor(Math.min(width / columnCount, height / rowCount)))`.
- Center the rendered matrix inside the requested width/height.
- For every non-empty token, call `addPixelRect(...)`.
- Apply a 1px stroke to outline/metal/shadow cells only, so props keep pixel-art edges without every interior color becoming noisy.
- Return `scene.add.container(0, 0, parts)`.

Sketch:

```ts
function createPixelMatrixSprite(
  scene: Phaser.Scene,
  sprite: PixelMatrixSprite,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const rowCount = sprite.rows.length;
  const columnCount = Math.max(...sprite.rows.map((row) => row.length));
  const pixelSize = Math.max(1, Math.floor(Math.min(width / columnCount, height / rowCount)));
  const totalWidth = columnCount * pixelSize;
  const totalHeight = rowCount * pixelSize;
  const xStart = -totalWidth / 2 + pixelSize / 2;
  const yStart = -totalHeight / 2 + pixelSize / 2;
  const parts: Phaser.GameObjects.Rectangle[] = [];

  sprite.rows.forEach((row, rowIndex) => {
    [...row.padEnd(columnCount, ".")].forEach((token, columnIndex) => {
      if (token === ".") {
        return;
      }
      const painted = token as PaintedPixelToken;
      const part = addPixelRect(
        scene,
        xStart + columnIndex * pixelSize,
        yStart + rowIndex * pixelSize,
        pixelSize,
        pixelSize,
        sprite.palette[painted],
        sprite.alpha?.[painted] ?? 1,
      );
      if (painted === "O" || painted === "M" || painted === "S") {
        part.setStrokeStyle(1, 0x0b1118, painted === "O" ? 0.92 : 0.42);
      }
      parts.push(part);
    });
  });

  return scene.add.container(0, 0, parts);
}
```

4. Add a helper in `createSetDressingSprite`:

```ts
const renderMatrix = (sprite: PixelMatrixSprite): Phaser.GameObjects.Container =>
  createPixelMatrixSprite(scene, sprite, width, height);
```

5. Convert only `bars` and `exit_marker` first to prove the helper.

Suggested matrices:

```ts
const barsSprite: PixelMatrixSprite = {
  rows: [
    "OOOOOOOOOOOO",
    ".M.M.M.M.M..",
    ".M.M.M.M.M..",
    ".M.M.M.M.M..",
    "OOOOOOOOOOOO",
  ],
  palette: {
    O: 0x0b1118,
    M: 0xb8c6d1,
    D: 0x263341,
    F: 0x2d3b49,
    G: 0x75e1ff,
    W: 0xffd166,
    S: 0x111820,
    H: 0xe2e8ef,
  },
};
```

```ts
const exitMarkerSprite: PixelMatrixSprite = {
  rows: [
    "..G..G..G..",
    ".GG.GG.GG..",
    "GHHGHHGHHG.",
    ".GG.GG.GG..",
    "..G..G..G..",
  ],
  palette: {
    O: 0x0b1118,
    M: 0x9aa7b4,
    D: 0x263341,
    F: 0x2d3b49,
    G: 0x57d7ff,
    W: 0xffd166,
    S: 0x111820,
    H: 0xd7f7ff,
  },
  alpha: { G: 0.72, H: 0.46 },
};
```

6. In `tests/client/renderer.test.ts`, add or update a test that captures `starter_cell_bars` and `exit_floor_chevrons`.

Assertions:

- `starter_cell_bars.childCount` equals `39`.
- `exit_floor_chevrons.childCount` equals the count from `exitMarkerSprite` after implementation.
- Fill colors include `0x0b1118`, `0xb8c6d1`, `0x57d7ff`, and `0xd7f7ff`.

7. Run:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: renderer test file passes.

## Task 2: Convert Cell Fixture Props

Files:

- `client/src/render/GameRenderer.ts`
- `tests/client/renderer.test.ts`

Implementation:

1. Replace the `cot` branch with a pixel matrix that reads as pillow + blanket + bed legs.

Suggested visual tokens:

- `O`: outline
- `M`: metal frame
- `F`: dark blanket
- `H`: pillow highlight
- `S`: legs/shadow

2. Replace the `toilet` branch with a pixel matrix that reads as tank + bowl + base.

Suggested visual tokens:

- `O`: outline
- `H`: porcelain highlight
- `M`: blue-gray interior shadow
- `S`: base shadow

3. Keep these colors present so current readability tests remain meaningful:

- cot: `0xd6dde4`, `0x2d3b49`, `0x7f93a8`
- toilet: `0xe9f1f6`, `0x91a8b6`

4. Update `"renders cell fixtures as recognizable pixel-object silhouettes"`:

- Keep the existing minimum expectations or raise them to matrix-level counts.
- Add exact-count assertions only for props with stable matrix definitions.
- Keep signature color assertions.

5. Run:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: renderer test file passes.

## Task 3: Convert Security And Storage Props

Files:

- `client/src/render/GameRenderer.ts`
- `tests/client/renderer.test.ts`

Implementation:

1. Replace `monitor` with a matrix showing a dark monitor bank, separated cyan screens, and one warning light.

Required colors:

- `0x173142`
- `0x75e1ff` or `0x2bc3ff`
- `0xff5f56`

2. Replace `weapon_rack` with a matrix showing back rail, vertical weapons/tools, and a warning stripe.

Required colors:

- `0x3d4650`
- `0xc7d1db`
- `0xffd166`

3. Replace `supply_shelf` with a matrix showing shelf uprights, two shelves, and different supply blocks.

Required colors:

- `0x5f4938`
- `0xd6a04f`
- `0x566b7f`
- `0xcfffd5`

4. Replace `supply_boxes` with a matrix showing a stacked box silhouette with tape/highlight marks.

Required colors:

- `0xd6a04f`
- `0xb28b63`
- `0x8b5f3c`
- `0xffefb0`

5. Update existing tests:

- `"renders security props as control-room silhouettes"`
- `"renders storage and route markers with stronger object silhouettes"`
- `"renders storage and security identity props as multi-part pixel containers"`

Assertions:

- Use exact counts for converted matrix props if stable.
- Preserve signature color checks.
- Keep unconverted props on minimum-count checks.

6. Run:

```powershell
npm test -- --run tests/client/renderer.test.ts
```

Expected: renderer test file passes.

## Task 4: Full Verification And Browser Inspection

Files:

- no planned code edits

Verification:

1. Run the full test suite.

```powershell
npm test -- --run
```

Expected: all tests pass.

2. Run typecheck.

```powershell
npm run typecheck
```

Expected: typecheck passes.

3. Use the in-app browser at `http://127.0.0.1:5173/`.

Inspect:

- Opening cell reads as a cell because bars, cot, and toilet are distinguishable.
- Storage room reads as shelving/boxes rather than generic blocks.
- Security room reads as monitor bank and weapon rack.
- Exit chevrons still look like route guidance, not loot.
- HUD and guard cones do not hide the new prop silhouettes.

4. If the app is not running, start Vite with:

```powershell
npm run dev -- --host 127.0.0.1
```

5. Commit when verification passes:

```powershell
git status --short
git add client/src/render/GameRenderer.ts tests/client/renderer.test.ts
git commit -m "Add code-defined pixel prop silhouettes"
```

Expected final state:

- Working tree clean except for intentional untracked runtime artifacts, if any.
- Tests and typecheck pass.
- Browser screenshot confirms clearer pixel prop silhouettes.
