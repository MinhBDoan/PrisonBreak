# Tile And Camera Readability Pass Design

## Goal

Make the base playfield read more like a prison level and less like a uniform grid. The current prop and HUD passes improved specific objects, but the floor/wall layer still dominates the scene. This pass should improve tile rhythm, wall/floor separation, and first playable camera framing without changing gameplay.

## Visual Direction

Stay in primitive Pixel Tactics style. Use hard-edged rectangles and low-depth accents to create clearer lanes, walls, and cell interiors. The base layer should support room identity rather than compete with props, characters, interactables, or guard vision cones.

## Tile Readability

Floor grid contrast should be quieter in open areas and more directional in corridors. Corridors can use lane strips, scuffed tile runs, and subtle trim to guide the eye. Cells can use darker inset floors. Storage and security can keep warmer/cooler floor fields.

Wall tiles should read as solid structure. Strengthen top highlights and dark lower faces, especially where walls border playable floor. The player should quickly distinguish walls, open floor, cell interiors, and doors.

## Camera Framing

The first playable view should present the player, the cell block, and immediate escape context clearly. If the camera centers too far into a busy middle area, the player loses the prison-cell read. This pass should evaluate the current camera centering and, if safe, adjust initial framing or camera follow behavior so the opening read favors the player’s starting cell area.

Any camera adjustment must preserve normal playability and avoid hiding active threats, interactables, or HUD-critical information.

## Implementation Boundaries

Use existing systems:

- `client/src/render/GameRenderer.ts` for base tile, wall, floor, and room-detail refinements.
- `client/src/scenes/GameScene.ts` only if a small camera framing adjustment is needed.
- Tests in `tests/client/renderer.test.ts` and `tests/client/game-scene.test.ts`.

Do not change map layout, collision, patrol routes, combat, pickups, doors, objectives, or level progression. Do not add imported assets, shaders, or new dependencies.

## Testing

Tests should verify stable properties rather than pixel-perfect art:

- base mount creates quieter floor scuffs and stronger wall edge colors
- corridor lane/trim colors exist at low depth
- cell interior and wall/floor separation colors are present
- any camera framing change has a focused scene test
- full test suite and typecheck pass

Visual browser inspection is required after implementation.

## Out Of Scope

- New tile engine.
- Imported tile sets or sprite sheets.
- Dynamic lighting/shaders.
- Map redesign.
- New camera controls or minimap.
