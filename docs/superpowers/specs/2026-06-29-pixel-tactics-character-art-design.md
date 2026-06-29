# Pixel Tactics Character Art Design

## Purpose

Improve the game's character readability and personality while staying within the current Phaser renderer. This pass establishes the cast language for the animal prison escape theme before adding more animation or external sprite assets.

## Visual Direction

Use the selected **Pixel Tactics** direction: small, blocky, tile-friendly sprites with clear silhouettes and hard color blocks. Characters should read through uniform color, ears, snouts, tails, masks, and simple props rather than detailed illustration.

## Character Language

The player is a raccoon prisoner in an orange jumpsuit. The raccoon mask and ringed tail should make the player distinct, with a player-specific readability cue such as a brighter outline, accent stripe, or other small highlight.

NPC prisoners are random animals in the same orange jumpsuit. They should not be visually muted; they are part of the cast and should feel alive even while static. The first pass should include a small set of reusable variants, such as raccoon, cat, and possum or rabbit.

Basic guards are dog guards in navy or blue uniforms. They should have a more official security silhouette than prisoners: cap, badge, baton, squared stance, and a controlled color palette. Future special guard types can use other animals, such as bear riot guards, wolf elite guards, or fox wardens and investigators.

## Rendering Approach

Keep this pass shape-based in Phaser rather than introducing external sprite sheets. The current renderer already builds character containers from pixel-like rectangles, which is enough for a fast, testable art upgrade.

Add or adjust renderer helpers so character visuals are driven by descriptors:

- prisoner species and role
- guard species and role
- uniform color
- accent and outline colors
- optional player highlight

Render prisoner set-dressing objects as small character sprites instead of plain rectangles. These NPC sprites can reuse the prisoner visual helper with species variants chosen from map metadata or a deterministic id-based fallback.

## Scope

In scope:

- Flip prisoner uniforms to orange.
- Change basic guards from fox/orange to dog/blue.
- Keep the player as a raccoon prisoner.
- Add random-animal NPC prisoner visuals for existing prisoner dressing objects.
- Preserve current gameplay behavior and map layout.
- Add focused descriptor and renderer tests for the new visual identities.

Out of scope:

- Full sprite sheets.
- Walk-cycle animation.
- New gameplay systems for NPC prisoners.
- New special guard types.
- Reworking environment art beyond what is needed for character integration.

## Testing

Tests should verify that render descriptors and character rendering expose the intended identities:

- player is a raccoon prisoner in an orange uniform
- basic guards are dog guards in blue uniforms
- prisoner set-dressing objects render through character-style visuals
- NPC prisoner species variants are deterministic and use orange jumpsuits

Existing simulation behavior should remain unchanged.
