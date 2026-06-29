# Code-Defined Pixel Props Design

## Goal

Move the most important environment props from rectangle assemblies toward authored pixel-sprite silhouettes. The game should still use the current Phaser renderer and avoid a full external asset pipeline, but key objects should look intentional rather than constructed from generic blocks.

## Direction

Use code-defined pixel sprites: small matrices or compact shape descriptors that render into Phaser primitive rectangles. This keeps the art editable in code, deterministic in tests, and visually closer to pixel art than the current proportional rectangle assemblies.

This pass should establish a lightweight pattern, not convert the whole game. Start with high-value props that are repeatedly visible or essential for prison readability.

## Target Props

First priority:

- cell bars
- cot
- toilet
- storage shelf or box stack
- monitor bank
- weapon rack
- exit marker

These props are the best candidates because they define room identity and are visible in the opening read.

## Rendering Approach

Add a small helper that can render a pixel matrix into a Phaser container. A matrix should use symbolic tokens mapped to palette colors, for example empty, outline, metal, fabric, glow, warning, shadow, and highlight. The helper should support a pixel size derived from the prop's target width/height so objects remain approximately aligned with existing map dimensions.

The renderer can continue using current `SetDressingKind` branches. For selected kinds, replace proportional shape assemblies with code-defined pixel matrices. Keep fallback rectangle rendering for unconverted kinds.

## Visual Rules

Pixel props should:

- have clear outlines
- use a limited palette
- preserve current world positions and depth behavior
- remain readable under HUD and guard vision cones
- not look like collectible pickups unless they are interactables

## Boundaries

Do not add external image files, sprite sheets, build steps, or dependencies in this pass. Do not change collision, patrol routes, map layout, pickups, objectives, doors, combat, or camera behavior.

## Testing

Tests should verify:

- pixel matrix rendering creates one rectangle per non-empty pixel
- selected prop kinds render through the pixel-matrix path
- target props have stable minimum pixel counts and signature palette colors
- existing renderer, simulation, and full test suites pass

Visual browser inspection is required after implementation.

## Out Of Scope

- Converting characters to sprite sheets.
- Imported art assets.
- Animation.
- Full tileset replacement.
- New gameplay interactions.
