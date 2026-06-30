# Cot And Toilet Clarity Design

## Goal

Make the cot and toilet read as recognizable real objects before adding decorative pixel detail. This pass should reduce visual noise and replace ambiguous small chunks with clear object parts.

## Direction

Build each object from its main real-world parts first, then pixelate those parts with chunky edges. The cot should read as pillow, blanket/mattress, and metal frame. The toilet should read as tank, seat/bowl, base, and pipe/shadow.

## Cot Rules

- Keep the current bed-frame silhouette direction.
- Use a dark metal frame with simple rails and legs.
- Use one clear pillow shape in pale blue-white.
- Use one clear blanket or mattress shape in a restrained prison bedding color.
- Remove unrelated orange dots, scattered color chips, and noisy accent circles.
- Use only a few pixel edge breaks or notches after the main parts are readable.

## Toilet Rules

- Use a clear rear tank shape.
- Use a clear bowl/seat shape with a visible inner basin.
- Use a small base/pipe/shadow to anchor it to the floor.
- Keep the palette mostly white, blue-gray, and shadow gray.
- Avoid many tiny highlights that blur into circular noise.

## Boundaries

Do not change map placement, collision, gameplay, movement, speed, room layout, pickups, or object dimensions. This is a renderer-only art readability pass.

## Testing

Renderer tests should verify:

- Cots include a pillow, blanket/mattress, metal frame, and legs/rails with no unrelated orange blanket chips.
- Toilets include tank, bowl/seat, inner basin, base/pipe/shadow, and use a restrained white/blue-gray palette.
- Existing object silhouette tests still pass.

Manual browser inspection should verify:

- The cot reads as a bed before it reads as pixel decoration.
- The toilet no longer looks like blurry circles.
