import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("player sprite assets", () => {
  it("uses the approved back-facing right-arm swipe art for the up-facing knife melee sprite", () => {
    const upKnife = readFileSync("client/public/assets/player-raccoon-up-knife.png");

    expect(createHash("sha256").update(upKnife).digest("hex")).toBe(
      "1bc1708251b05bb036bf74852e7f9173bed45c0916b91cc6939752028aa77d3c",
    );
  });

  it("uses the approved mirrored right-facing art for the left-facing knife melee sprite", () => {
    const leftKnife = readFileSync("client/public/assets/player-raccoon-left-knife.png");

    expect(createHash("sha256").update(leftKnife).digest("hex")).toBe(
      "1403c6b7fa5a2b05c4c8406e5d447e6a7b4f3fc435682a3f5a719e3e29f1291c",
    );
  });
});
