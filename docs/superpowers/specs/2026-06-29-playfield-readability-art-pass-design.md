# Playfield Readability Art Pass Design

## Goal

Make the prison playfield easier to understand at a glance. The environment now has more pixel-object detail, but the overall scene still reads as a dense grid with heavy HUD coverage. This pass should improve first-read clarity: where rooms begin and end, what kind of room the player is in, where interactables are, and what space is safe to scan.

## Visual Direction

Stay in the current primitive Pixel Tactics style. Use bigger, clearer visual bands and silhouettes before adding more small details. The priority is not decoration density; it is scene hierarchy.

The player should quickly read:

- cell block versus corridor
- storage versus security
- walls versus floor
- props versus pickups
- HUD versus playfield

## HUD Obstruction

The HUD is functional but visually heavy. It can cover important prison art, especially near the cell block. This pass should make the HUD feel less like a dark overlay sitting on top of the level.

Use restrained changes:

- slightly reduce panel opacity or weight
- tighten panel footprint where possible
- keep text readable
- do not remove existing information
- do not change gameplay controls

## Room Boundary Readability

Room boundaries should be more obvious at the camera's first playable view. Strengthen large-scale wall/floor separation and room borders before adding more prop detail.

Cells should read as enclosed prison cells through stronger front bars, darker cell interiors, and visible cell-front separation. Corridors should read as circulation lanes through floor stripes and trim. Storage should have a warmer background band. Security should keep cooler blue/cyan background language.

## Depth And Priority

Characters, guard vision cones, and interactables remain the highest-priority elements. Room bands and floor details should sit below them and avoid high contrast directly under characters.

Interactable outlines from the previous pass should remain visible. Decorative props should not look collectible.

## Implementation Boundaries

Use existing systems:

- `client/src/render/GameRenderer.ts` for tile, room-detail, prop, and depth refinements.
- `client/src/ui/Hud.ts` and `client/src/styles.css` only if HUD weight can be improved without structural UI redesign.
- Existing map data should remain unchanged unless a non-blocking visual marker is necessary.

Do not change collision, patrol routes, combat, pickups, doors, objectives, or level layout.

## Testing

Tests should verify stable render descriptors or scene object properties where practical:

- room background accents include stronger cell/storage/security/corridor boundary colors
- HUD styling preserves required objective/status text while reducing overlay weight
- existing renderer and HUD tests continue to pass
- full test suite and typecheck pass

Visual inspection in the in-app browser is required after implementation because canvas readability cannot be judged from DOM tests alone.

## Out Of Scope

- Imported assets or sprite sheets.
- Full HUD redesign.
- New minimap or camera system.
- Map layout redesign.
- New gameplay mechanics.
