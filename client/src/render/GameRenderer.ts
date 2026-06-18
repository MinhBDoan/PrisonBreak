import type Phaser from "phaser";
import { prisonMap } from "../game/map";
import type { GuardStateSnapshot, HidingSpot, SimulationSnapshot, Vector } from "../game/types";

export const renderScale = 64;
const noiseRippleCooldownMs = 500;

export type VisionConeDescriptor = {
  x: number;
  y: number;
  rotation: number;
  radius: number;
  angle: number;
  color: number;
  alpha: number;
};

export type EntityDescriptor = {
  id: string;
  kind: "player" | "guard" | "hidingSpot" | "key" | "exit";
  x: number;
  y: number;
};

export type GuardDescriptor = EntityDescriptor & {
  kind: "guard";
  state: GuardStateSnapshot["state"];
  suspicion: number;
  visionCone: VisionConeDescriptor | null;
};

export type RenderDescriptors = {
  player: EntityDescriptor & { hidden: boolean };
  guards: GuardDescriptor[];
  hidingSpots: Array<EntityDescriptor & { type: HidingSpot["type"] }>;
  coverObjects: Array<EntityDescriptor & { width: number; height: number }>;
  objectives: {
    key: EntityDescriptor & { collected: boolean };
    exit: EntityDescriptor & { unlocked: boolean };
  };
  noiseRipples: Array<{ id: string; x: number; y: number; radius: number }>;
};

type RenderObjects = {
  floors: Phaser.GameObjects.Rectangle[];
  walls: Phaser.GameObjects.Rectangle[];
  lights: Phaser.GameObjects.Arc[];
  player?: Phaser.GameObjects.Arc;
  guards: Map<string, Phaser.GameObjects.Container>;
  guardCones: Map<string, Phaser.GameObjects.Graphics>;
  hidingSpots: Map<string, Phaser.GameObjects.Rectangle>;
  coverObjects: Map<string, Phaser.GameObjects.Rectangle>;
  key?: Phaser.GameObjects.Star;
  exit?: Phaser.GameObjects.Rectangle;
  noiseRipple?: Phaser.GameObjects.Arc;
};

function world(value: number): number {
  return value * renderScale;
}

function angleOf(vector: Vector): number {
  return Math.atan2(vector.y, vector.x);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolateChannel(from: number, to: number, progress: number): number {
  return Math.round(from + (to - from) * progress);
}

function interpolateColor(from: number, to: number, progress: number): number {
  const amount = clamp01(progress);
  const red = interpolateChannel((from >> 16) & 0xff, (to >> 16) & 0xff, amount);
  const green = interpolateChannel((from >> 8) & 0xff, (to >> 8) & 0xff, amount);
  const blue = interpolateChannel(from & 0xff, to & 0xff, amount);
  return (red << 16) | (green << 8) | blue;
}

function guardCone(guard: GuardStateSnapshot): VisionConeDescriptor | null {
  const captureProgress = guard.state === "chase" ? guard.captureProgress : 0;
  const alertColor = interpolateColor(0xffc857, 0xff5f56, captureProgress);
  return {
    x: world(guard.position.x),
    y: world(guard.position.y),
    rotation: angleOf(guard.facing),
    radius: world(3.2),
    angle: Math.PI / 4,
    color: alertColor,
    alpha: guard.state === "patrol" && guard.suspicion <= 0
      ? 0.08
      : guard.state === "chase"
        ? 0.2 + clamp01(captureProgress) * 0.12
        : 0.18,
  };
}

export class GameRenderer {
  private objects: RenderObjects | null = null;
  private lastNoiseRippleAtMs = Number.NEGATIVE_INFINITY;

  describe(snapshot: SimulationSnapshot): RenderDescriptors {
    return {
      player: {
        id: "player",
        kind: "player",
        x: world(snapshot.player.position.x),
        y: world(snapshot.player.position.y),
        hidden: snapshot.player.hiddenIn !== null,
      },
      guards: snapshot.guards.map((guard) => ({
        id: guard.id,
        kind: "guard",
        x: world(guard.position.x),
        y: world(guard.position.y),
        state: guard.state,
        suspicion: guard.suspicion,
        visionCone: guardCone(guard),
      })),
      hidingSpots: prisonMap.hidingSpots.map((spot) => ({
        id: spot.id,
        kind: "hidingSpot",
        type: spot.type,
        x: world(spot.position.x),
        y: world(spot.position.y),
      })),
      coverObjects: prisonMap.coverObjects.map((cover) => ({
        id: cover.id,
        kind: "hidingSpot",
        x: world(cover.position.x),
        y: world(cover.position.y),
        width: world(cover.width),
        height: world(cover.height),
      })),
      objectives: {
        key: {
          id: prisonMap.key.id,
          kind: "key",
          x: world(prisonMap.key.position.x),
          y: world(prisonMap.key.position.y),
          collected: snapshot.objectives.hasKey,
        },
        exit: {
          id: prisonMap.exit.id,
          kind: "exit",
          x: world(prisonMap.exit.position.x),
          y: world(prisonMap.exit.position.y),
          unlocked: snapshot.objectives.exitUnlocked,
        },
      },
      noiseRipples: [],
    };
  }

  mount(scene: Phaser.Scene): void {
    const floors: Phaser.GameObjects.Rectangle[] = [];
    const walls: Phaser.GameObjects.Rectangle[] = [];
    const lights: Phaser.GameObjects.Arc[] = [];

    for (let y = 0; y < prisonMap.height; y += 1) {
      for (let x = 0; x < prisonMap.width; x += 1) {
        const isWall = prisonMap.tiles[y][x] === "#";
        const rect = scene.add
          .rectangle(
            world(x + 0.5),
            world(y + 0.5),
            renderScale,
            renderScale,
            isWall ? 0x111820 : 0x263341,
          )
          .setStrokeStyle(1, isWall ? 0x334151 : 0x34495c, isWall ? 0.75 : 0.25);
        if (isWall) {
          walls.push(rect);
        } else {
          floors.push(rect);
        }
      }
    }

    for (const point of [
      { x: 8.5, y: 4.5 },
      { x: 22.5, y: 2.5 },
      { x: 22.5, y: 9.5 },
    ]) {
      lights.push(
        scene.add
          .circle(world(point.x), world(point.y), world(1.25), 0xffb35c, 0.09)
          .setBlendMode("ADD"),
      );
    }

    this.objects = {
      floors,
      walls,
      lights,
      guards: new Map(),
      guardCones: new Map(),
      hidingSpots: new Map(),
      coverObjects: new Map(),
      noiseRipple: undefined,
    };
  }

  render(scene: Phaser.Scene, snapshot: SimulationSnapshot): void {
    if (!this.objects) {
      this.mount(scene);
    }
    const objects = this.objects as RenderObjects;
    const descriptors = this.describe(snapshot);

    if (!objects.player) {
      objects.player = scene.add.circle(descriptors.player.x, descriptors.player.y, 18, 0x8bd3ff);
      objects.player.setStrokeStyle(3, 0xd7f4ff, 0.9);
    }
    objects.player.setPosition(descriptors.player.x, descriptors.player.y);
    objects.player.setAlpha(descriptors.player.hidden ? 0.42 : 1);

    for (const spot of descriptors.hidingSpots) {
      const color = spot.type === "locker" ? 0x566b7f : 0x151a22;
      const existing =
        objects.hidingSpots.get(spot.id) ??
        scene.add.rectangle(spot.x, spot.y, 34, 46, color, spot.type === "locker" ? 0.9 : 0.72);
      existing.setPosition(spot.x, spot.y);
      existing.setStrokeStyle(2, spot.type === "locker" ? 0x90a9bf : 0x58616d, 0.45);
      objects.hidingSpots.set(spot.id, existing);
    }

    for (const cover of descriptors.coverObjects) {
      const existing =
        objects.coverObjects.get(cover.id) ??
        scene.add.rectangle(cover.x, cover.y, cover.width, cover.height, 0x6b5845, 0.95);
      existing.setPosition(cover.x, cover.y);
      existing.setSize(cover.width, cover.height);
      existing.setFillStyle(0x6b5845, 0.95);
      existing.setStrokeStyle(2, 0xb28b63, 0.75);
      objects.coverObjects.set(cover.id, existing);
    }

    if (!objects.key) {
      objects.key = scene.add.star(
        descriptors.objectives.key.x,
        descriptors.objectives.key.y,
        5,
        8,
        18,
        0xffd166,
      );
    }
    objects.key.setVisible(!descriptors.objectives.key.collected);

    if (!objects.exit) {
      objects.exit = scene.add.rectangle(
        descriptors.objectives.exit.x,
        descriptors.objectives.exit.y,
        40,
        52,
        0x7a4f2a,
      );
    }
    objects.exit.setFillStyle(descriptors.objectives.exit.unlocked ? 0x5fa76c : 0x7a4f2a, 1);
    objects.exit.setStrokeStyle(3, descriptors.objectives.exit.unlocked ? 0xa6e3af : 0xffb35c, 0.8);

    const liveGuardIds = new Set<string>();
    for (const guard of descriptors.guards) {
      liveGuardIds.add(guard.id);
      let container = objects.guards.get(guard.id);
      if (!container) {
        const body = scene.add.rectangle(0, 0, 32, 38, 0xf08a4b);
        body.setStrokeStyle(2, 0xffcf99, 0.85);
        const head = scene.add.circle(0, -23, 11, 0xffc78f);
        container = scene.add.container(guard.x, guard.y, [body, head]);
        objects.guards.set(guard.id, container);
      }
      container.setPosition(guard.x, guard.y);
      container.setAlpha(guard.state === "search" ? 0.88 : 1);

      let cone = objects.guardCones.get(guard.id);
      if (!cone) {
        cone = scene.add.graphics();
        cone.setDepth(1);
        objects.guardCones.set(guard.id, cone);
      }
      cone.clear();
      if (guard.visionCone) {
        cone.fillStyle(guard.visionCone.color, guard.visionCone.alpha);
        cone.slice(
          guard.visionCone.x,
          guard.visionCone.y,
          guard.visionCone.radius,
          guard.visionCone.rotation - guard.visionCone.angle,
          guard.visionCone.rotation + guard.visionCone.angle,
          false,
        );
        cone.fillPath();
      }
    }

    for (const [id, container] of objects.guards) {
      if (!liveGuardIds.has(id)) {
        container.destroy();
        objects.guards.delete(id);
        objects.guardCones.get(id)?.destroy();
        objects.guardCones.delete(id);
      }
    }

    this.clearFinishedRipple();
  }

  followCamera(scene: Phaser.Scene, snapshot: SimulationSnapshot): void {
    scene.cameras.main.setBounds(0, 0, world(prisonMap.width), world(prisonMap.height));
    scene.cameras.main.centerOn(world(snapshot.player.position.x), world(snapshot.player.position.y));
  }

  spawnNoiseRipple(scene: Phaser.Scene, position: Vector, radius: number): void {
    if (!this.objects) {
      return;
    }
    const now = typeof scene.time?.now === "number" ? scene.time.now : Date.now();
    if (now - this.lastNoiseRippleAtMs < noiseRippleCooldownMs) {
      this.objects.noiseRipple?.setPosition(world(position.x), world(position.y));
      return;
    }
    this.lastNoiseRippleAtMs = now;

    const ripple = this.objects.noiseRipple ?? scene.add.circle(0, 0, 10, 0x8bd3ff, 0);
    this.objects.noiseRipple = ripple;
    scene.tweens.killTweensOf?.(ripple);
    ripple
      .setPosition(world(position.x), world(position.y))
      .setRadius(10)
      .setAlpha(0.65)
      .setStrokeStyle(3, 0x8bd3ff, 0.65);
    scene.tweens.add({
      targets: ripple,
      radius: world(radius),
      alpha: 0,
      duration: 680,
      ease: "Sine.easeOut",
      onComplete: () => {
        ripple.setAlpha(0).setRadius(10);
      },
    });
  }

  private clearFinishedRipple(): void {
    if (!this.objects) {
      return;
    }
    if (this.objects.noiseRipple && !this.objects.noiseRipple.active) {
      this.objects.noiseRipple = undefined;
    }
  }
}
