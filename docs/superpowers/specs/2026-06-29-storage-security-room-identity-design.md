# Storage Security Room Identity Design

## Goal

Improve the visual identity of the storage and security rooms while keeping the existing Chunky Prison Noir direction, current gameplay layout, and collision behavior intact.

## Scope

This pass focuses on environmental art only. The storage room should read as a cluttered supply/storage space, and the security room should read as a guarded control room. The pass should not add new mechanics, change patrol routes, add new collision blockers, or alter room access.

## Storage Room Direction

The storage room should feel warmer, cluttered, and utility-focused. Add non-blocking set dressing such as shelves, small tool shapes, stacked supply boxes, labels, floor scuffs, and a stronger visual cue around the bandage/supply area. Existing solid objects remain the only storage obstacles.

## Security Room Direction

The security room should feel colder, official, and surveillance-focused. Improve monitor glow, desk shape, weapon rack readability, and add small wall/control-panel details. The room should contrast with storage through colder blue/cyan accents and more organized shapes.

## Implementation Boundaries

Use existing renderer and map patterns:

- Add or refine authored set dressing entries in `client/src/game/map.ts`.
- Extend existing rendering helpers in `client/src/render/GameRenderer.ts`.
- Keep any new art as Phaser primitive pixel shapes, matching the current placeholder art system.
- Avoid adding raster assets or new dependencies for this pass.

## Testing

Add focused tests in existing client test files:

- Simulation/map tests should verify new non-blocking set dressing objects are present and do not overlap tile walls.
- Renderer tests should verify room-identity props render as multi-part pixel containers for shelves, panels, supply boxes, and camera/monitor details.
- Existing full test suite and typecheck must pass.
