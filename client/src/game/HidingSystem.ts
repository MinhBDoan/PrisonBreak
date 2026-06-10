import type { HidingSpot, PlayerState, PrisonMap, Vector } from "./types";

const interactionRange = 0.65;

function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class HidingSystem {
  constructor(private readonly map: PrisonMap) {}

  nearestSpot(position: Vector): HidingSpot | null {
    return (
      this.map.hidingSpots.find((spot) => distance(spot.position, position) <= interactionRange) ?? null
    );
  }

  toggle(player: PlayerState): { entered: string | null; exited: string | null } {
    if (player.hiddenIn) {
      const exited = player.hiddenIn;
      player.hiddenIn = null;
      return { entered: null, exited };
    }

    const spot = this.nearestSpot(player.position);
    if (!spot) {
      return { entered: null, exited: null };
    }

    player.hiddenIn = spot.id;
    player.position = { ...spot.position };
    return { entered: spot.id, exited: null };
  }
}
