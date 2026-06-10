import { describe, expect, it } from "vitest";
import { RunEventSchema } from "../../shared/contracts";

describe("RunEventSchema", () => {
  it("accepts a positioned sprint event", () => {
    expect(
      RunEventSchema.parse({
        type: "sprint",
        atMs: 1200,
        position: { x: 4, y: 7 },
        payload: {},
      }).type,
    ).toBe("sprint");
  });
});
