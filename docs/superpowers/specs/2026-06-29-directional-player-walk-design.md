# Directional Player Walk Pixel Design

## Goal

Add visual-only directional walking reads for the player so movement no longer looks like a single static sprite sliding across the prison. The pass should keep the pixel-art direction and avoid changing movement speed, collision, input, AI, or gameplay behavior.

## Direction

Use a small renderer-driven state: player facing direction and walk phase. The player should visually distinguish left, right, up, and down movement with chunky pixel silhouette changes. The animation should be subtle and low-frame, closer to old pixel walk cycles than smooth tweening.

## Target Areas

- Player facing left and right.
- Player facing down/front.
- Player facing up/back.
- Walking stance variation while moving.
- Idle pose should remain stable when no movement input is active.

## Rendering Approach

Track the player's last movement direction in `GameSimulation` or expose it in the snapshot only if the value already naturally belongs to simulation state. If that would risk gameplay coupling, keep the direction state in `GameScene` and pass it to the renderer as a visual descriptor.

The renderer should select a player visual variant from:

- `front`
- `back`
- `side_profile`

Left and right can share `side_profile` with horizontal scale flipping. Walking can use a simple phase value that swaps 1-2 leg/arm pixel offsets or small foot chips. The phase must not affect world position.

## Visual Rules

- Keep the player warm/orange/blue contrast language from the current pass.
- Preserve chunky pixel rectangles and crisp outline/highlight chips.
- Do not use smooth tweened limb rotation for the player walk.
- Do not add imported sprite sheets or external assets.
- Make up/back movement readable enough that the player no longer appears to moonwalk while moving vertically.

## Boundaries

Do not change walk speed, sprint speed, step timing, collision, patrols, detection, camera behavior, input mapping, objectives, or combat. Any new direction/phase data must be visual-only and must not feed gameplay decisions.

## Testing

Tests should verify:

- Player descriptors or render state expose visual facing without changing simulation movement distances.
- Horizontal facing flips the player sprite instead of creating separate gameplay state.
- Up/down movement selects distinct pixel silhouettes.
- Walk phase changes only visual child placement or selected chips.
- Existing renderer, simulation, and scene tests pass.

Manual browser inspection should verify:

- Walking left/right/down/up is visually distinct.
- Player still reads as the same character.
- Movement speed feels unchanged.
- Guard and environment readability from prior passes remains intact.
