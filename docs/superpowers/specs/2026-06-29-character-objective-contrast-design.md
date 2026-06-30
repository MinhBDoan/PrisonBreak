# Character And Objective Contrast Design

## Goal

Improve readability for moving characters and important objective objects while continuing toward the pixel-art direction. The player, guards, key items, weapons, healing pickups, doors, and exit should read quickly against the prison environment without changing gameplay.

## Direction

Use pixel-style contrast, not smooth polish. Characters and interactables should gain clearer chunky silhouettes, limited-palette accents, and crisp outline/highlight pixels. The result should feel more authored and arcade-readable while still fitting the existing prison palette.

## Target Areas

- Player sprite
- Guard sprites
- Master key and general key pickups
- Weapon pickups
- Healing pickup
- Door key indicators
- Exit marker and route cue readability, only if needed after the character/item pass

## Visual Rules

- Preserve the current environment, room identity, and prop art.
- Keep characters and objectives visibly distinct from background props.
- Use warmer highlight language for the player and objective items.
- Use colder security colors for guards so they separate from the player.
- Prefer 1-3 pixel-scale highlight bands, outline chips, and palette separation over large glows.
- Keep visual changes readable under HUD overlays and guard vision cones.
- Avoid making non-interactive environment props look collectible.

## Boundaries

Do not change movement speed, sprint speed, guard speed, AI, detection, collision, map layout, camera behavior, weapons, objectives, or input behavior. Do not add external sprite sheets or imported art assets in this pass.

## Testing

Tests should verify:

- Player and guard sprites keep stable multi-part pixel silhouettes.
- Player and guard palettes remain distinct.
- Important pickups include signature contrast colors.
- Existing renderer, simulation, and UI tests pass.

Manual browser inspection should verify:

- Player position and facing are easier to read while moving.
- Guards remain readable inside vision cones.
- Objective and interactable items stand out without looking unrelated to the prison style.
- The scene still feels pixel-art rather than smooth vector UI.
