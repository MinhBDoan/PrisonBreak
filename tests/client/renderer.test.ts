import { describe, expect, it } from "vitest";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import { GameRenderer } from "../../client/src/render/GameRenderer";

describe("GameRenderer", () => {
  it("maps simulation entities to stable render descriptors and hides unaware vision cones", () => {
    const simulation = new GameSimulation();
    const renderer = new GameRenderer();

    const descriptors = renderer.describe(simulation.getSnapshot());

    expect(descriptors.player).toMatchObject({
      id: "player",
      kind: "player",
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(descriptors.guards).toEqual([
      expect.objectContaining({
        id: "guard-1",
        kind: "guard",
        state: "patrol",
        visionCone: null,
      }),
      expect.objectContaining({
        id: "guard-2",
        kind: "guard",
        state: "patrol",
        visionCone: null,
      }),
    ]);
    expect(descriptors.hidingSpots.map((spot) => spot.id)).toEqual([
      "locker_alpha",
      "locker_bravo",
      "shadow_nook",
    ]);
    expect(descriptors.objectives.key.id).toBe("security_key");
    expect(descriptors.objectives.exit.id).toBe("locked_exit");
  });
});
