# Pixel Prison Environment Readability Design

## Goal

Continue the Pixel Tactics art direction by making the prison environment read as a set of distinct, playable spaces instead of a mostly uniform tile grid. This pass should improve room identity, navigational clarity, and interactable readability while preserving the current map layout, collision, and gameplay rules.

## Art Direction

Use the existing chunky, primitive-based pixel style. All new environment art should be built from Phaser rectangles, ellipses, arcs, graphics, and containers with hard edges, limited detail, and strong silhouettes. The look should feel like pixel art assembled from simple blocks rather than smooth illustration or UI decoration.

The palette should keep the prison-noir base but avoid making every area the same gray-blue. Cells and corridors can stay institutional and worn. Storage should be warmer and utility-focused. Security should be colder, cleaner, and monitor-lit. Interactable accents should be bright enough to read quickly without becoming floating UI stickers.

## Room Identity

Cells should feel cramped and lived-in. Strengthen bars, bedding, toilet detail, wall grime, prisoner-life marks, and small floor shadows around static prisoner sprites. The player should immediately understand these spaces as cells, not generic rooms.

Corridors should become directional and institutional. Add floor stripe lines, scuffed tile variation, wall trim, small signage, and stronger zone transitions where corridors meet rooms. These details must not obscure guards, vision cones, pickups, or doors.

Storage should feel cluttered, warmer, and practical. Extend the existing shelves, supply boxes, labels, tool marks, and bandage/supply cues. The room should read as the best place to find useful items.

Security should feel official and surveillance-focused. Extend monitor glow, control panels, desk shapes, camera details, weapon rack clarity, and blue/cyan accents. The room should contrast with storage through order, colder colors, and controlled lighting.

## Interactable Readability

Doors, keys, weapons, hiding spots, healing pickups, pebble pickups, and the exit should receive stronger silhouettes or small pixel accent treatments. These cues should be part of the world art: outlines, glow strips, floor markers, labels, or prop detail. Avoid large text labels or HUD-like badges in the playfield.

Guard vision cones and character sprites remain the highest-priority moving elements. Environment details should sit below characters in depth and use contrast carefully so tactical state stays readable.

## Implementation Boundaries

Stay within the existing renderer and map structure:

- Add or refine authored non-blocking set dressing in `client/src/game/map.ts`.
- Extend `client/src/render/GameRenderer.ts` with reusable primitive-based prop helpers where needed.
- Reuse existing descriptor patterns so tests can verify the art data before rendering.
- Do not introduce external raster assets, sprite sheets, new dependencies, or a new tile engine.
- Do not change room bounds, wall collision, patrol routes, pickup behavior, detection, combat, or win conditions.

If renderer complexity grows, prefer small helper functions for repeated prop families such as floor markings, bars, shelves, panels, signs, pickup accents, and shadows.

## Testing

Add focused tests that confirm:

- New room identity props are described or rendered for cells, corridors, storage, and security.
- New set dressing is non-blocking and does not overlap solid walls in a way that changes traversal.
- Multi-part props render as containers where appropriate.
- Interactable descriptors preserve their gameplay data while gaining clearer visual treatment.
- Existing full client and service tests continue to pass.

## Out Of Scope

- Full sprite sheets or imported pixel art.
- Animation systems for environmental props.
- Dynamic lighting or shader work.
- Map layout redesign.
- New rooms, items, enemies, or mechanics.
