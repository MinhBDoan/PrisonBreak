import type { RunOutcome } from "../../../shared/contracts";
import type { PlayerState, PrisonMap, Vector } from "./types";

const interactionRange = 0.75;

function near(a: Vector, b: Vector): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= interactionRange;
}

export class ObjectiveSystem {
  private exitUnlocked = false;

  constructor(private readonly map: PrisonMap) {}

  interact(player: PlayerState): { keyCollected: boolean; completed: RunOutcome | null } {
    if (!player.hasKey && near(player.position, this.map.key.position)) {
      player.hasKey = true;
      return { keyCollected: true, completed: null };
    }

    if (player.hasKey && near(player.position, this.map.exit.position)) {
      this.exitUnlocked = true;
      return { keyCollected: false, completed: "escape" };
    }

    return { keyCollected: false, completed: null };
  }

  snapshot(player: PlayerState): { hasKey: boolean; exitUnlocked: boolean } {
    return {
      hasKey: player.hasKey,
      exitUnlocked: this.exitUnlocked,
    };
  }
}
