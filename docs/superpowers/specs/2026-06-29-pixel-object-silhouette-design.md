# Pixel Object Silhouette Design

## Goal

Make the prison environment props read as recognizable pixel-art objects instead of mostly rectangular blocks. The pass should improve object identity in cells, corridors, storage, security, and exit areas without changing gameplay.

## Direction

Use authored pixel silhouettes made from existing Phaser primitives. Rectangles are only the current construction tool and placeholder shape language, not the desired final look. Props, rooms, and characters may become irregular pixel silhouettes built from many small pixel chunks as the art moves toward fuller pixel-art readability.

Props should stay chunky, low-resolution, and tile-friendly, but gain enough shape detail that the player can recognize beds, toilets, bars, lockers, crates, desks, monitors, shelves, and doors at a glance.

This is an environment readability pass, not a layout pass. The map should feel more like a real prison wing while preserving the current top-down pixel style.

## Target Objects

- Cell cots: pillow, blanket, rails, legs, and frame pixels.
- Cell toilets: tank, bowl, seat rim, pipe/shadow pixels.
- Cell bars: thicker frame caps and repeated vertical bar rhythm.
- Lockers: door split, vents, handle, base shadow, and occupied-state danger tint.
- Crates and low cover: stacked boards, corner caps, straps, and top-face pixels.
- Security desk and monitor bank: screen shapes, keyboard strip, buttons, warning lights, cable/detail pixels.
- Weapon rack, supply shelves, supply boxes: clear rack hooks, boxes, bottles, bandage/medical markings, shelf layers.
- Doors: door slab plus hinge, lock plate, handle, and open/unlocked/locked color cues.
- Exit/security signage: keep as readable room cues, but do not make them look like pickups.

## Visual Rules

- Use primitive pixel rectangles, existing matrix-style sprites, and small container groups to create non-rectangular pixel silhouettes.
- Keep silhouettes compact inside each prop's existing world footprint.
- Break up boxy placeholder outlines with notches, gaps, caps, angled stair-step edges, inset pixels, shadows, and object-specific protrusions.
- Add detail through 1-4 color accents per prop, not smooth gradients.
- Preserve the current prison palette: cold metal, muted wood, concrete blue-gray, warning yellow/red, and medical green only on healing or supply-medical details.
- Environment props should be readable but less visually dominant than the player, guards, keys, weapons, healing pickups, and exit objective.
- Avoid large glows or decorative effects that compete with guard vision cones.

## Boundaries

Do not change movement speed, sprint speed, guard speed, AI, detection, collision, map layout, pickup placement, door logic, camera behavior, input behavior, or objective rules.

Do not add imported sprite sheets, bitmap assets, SVG art, or new external dependencies. This pass should be renderer-driven and use existing map data.

## Implementation Shape

- Extend `createSetDressingSprite(...)` for richer prop-specific silhouettes where props already render as set dressing.
- Add small reusable prop-building helpers only if they reduce repetition in renderer tests and implementation.
- Convert lockers, cover objects, and doors from single rectangles into compact containers when needed for recognizable silhouettes.
- Keep render object maps stable and destroy/recreate only when the underlying render object type changes.
- Preserve existing descriptor shape unless tests need a minimal visual type marker.

## Testing

Renderer tests should verify:

- Cots, toilets, bars, desk/monitor, shelves/boxes, and doors create multi-part pixel silhouettes with signature colors or geometry.
- Lockers and cover objects no longer render as plain single rectangles.
- Door locked/unlocked/open state cues remain visible after adding detail.
- Important pickups remain visually distinct from non-interactive environment props.

Full verification should include:

- `npm test -- --run`
- `npm run typecheck`
- Browser inspection at `http://127.0.0.1:5173/`

Manual browser inspection should verify:

- Cells read as cells because cots, toilets, bars, and lockers are recognizable.
- Security and storage areas read as different room types.
- Props are clearer without making the game feel visually noisy.
- Player/guard/objective readability from previous passes is preserved.
