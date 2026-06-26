import { describe, expect, it } from "vitest";
import { RunEventSchema, RunOutcomeSchema } from "../../shared/contracts";

describe("combat run contracts", () => {
  it("accepts combat run events and death outcomes", () => {
    expect(
      RunEventSchema.parse({
        type: "pebble_throw",
        atMs: 500,
        position: { x: 3, y: 6 },
        payload: {
          landing: { x: 8, y: 6 },
        },
      }).type,
    ).toBe("pebble_throw");

    expect(
      RunEventSchema.parse({
        type: "attack",
        atMs: 1000,
        position: { x: 4, y: 7 },
        payload: {
          attackType: "gun",
          weaponId: "pistol",
          targetId: "guard-a",
          hit: true,
          damage: 35,
          noise: 70,
        },
      }).type,
    ).toBe("attack");

    expect(
      RunEventSchema.parse({
        type: "guard_attack",
        atMs: 1200,
        position: { x: 5, y: 7 },
        payload: {
          guardId: "guard-a",
          targetPosition: { x: 4.5, y: 7 },
          damage: 15,
        },
      }).type,
    ).toBe("guard_attack");

    expect(RunOutcomeSchema.parse("death")).toBe("death");

    expect(
      RunEventSchema.parse({
        type: "body_discovered",
        atMs: 2000,
        position: { x: 5, y: 8 },
        payload: {
          guardId: "guard-a",
          discoveredBy: "guard-b",
          bodyState: "knocked_out",
        },
      }).type,
    ).toBe("body_discovered");

    expect(
      RunEventSchema.parse({
        type: "guard_wakeup",
        atMs: 3000,
        position: { x: 6, y: 9 },
        payload: {
          guardId: "guard-a",
          wokenBy: "guard-b",
        },
      }).type,
    ).toBe("guard_wakeup");
  });
});
