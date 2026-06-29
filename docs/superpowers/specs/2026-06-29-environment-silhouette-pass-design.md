# Environment Silhouette Pass Design

## Goal

Push the prison environment from abstract blocky decoration toward recognizable pixel-object silhouettes. The game should still feel chunky and tile-friendly, but cells, corridors, storage, security, and exits should read as prison spaces at a glance.

## Art Direction

Stay in the current Phaser primitive renderer. Use rectangles, ellipses, arcs, graphics, and containers as small pixel-object assemblies. The goal is not smooth illustration or imported assets; it is stronger silhouettes made from simple hard-edged shapes.

Every environment object should answer a quick visual question: what is this supposed to be? If a player cannot tell whether a prop is a cot, toilet, shelf, desk, monitor bank, camera, weapon rack, or exit marker without already knowing the map, the silhouette is not strong enough.

## Room Targets

Cells should be the clearest first target. Bars need heavier vertical rhythm and darker gaps. Cots should read through pillow, blanket, mattress, and frame shapes. Toilets should have bowl and tank silhouettes. Cell walls should include scratches, stains, and small inmate-life marks that look authored rather than random noise.

Security should read as a control room. Monitors need individual screens and glow blocks. The desk should become a console shape rather than a brown table. The camera marker should look like a mounted camera. The weapon rack should use clearer long weapon silhouettes.

Storage should read as a supply room. Shelves should have vertical supports, horizontal boards, stacked boxes, labels, and a visible medical/supply cue near bandages. Warm browns and yellow labels can distinguish it from security.

Corridors should read as circulation space. Add stronger wall/floor separation, directional stripe rhythm, scuffed tile lanes, and compact zone signs. These should guide the eye without competing with guard vision cones.

Exit areas should signal the route out with chunky chevrons, door-frame contrast, and cool cyan edge cues.

## Readability Rules

Characters and guard vision cones stay higher priority than environment art. Environment silhouettes should use lower depth values and restrained alpha where needed. Interactable items can keep stronger outlines, but decoration should not look like a pickup.

Props should be composed as reusable helpers where useful:

- bars and cell fixtures
- cot and toilet silhouettes
- storage shelves and box stacks
- monitor banks and control panels
- camera and weapon rack silhouettes
- corridor signs and exit chevrons

Avoid adding new collision, new routes, new mechanics, new dependencies, or imported sprite assets in this pass.

## Implementation Boundaries

Use the current data and rendering flow:

- Refine existing `SetDressingKind` branches in `client/src/render/GameRenderer.ts`.
- Add small helper functions only when they reduce repetition or clarify prop construction.
- Add map entries only if an object is needed for silhouette clarity and remains non-blocking.
- Keep all visual work primitive-based.
- Preserve gameplay behavior, collision, patrols, pickups, doors, and objectives.

## Testing

Tests should verify that recognizable silhouettes are represented by multi-part containers with enough structure to distinguish them from generic fallback rendering. Coverage should focus on stable properties such as child counts, key colors, stroke cues, and object-specific creation paths rather than pixel-perfect positions.

Map safety tests should continue to verify decorative props remain non-blocking and do not overlap solid cover or wall tiles in a gameplay-changing way.

## Out Of Scope

- Imported sprite sheets or raster assets.
- Animation pass for props.
- Lighting/shader systems.
- Map redesign.
- New gameplay interactions for decorative props.
