import { isWall } from "./map";
import type { CoverObject, GuardStateSnapshot, PlayerState, PrisonMap, Vector } from "./types";

const visionRange = 2.5;
const fieldOfViewDot = 0.45;

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

function dot(a: Vector, b: Vector): number {
  return a.x * b.x + a.y * b.y;
}

function isInsideCover(cover: CoverObject, position: Vector): boolean {
  const halfWidth = cover.width / 2;
  const halfHeight = cover.height / 2;
  return (
    position.x >= cover.position.x - halfWidth &&
    position.x <= cover.position.x + halfWidth &&
    position.y >= cover.position.y - halfHeight &&
    position.y <= cover.position.y + halfHeight
  );
}

export class DetectionSystem {
  constructor(private readonly map: PrisonMap) {}

  canSeePlayer(guard: GuardStateSnapshot, player: PlayerState): boolean {
    if (player.hiddenIn) {
      return false;
    }

    const toPlayer = {
      x: player.position.x - guard.position.x,
      y: player.position.y - guard.position.y,
    };
    const distance = Math.hypot(toPlayer.x, toPlayer.y);
    if (distance > visionRange) {
      return false;
    }
    if (distance < 0.6) {
      return true;
    }
    if (dot(normalize(guard.facing), normalize(toPlayer)) < fieldOfViewDot) {
      return false;
    }

    return this.hasClearRay(guard.position, player.position);
  }

  hasClearRay(from: Vector, to: Vector): boolean {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance * 8));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const position = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      };
      if (isWall(this.map, position) || this.map.coverObjects.some((cover) => isInsideCover(cover, position))) {
        return false;
      }
    }
    return true;
  }
}
