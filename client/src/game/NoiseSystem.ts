import type { AppliedAdaptations, PlayerState, Vector } from "./types";

export type NoiseEvent = {
  position: Vector;
  radius: number;
  source: "walk" | "sprint" | "pebble" | "weapon" | "reload";
};

export class NoiseSystem {
  constructor(private readonly adaptations: AppliedAdaptations) {}

  movementNoise(player: PlayerState, moved: boolean, sprint: boolean): NoiseEvent | null {
    if (!moved || player.hiddenIn) {
      return null;
    }

    const base = sprint ? 3.6 : 1.5;
    return {
      position: { ...player.position },
      radius: base + this.adaptations.noiseSensitivity * 1.2,
      source: sprint ? "sprint" : "walk",
    };
  }
}
