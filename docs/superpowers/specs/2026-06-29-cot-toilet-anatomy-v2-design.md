# Cot And Toilet Anatomy V2 Design

## Goal

Make cot and toilet parts read more clearly by prioritizing object anatomy before pixel decoration.

## Direction

Build each prop as a few obvious real-world parts, separated by color and position. Pixel styling should support the part shapes, not replace them with noisy chips.

## Cot

- Pillow: larger, pale, placed clearly at one end.
- Mattress/blanket: one main muted bedding shape, distinct from pillow.
- Metal frame: dark rails visible around the outside.
- Legs: simple dark supports at the corners.
- Avoid decorative chips until the pillow, bedding, and frame read immediately.

## Toilet

- Tank: rectangular rear/back part.
- Bowl/seat: main front part.
- Basin: darker inner opening, clear and wider-than-tall.
- Base/pipe/shadow: small anchor at bottom/side.
- Palette stays white, blue-gray, and shadow gray.

## Boundaries

Renderer-only. Do not change map placement, collision, gameplay, movement, speed, input, AI, room layout, or pickups.

## Testing

Renderer tests should verify larger, clearer cot pillow and bedding shapes, visible dark frame/legs, and toilet tank/bowl/basin/base parts with restrained colors.
