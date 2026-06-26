import type { HidingSpot, PlayerState, PrisonMap, Vector } from "./types";

const interactionRange = 0.65;
const lockerInteractionSize = { width: 0.68, height: 0.9 };
const fallbackExitOffsets: Vector[] = [
  { x: 0, y: -0.95 },
  { x: 0, y: 0.95 },
  { x: 0.95, y: 0 },
  { x: -0.95, y: 0 },
  { x: 0.75, y: -0.75 },
  { x: -0.75, y: -0.75 },
  { x: 0.75, y: 0.75 },
  { x: -0.75, y: 0.75 },
];

function distance(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceFromRectangle(position: Vector, center: Vector, width: number, height: number): number {
  const dx = Math.max(Math.abs(position.x - center.x) - width / 2, 0);
  const dy = Math.max(Math.abs(position.y - center.y) - height / 2, 0);
  return Math.hypot(dx, dy);
}

function isInInteractionRange(spot: HidingSpot, position: Vector): boolean {
  if (spot.type === "locker") {
    return distanceFromRectangle(position, spot.position, lockerInteractionSize.width, lockerInteractionSize.height) <= interactionRange;
  }
  return distance(spot.position, position) <= interactionRange;
}

export class HidingSystem {
  constructor(private readonly map: PrisonMap) {}

  nearestSpot(position: Vector): HidingSpot | null {
    return (
      this.map.hidingSpots.find((spot) => isInInteractionRange(spot, position)) ?? null
    );
  }

  toggle(
    player: PlayerState,
    canOccupy: (position: Vector) => boolean = () => true,
    preferredExitDirection: Vector = { x: 0, y: 0 },
    spotBlocked: (spot: HidingSpot) => boolean = () => false,
  ): { entered: string | null; exited: string | null } {
    if (player.hiddenIn) {
      const exited = player.hiddenIn;
      const spot = this.map.hidingSpots.find((candidate) => candidate.id === exited);
      player.hiddenIn = null;
      if (spot) {
        const exitPosition = this.exitPositionFor(spot, canOccupy, preferredExitDirection);
        player.position = exitPosition;
      }
      return { entered: null, exited };
    }

    const spot = this.nearestSpot(player.position);
    if (!spot) {
      return { entered: null, exited: null };
    }
    if (spotBlocked(spot)) {
      return { entered: null, exited: null };
    }

    player.hiddenIn = spot.id;
    player.position = { ...spot.position };
    return { entered: spot.id, exited: null };
  }

  private exitPositionFor(
    spot: HidingSpot,
    canOccupy: (position: Vector) => boolean,
    preferredDirection: Vector,
  ): Vector {
    for (const offset of this.exitOffsetsFor(preferredDirection)) {
      const candidate = {
        x: spot.position.x + offset.x,
        y: spot.position.y + offset.y,
      };
      if (canOccupy(candidate)) {
        return candidate;
      }
    }
    return { ...spot.position };
  }

  private exitOffsetsFor(preferredDirection: Vector): Vector[] {
    const preferred = this.preferredExitOffset(preferredDirection);
    if (!preferred) {
      return fallbackExitOffsets;
    }

    return [
      preferred,
      ...fallbackExitOffsets.filter((offset) => offset.x !== preferred.x || offset.y !== preferred.y),
    ];
  }

  private preferredExitOffset(direction: Vector): Vector | null {
    if (Math.abs(direction.x) > Math.abs(direction.y)) {
      return direction.x > 0 ? { x: 0.95, y: 0 } : { x: -0.95, y: 0 };
    }
    if (Math.abs(direction.y) > 0) {
      return direction.y > 0 ? { x: 0, y: 0.95 } : { x: 0, y: -0.95 };
    }
    return null;
  }
}
