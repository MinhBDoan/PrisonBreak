import type Phaser from "phaser";
import { prisonMap } from "../game/map";
import type {
  Door,
  DoorKeyPickup,
  GuardStateSnapshot,
  HealingPickup,
  HidingSpot,
  SetDressingKind,
  SimulationSnapshot,
  Vector,
  WeaponPickup,
} from "../game/types";

export const renderScale = 64;
const noiseRippleCooldownMs = 500;
const pebbleThrowRange = 4;
const npcPrisonerSpriteScale = 1;

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
  kind: "player" | "guard" | "hidingSpot" | "key" | "exit" | "pebble" | "weaponPickup" | "healingPickup" | "door" | "doorKey";
  x: number;
  y: number;
};

export type CharacterSpecies = "raccoon" | "dog" | "cat" | "possum";

export type CharacterVisualDescriptor = {
  artStyle: "pixel_tactics";
  variant: "readable_hybrid";
  species: CharacterSpecies;
  role: "prisoner" | "guard";
  silhouette: "front" | "side_profile";
  uniformColor: number;
  accentColor: number;
  outlineColor: number;
  playerHighlight: boolean;
};

export type KeyVisualDescriptor = {
  color: number;
  strokeColor: number;
};

export type GuardDescriptor = EntityDescriptor & {
  kind: "guard";
  state: GuardStateSnapshot["state"];
  bodyState: NonNullable<GuardStateSnapshot["bodyState"]>;
  dragging: boolean;
  hiddenBody: boolean;
  health: GuardStateSnapshot["health"];
  suspicion: number;
  spriteFacingX: 1 | -1;
  visual: CharacterVisualDescriptor;
  visionCone: VisionConeDescriptor | null;
};

export type RenderDescriptors = {
  player: EntityDescriptor & { hidden: boolean; visual: CharacterVisualDescriptor };
  guards: GuardDescriptor[];
  hidingSpots: Array<EntityDescriptor & { type: HidingSpot["type"]; bodyOccupied: boolean }>;
  coverObjects: Array<EntityDescriptor & { width: number; height: number }>;
  setDressingObjects: Array<{
    id: string;
    kind: SetDressingKind;
    x: number;
    y: number;
    width: number;
    height: number;
    visual: CharacterVisualDescriptor | null;
  }>;
  pebbles: Array<EntityDescriptor & { collected: boolean }>;
  weaponPickups: Array<EntityDescriptor & { collected: boolean; weaponId: WeaponPickup["weaponId"] }>;
  healingPickups: Array<EntityDescriptor & { collected: boolean; amount: HealingPickup["amount"] }>;
  doors: Array<
    EntityDescriptor & {
      width: number;
      height: number;
      open: boolean;
      unlocked: boolean;
      hingeX: number;
      hingeY: number;
      originX: number;
      originY: number;
      visualRotation: number;
      swingDirection: 1 | -1;
    }
  >;
  doorKeyPickups: Array<EntityDescriptor & { collected: boolean; keyId: DoorKeyPickup["keyId"] } & KeyVisualDescriptor>;
  objectives: {
    key: EntityDescriptor & { collected: boolean } & KeyVisualDescriptor;
    exit: EntityDescriptor & { unlocked: boolean };
  };
  noiseRipples: Array<{ id: string; x: number; y: number; radius: number }>;
};

type RenderObjects = {
  floors: Phaser.GameObjects.Rectangle[];
  walls: Phaser.GameObjects.Rectangle[];
  lights: Phaser.GameObjects.Arc[];
  roomDetails: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc>;
  player?: Phaser.GameObjects.Container;
  guards: Map<string, Phaser.GameObjects.Container>;
  guardSilhouettes: Map<string, CharacterVisualDescriptor["silhouette"]>;
  guardCones: Map<string, Phaser.GameObjects.Graphics>;
  hidingSpots: Map<string, Phaser.GameObjects.Rectangle>;
  coverObjects: Map<string, Phaser.GameObjects.Rectangle>;
  setDressingObjects: Map<string, Phaser.GameObjects.Rectangle | Phaser.GameObjects.Container>;
  pebbles: Map<string, Phaser.GameObjects.Arc>;
  weaponPickups: Map<string, Phaser.GameObjects.Rectangle>;
  healingPickups: Map<string, Phaser.GameObjects.Rectangle>;
  doors: Map<string, Phaser.GameObjects.Rectangle>;
  doorKeyPickups: Map<string, Phaser.GameObjects.Star>;
  aimLine?: Phaser.GameObjects.Graphics;
  aimMarker?: Phaser.GameObjects.Arc;
  throwPebble?: Phaser.GameObjects.Arc;
  bodyDragLine?: Phaser.GameObjects.Graphics;
  combatEffects: Phaser.GameObjects.Graphics[];
  key?: Phaser.GameObjects.Star;
  exit?: Phaser.GameObjects.Rectangle;
  noiseRipple?: Phaser.GameObjects.Arc;
};

function world(value: number): number {
  return value * renderScale;
}

function arcControlPoint(from: Vector, to: Vector, lift: number): Vector {
  return {
    x: (from.x + to.x) / 2,
    y: Math.min(from.y, to.y) - lift,
  };
}

function pointOnQuadratic(from: Vector, control: Vector, to: Vector, progress: number): Vector {
  const inverse = 1 - progress;
  return {
    x: inverse * inverse * from.x + 2 * inverse * progress * control.x + progress * progress * to.x,
    y: inverse * inverse * from.y + 2 * inverse * progress * control.y + progress * progress * to.y,
  };
}

export function clampThrowTarget(origin: Vector, target: Vector, maxRange = pebbleThrowRange): Vector {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance <= maxRange) {
    return { ...target };
  }
  return {
    x: origin.x + (dx / distance) * maxRange,
    y: origin.y + (dy / distance) * maxRange,
  };
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
  if (guard.bodyState && guard.bodyState !== "active") {
    return null;
  }
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

function spriteFacingX(facing: Vector): 1 | -1 {
  return facing.x < 0 ? -1 : 1;
}

function setDressingFill(kind: SetDressingKind): number {
  if (kind === "bars") {
    return 0x9aa7b4;
  }
  if (kind === "cot") {
    return 0x475766;
  }
  if (kind === "bench") {
    return 0x5f4938;
  }
  if (kind === "toilet") {
    return 0xc8d3dc;
  }
  if (kind === "prisoner") {
    return 0x6f8799;
  }
  if (kind === "desk") {
    return 0x4d3f34;
  }
  if (kind === "monitor") {
    return 0x6bd3ff;
  }
  if (kind === "weapon_rack") {
    return 0x8b929a;
  }
  if (kind === "supply_shelf") {
    return 0x5f4938;
  }
  if (kind === "supply_boxes") {
    return 0xd6a04f;
  }
  if (kind === "floor_label") {
    return 0xffd166;
  }
  if (kind === "control_panel") {
    return 0x173142;
  }
  if (kind === "camera_marker") {
    return 0x8b929a;
  }
  if (kind === "status_lights") {
    return 0x6bd3ff;
  }
  return 0xe6d7a8;
}

function setDressingStroke(kind: SetDressingKind): number {
  if (kind === "bars") {
    return 0xd5dde5;
  }
  if (kind === "cot") {
    return 0x7f93a8;
  }
  if (kind === "bench") {
    return 0xaa7a52;
  }
  if (kind === "toilet") {
    return 0xf0f6fa;
  }
  if (kind === "prisoner") {
    return 0xb6c6d2;
  }
  if (kind === "desk") {
    return 0x9b7459;
  }
  if (kind === "monitor") {
    return 0xd7f7ff;
  }
  if (kind === "weapon_rack") {
    return 0xffd166;
  }
  if (kind === "supply_shelf") {
    return 0xb28b63;
  }
  if (kind === "supply_boxes") {
    return 0xffd166;
  }
  if (kind === "floor_label") {
    return 0xfff0b8;
  }
  if (kind === "control_panel") {
    return 0x6bd3ff;
  }
  if (kind === "camera_marker") {
    return 0xd5dde5;
  }
  if (kind === "status_lights") {
    return 0xd7f7ff;
  }
  return 0xffefb0;
}

function setDressingAlpha(kind: SetDressingKind): number {
  if (kind === "monitor") {
    return 0.72;
  }
  if (kind === "floor_label") {
    return 0.58;
  }
  if (kind === "control_panel" || kind === "camera_marker" || kind === "status_lights") {
    return 0.9;
  }
  return kind === "floor_marking" ? 0.35 : 0.86;
}

function playerVisual(): CharacterVisualDescriptor {
  return {
    artStyle: "pixel_tactics",
    variant: "readable_hybrid",
    species: "raccoon",
    role: "prisoner",
    silhouette: "front",
    uniformColor: 0xf28c38,
    accentColor: 0xffd166,
    outlineColor: 0x0b1118,
    playerHighlight: true,
  };
}

function guardSilhouette(facing: Vector): CharacterVisualDescriptor["silhouette"] {
  return facing.y > 0 && Math.abs(facing.y) >= Math.abs(facing.x) ? "front" : "side_profile";
}

function guardVisual(facing: Vector): CharacterVisualDescriptor {
  return {
    artStyle: "pixel_tactics",
    variant: "readable_hybrid",
    species: "dog",
    role: "guard",
    silhouette: guardSilhouette(facing),
    uniformColor: 0x234f86,
    accentColor: 0xc7d1db,
    outlineColor: 0x101820,
    playerHighlight: false,
  };
}

const npcPrisonerSpecies: CharacterSpecies[] = ["raccoon", "cat", "possum"];

function stableSpeciesIndex(id: string): number {
  return [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % npcPrisonerSpecies.length;
}

function npcPrisonerVisual(id: string): CharacterVisualDescriptor {
  return {
    artStyle: "pixel_tactics",
    variant: "readable_hybrid",
    species: npcPrisonerSpecies[stableSpeciesIndex(id)],
    role: "prisoner",
    silhouette: "front",
    uniformColor: 0xf28c38,
    accentColor: 0xffd166,
    outlineColor: 0x0b1118,
    playerHighlight: false,
  };
}

function addPixelRect(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, width, height, color, alpha).setOrigin(0.5);
}

function createPlayerSprite(scene: Phaser.Scene, visual: CharacterVisualDescriptor): Phaser.GameObjects.Container {
  const hasMask = visual.species === "raccoon";
  const skinColor = visual.species === "possum" ? 0xb8aeb6 : visual.species === "cat" ? 0xb9946b : 0x8d9bab;
  const tailColor = visual.species === "possum" ? 0xd2b7c0 : visual.species === "cat" ? 0x9b7654 : 0x6f7d8d;
  const earHeight = visual.species === "cat" ? 10 : visual.species === "possum" ? 9 : 7;
  const earWidth = visual.species === "cat" ? 7 : 6;
  const snoutColor = visual.species === "possum" ? 0xe0c7cf : visual.species === "cat" ? 0xd7b58d : 0xb5c1ca;
  const tailHeight = visual.species === "possum" ? 24 : visual.species === "cat" ? 21 : 18;
  const tailRotation = visual.species === "cat" ? -0.12 : -0.3;
  const shadow = scene.add.ellipse(0, 17, 30, 10, 0x081018, 0.24);
  const tail = addPixelRect(scene, -14, 6, 7, tailHeight, tailColor).setRotation(tailRotation);
  tail.setStrokeStyle(2, visual.outlineColor, 0.9);
  const legLeft = addPixelRect(scene, -5, 21, 6, 10, 0x172231);
  const legRight = addPixelRect(scene, 5, 21, 6, 10, 0x172231);
  const armLeft = addPixelRect(scene, -13, 5, 5, 18, skinColor);
  const armRight = addPixelRect(scene, 13, 5, 5, 18, skinColor);
  const body = addPixelRect(scene, 0, 5, 21, 26, visual.uniformColor);
  body.setStrokeStyle(2, visual.outlineColor, 0.96);
  const stripeA = addPixelRect(scene, 0, -1, 17, 3, visual.accentColor, 0.95);
  const stripeB = addPixelRect(scene, 0, 8, 17, 3, visual.accentColor, 0.95);
  const playerMark = visual.playerHighlight ? addPixelRect(scene, 0, -28, 12, 3, visual.accentColor, 0.98) : null;
  const head = addPixelRect(scene, 0, -15, 20, 17, skinColor);
  head.setStrokeStyle(2, visual.outlineColor, 0.96);
  const earLeft = addPixelRect(scene, -7, -26, earWidth, earHeight, skinColor);
  const earRight = addPixelRect(scene, 7, -26, earWidth, earHeight, skinColor);
  const mask = hasMask ? addPixelRect(scene, 0, -17, 18, 5, 0x202a36) : null;
  const snout = addPixelRect(scene, visual.species === "possum" ? 1 : 0, -11, visual.species === "possum" ? 10 : 8, 4, snoutColor);
  const eyeLeft = addPixelRect(scene, -4, -17, 2, 2, 0xf8fbff);
  const eyeRight = addPixelRect(scene, 4, -17, 2, 2, 0xf8fbff);

  const parts = [
    shadow,
    tail,
    legLeft,
    legRight,
    armLeft,
    armRight,
    body,
    stripeA,
    stripeB,
    head,
    earLeft,
    earRight,
    snout,
    eyeLeft,
    eyeRight,
  ];
  if (mask) {
    parts.push(mask);
  }
  if (playerMark) {
    parts.push(playerMark);
  }

  return scene.add.container(0, 0, parts);
}

function createGuardSprite(scene: Phaser.Scene, visual: CharacterVisualDescriptor): Phaser.GameObjects.Container {
  const skinColor = visual.species === "dog" ? 0xa87955 : 0xd8894d;
  const tailColor = visual.species === "dog" ? 0x7a563d : 0xc36a38;
  const muzzleColor = visual.species === "dog" ? 0xd7b08d : 0xf3b37b;
  if (visual.silhouette === "front") {
    const shadow = scene.add.ellipse(0, 18, 32, 11, 0x081018, 0.28);
    const tail = addPixelRect(scene, 15, 7, 7, 20, tailColor).setRotation(0.32);
    tail.setStrokeStyle(2, visual.outlineColor, 0.9);
    const legLeft = addPixelRect(scene, -6, 23, 7, 10, 0x1c2633);
    const legRight = addPixelRect(scene, 6, 23, 7, 10, 0x1c2633);
    const armLeft = addPixelRect(scene, -15, 6, 6, 19, skinColor);
    const armRight = addPixelRect(scene, 15, 6, 6, 19, skinColor);
    const baton = addPixelRect(scene, 20, 8, 4, 20, 0xc7d1db).setRotation(-0.22);
    const body = addPixelRect(scene, 0, 6, 24, 28, visual.uniformColor);
    body.setStrokeStyle(2, visual.outlineColor, 0.96);
    const shirt = addPixelRect(scene, 0, 0, 16, 8, visual.accentColor, 1);
    const belt = addPixelRect(scene, 0, 11, 23, 4, visual.accentColor);
    const badge = addPixelRect(scene, 7, 1, 4, 5, 0xffd166);
    const head = addPixelRect(scene, 0, -16, 21, 18, skinColor);
    head.setStrokeStyle(2, visual.outlineColor, 0.96);
    const earLeft = addPixelRect(scene, -9, -25, 6, 13, skinColor).setRotation(-0.18);
    const earRight = addPixelRect(scene, 9, -25, 6, 13, skinColor).setRotation(0.18);
    const muzzle = addPixelRect(scene, 0, -10, 13, 6, muzzleColor);
    const nose = addPixelRect(scene, 0, -13, 5, 3, 0x191411);
    const cap = addPixelRect(scene, 0, -26, 21, 5, visual.accentColor);
    cap.setStrokeStyle(2, visual.outlineColor, 0.9);
    const eyeLeft = addPixelRect(scene, -4, -17, 2, 2, 0x101820);
    const eyeRight = addPixelRect(scene, 4, -17, 2, 2, 0x101820);

    return scene.add.container(0, 0, [
      shadow,
      tail,
      legLeft,
      legRight,
      armLeft,
      armRight,
      baton,
      body,
      shirt,
      belt,
      badge,
      head,
      earLeft,
      earRight,
      muzzle,
      nose,
      cap,
      eyeLeft,
      eyeRight,
    ]);
  }

  const shadow = scene.add.ellipse(0, 18, 32, 11, 0x081018, 0.28);
  const tail = addPixelRect(scene, -16, 8, 7, 19, tailColor).setRotation(-0.42);
  tail.setStrokeStyle(2, visual.outlineColor, 0.9);
  const legLeft = addPixelRect(scene, -6, 23, 7, 10, 0x1c2633);
  const legRight = addPixelRect(scene, 6, 23, 7, 10, 0x1c2633);
  const armBack = addPixelRect(scene, -10, 6, 5, 18, skinColor).setRotation(0.08);
  const armFront = addPixelRect(scene, 13, 6, 6, 20, skinColor).setRotation(-0.14);
  const baton = addPixelRect(scene, 19, 9, 4, 22, 0xc7d1db).setRotation(-0.32);
  const body = addPixelRect(scene, 1, 6, 23, 28, visual.uniformColor);
  body.setStrokeStyle(2, visual.outlineColor, 0.96);
  const shirt = addPixelRect(scene, 4, 0, 14, 8, visual.accentColor, 1);
  const belt = addPixelRect(scene, 1, 11, 22, 4, visual.accentColor);
  const badge = addPixelRect(scene, 9, 1, 4, 5, 0xffd166);
  const neck = addPixelRect(scene, -2, -5, 8, 8, skinColor);
  const head = addPixelRect(scene, 3, -17, 19, 17, skinColor);
  head.setStrokeStyle(2, visual.outlineColor, 0.96);
  const earBack = addPixelRect(scene, -3, -27, 6, 11, skinColor).setRotation(-0.18);
  const earFront = addPixelRect(scene, 8, -27, 6, 14, skinColor).setRotation(0.22);
  const muzzle = addPixelRect(scene, 13, -13, 15, 7, muzzleColor);
  const nose = addPixelRect(scene, 21, -14, 5, 3, 0x191411);
  const cap = addPixelRect(scene, 5, -27, 20, 5, visual.accentColor);
  cap.setStrokeStyle(2, visual.outlineColor, 0.9);
  const eye = addPixelRect(scene, 10, -18, 2, 2, 0x101820);

  return scene.add.container(0, 0, [
    shadow,
    tail,
    legLeft,
    legRight,
    armBack,
    armFront,
    baton,
    body,
    shirt,
    belt,
    badge,
    neck,
    head,
    earBack,
    earFront,
    muzzle,
    nose,
    cap,
    eye,
  ]);
}

function destroyContainerWithChildren(container: Phaser.GameObjects.Container): void {
  for (const child of container.list) {
    if (child && typeof (child as { destroy?: () => void }).destroy === "function") {
      (child as { destroy: () => void }).destroy();
    }
  }
  container.destroy();
}

function createSetDressingSprite(
  scene: Phaser.Scene,
  kind: SetDressingKind,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const parts: Phaser.GameObjects.Rectangle[] = [];
  const addPart = (
    x: number,
    y: number,
    partWidth: number,
    partHeight: number,
    color: number,
    stroke = setDressingStroke(kind),
    alpha = setDressingAlpha(kind),
  ): Phaser.GameObjects.Rectangle => {
    const part = addPixelRect(scene, x, y, partWidth, partHeight, color, alpha);
    part.setStrokeStyle(2, stroke, 0.72);
    parts.push(part);
    return part;
  };

  if (kind === "bars") {
    const barCount = Math.max(3, Math.floor(width / 12));
    addPart(0, 0, width, Math.max(4, height), 0x394958, 0x9aa7b4, 0.72);
    for (let index = 0; index < barCount; index += 1) {
      const x = -width / 2 + ((index + 0.5) * width) / barCount;
      addPart(x, 0, 4, Math.max(20, height + 18), 0xb8c6d1, 0xe2e8ef, 0.95);
    }
  } else if (kind === "cot") {
    addPart(0, 0, width, height, 0x3e5364, 0x7f93a8, 0.96);
    addPart(-width * 0.28, -height * 0.15, width * 0.28, height * 0.42, 0xd6dde4, 0xf0f6fa, 0.98);
    addPart(width * 0.12, height * 0.2, width * 0.62, Math.max(5, height * 0.18), 0x2d3b49, 0x6a7d8f, 0.96);
  } else if (kind === "toilet") {
    addPart(0, 2, width * 0.76, height * 0.7, 0xc8d3dc, 0xf0f6fa, 0.98);
    addPart(0, -height * 0.28, width * 0.58, height * 0.32, 0xe9f1f6, 0xffffff, 0.98);
    addPart(0, 3, width * 0.32, height * 0.2, 0x91a8b6, 0xf0f6fa, 0.86);
  } else if (kind === "desk") {
    addPart(0, 0, width, height, 0x4d3f34, 0x9b7459, 0.96);
    addPart(-width * 0.26, height * 0.18, width * 0.18, height * 0.45, 0x2f2721, 0x7a5b45, 0.98);
    addPart(width * 0.26, height * 0.18, width * 0.18, height * 0.45, 0x2f2721, 0x7a5b45, 0.98);
  } else if (kind === "monitor") {
    addPart(0, 0, width, Math.max(10, height), 0x173142, 0x6bd3ff, 0.96);
    addPart(-width * 0.2, 0, width * 0.18, Math.max(5, height * 0.55), 0x75e1ff, 0xd7f7ff, 0.9);
    addPart(width * 0.18, 0, width * 0.22, Math.max(5, height * 0.55), 0x2bc3ff, 0xd7f7ff, 0.88);
  } else if (kind === "weapon_rack") {
    addPart(0, 0, width, Math.max(8, height), 0x3d4650, 0x8b929a, 0.96);
    addPart(-width * 0.22, -height * 0.1, width * 0.12, height + 14, 0xc7d1db, 0xffd166, 0.96).setRotation(-0.28);
    addPart(width * 0.18, -height * 0.05, width * 0.12, height + 14, 0xaab5bf, 0xffd166, 0.96).setRotation(0.22);
  } else if (kind === "supply_shelf") {
    addPart(0, 0, width, height, 0x5f4938, 0xb28b63, 0.92);
    addPart(-width * 0.24, -height * 0.16, width * 0.22, height * 0.24, 0xd6a04f, 0xffd166, 0.94);
    addPart(width * 0.16, -height * 0.12, width * 0.28, height * 0.2, 0x566b7f, 0x90a9bf, 0.94);
    addPart(0, height * 0.22, width * 0.76, Math.max(4, height * 0.12), 0x2f2721, 0x9b7459, 0.9);
  } else if (kind === "supply_boxes") {
    addPart(-width * 0.18, height * 0.08, width * 0.42, height * 0.62, 0xd6a04f, 0xffd166, 0.94);
    addPart(width * 0.18, -height * 0.08, width * 0.36, height * 0.52, 0xb28b63, 0xffd166, 0.92);
    addPart(-width * 0.18, -height * 0.16, width * 0.3, Math.max(4, height * 0.12), 0xffefb0, 0xffd166, 0.78);
    addPart(width * 0.2, -height * 0.28, width * 0.22, Math.max(4, height * 0.1), 0x566b7f, 0x90a9bf, 0.9);
  } else if (kind === "floor_label") {
    addPart(0, 0, width, height, 0xffd166, 0xfff0b8, 0.52);
    addPart(-width * 0.24, 0, width * 0.12, height * 1.5, 0x263341, 0xfff0b8, 0.72);
    addPart(0, 0, width * 0.12, height * 1.5, 0x263341, 0xfff0b8, 0.72);
    addPart(width * 0.24, 0, width * 0.12, height * 1.5, 0x263341, 0xfff0b8, 0.72);
  } else if (kind === "control_panel") {
    addPart(0, 0, width, height, 0x173142, 0x6bd3ff, 0.94);
    addPart(-width * 0.22, -height * 0.08, width * 0.2, height * 0.28, 0x75e1ff, 0xd7f7ff, 0.9);
    addPart(width * 0.08, -height * 0.08, width * 0.16, height * 0.22, 0x2bc3ff, 0xd7f7ff, 0.88);
    addPart(width * 0.28, height * 0.22, width * 0.12, height * 0.12, 0xff5f56, 0xffb3b0, 0.92);
  } else if (kind === "camera_marker") {
    addPart(0, 0, width, height, 0x3d4650, 0xd5dde5, 0.94);
    addPart(width * 0.16, 0, width * 0.34, height * 0.52, 0x111820, 0x6bd3ff, 0.96);
    addPart(-width * 0.28, -height * 0.2, width * 0.16, height * 0.2, 0x8b929a, 0xd5dde5, 0.9);
    addPart(-width * 0.32, height * 0.24, width * 0.18, height * 0.18, 0x6bd3ff, 0xd7f7ff, 0.78);
  } else if (kind === "status_lights") {
    addPart(0, 0, width, height, 0x173142, 0x6bd3ff, 0.86);
    addPart(-width * 0.26, 0, width * 0.12, height * 1.35, 0x6bd3ff, 0xd7f7ff, 0.9);
    addPart(0, 0, width * 0.12, height * 1.35, 0xffd166, 0xfff0b8, 0.9);
    addPart(width * 0.26, 0, width * 0.12, height * 1.35, 0xff5f56, 0xffb3b0, 0.92);
  } else if (kind === "cell_grime") {
    addPart(-width * 0.28, -height * 0.12, width * 0.32, Math.max(4, height * 0.38), 0x0b1118, 0x465b6c, 0.34);
    addPart(width * 0.08, height * 0.05, width * 0.22, Math.max(4, height * 0.28), 0x394958, 0x6a7d8f, 0.28);
    addPart(width * 0.34, -height * 0.04, width * 0.12, Math.max(4, height * 0.24), 0x8b5f3c, 0xb28b63, 0.24);
  } else if (kind === "prisoner_shadow") {
    addPart(0, 0, width, height, 0x05080c, 0x05080c, 0.38);
    addPart(width * 0.18, 0, width * 0.42, Math.max(3, height * 0.55), 0x111820, 0x05080c, 0.22);
  } else if (kind === "corridor_stripe") {
    addPart(0, 0, width, height, 0xffd166, 0xfff0b8, 0.28);
    addPart(-width * 0.32, 0, width * 0.12, height * 1.4, 0x6a7d8f, 0xd5dde5, 0.24);
    addPart(width * 0.32, 0, width * 0.12, height * 1.4, 0x6a7d8f, 0xd5dde5, 0.24);
  } else if (kind === "zone_sign") {
    addPart(0, 0, width, height, 0x173142, 0x6bd3ff, 0.88);
    addPart(-width * 0.24, 0, width * 0.12, height * 0.72, 0x6bd3ff, 0xd7f7ff, 0.82);
    addPart(width * 0.08, 0, width * 0.34, Math.max(4, height * 0.18), 0xffd166, 0xfff0b8, 0.72);
  } else if (kind === "supply_marker") {
    addPart(0, 0, width, height, 0xcfffd5, 0x72d18b, 0.52);
    addPart(0, 0, width * 0.18, height * 1.5, 0x72d18b, 0xcfffd5, 0.78);
    addPart(0, 0, width * 0.64, height * 0.34, 0x72d18b, 0xcfffd5, 0.78);
  } else if (kind === "exit_marker") {
    addPart(-width * 0.22, 0, width * 0.22, height, 0x57d7ff, 0xd7f7ff, 0.58).setRotation(0.42);
    addPart(0, 0, width * 0.22, height, 0x57d7ff, 0xd7f7ff, 0.66).setRotation(0.42);
    addPart(width * 0.22, 0, width * 0.22, height, 0x57d7ff, 0xd7f7ff, 0.58).setRotation(0.42);
  } else if (kind === "surveillance_marks") {
    addPart(0, 0, width, Math.max(4, height * 0.12), 0x6bd3ff, 0xd7f7ff, 0.3);
    addPart(-width * 0.24, height * 0.18, width * 0.32, Math.max(4, height * 0.1), 0xff5f56, 0xffb3b0, 0.26).setRotation(-0.28);
    addPart(width * 0.24, height * 0.18, width * 0.32, Math.max(4, height * 0.1), 0xff5f56, 0xffb3b0, 0.26).setRotation(0.28);
  } else {
    addPart(0, 0, width, height, setDressingFill(kind), setDressingStroke(kind), setDressingAlpha(kind));
    addPart(0, -height * 0.2, width * 0.75, Math.max(4, height * 0.18), setDressingStroke(kind), setDressingFill(kind), 0.65);
  }

  return scene.add.container(0, 0, parts);
}

function addRoomDetails(scene: Phaser.Scene): Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc> {
  const details: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc> = [];
  const addRect = (
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    alpha: number,
    depth = 0,
    strokeColor?: number,
  ): Phaser.GameObjects.Rectangle => {
    const rect = scene.add.rectangle(world(x), world(y), world(width), world(height), color, alpha);
    rect.setDepth(depth);
    if (strokeColor !== undefined) {
      rect.setStrokeStyle(1, strokeColor, 0.45);
    }
    details.push(rect);
    return rect;
  };
  const addGlow = (x: number, y: number, radius: number, color: number, alpha: number): Phaser.GameObjects.Arc => {
    const glow = scene.add.circle(world(x), world(y), world(radius), color, alpha).setBlendMode("ADD");
    glow.setDepth(1);
    details.push(glow);
    return glow;
  };

  addRect(5, 2.48, 8.2, 2.95, 0x1f2c38, 0.78, 0, 0x465b6c);
  addRect(5, 3.92, 8.2, 0.12, 0x0b1118, 0.72, 4);
  addRect(14.9, 7.34, 4.2, 2.7, 0x1a2430, 0.76, 0, 0x405568);
  addRect(20.75, 2.5, 7.5, 3.1, 0x172433, 0.68, 0, 0x465b6c);
  addRect(13, 7.3, 0.12, 2.4, 0x081018, 0.52, 4);
  addRect(17.12, 7.3, 0.12, 2.4, 0x081018, 0.52, 4);
  addRect(15.05, 8.72, 4.0, 0.12, 0x081018, 0.6, 4);
  addRect(14.2, 7.9, 0.76, 0.08, 0xffd166, 0.36, 2);
  addRect(16.08, 7.9, 0.62, 0.06, 0xffd166, 0.34, 2);
  addRect(15.72, 6.38, 0.48, 0.05, 0xb28b63, 0.42, 2);

  for (const x of [2.5, 5.35, 7.8, 10.5, 13.5, 16.5, 19.5, 22.5]) {
    addRect(x, 9.02, 0.05, 1.85, 0x465b6c, 0.24, 0);
  }
  for (const y of [5.02, 6.98, 8.98]) {
    addRect(16.5, y, 15.0, 0.05, 0x465b6c, 0.22, 0);
  }
  for (const x of [2.2, 4.9, 7.4]) {
    addRect(x, 1.42, 0.34, 0.05, 0x8b5f3c, 0.22, 1);
    addRect(x + 0.28, 1.58, 0.22, 0.04, 0x6a7d8f, 0.18, 1);
  }
  for (const x of [10.5, 12.5, 14.5, 18.5, 20.5, 22.5]) {
    addRect(x, 4.28, 0.52, 0.05, 0x6a7d8f, 0.26, 1);
  }
  addRect(13.4, 7.62, 0.48, 0.06, 0xcfffd5, 0.18, 1);
  addRect(24.05, 9.5, 0.42, 0.08, 0x57d7ff, 0.28, 1);
  addRect(23.65, 9.5, 0.28, 0.08, 0x57d7ff, 0.22, 1);
  addRect(18.55, 1.75, 0.36, 0.07, 0x75e1ff, 0.42, 2);
  addRect(20.85, 2.08, 0.24, 0.06, 0x75e1ff, 0.42, 2);
  addRect(23.25, 2.95, 0.16, 0.06, 0xff5f56, 0.46, 2);

  addGlow(20.2, 2.1, 1.1, 0x6bd3ff, 0.12);
  addGlow(15.1, 7.35, 0.85, 0xffd166, 0.07);
  addGlow(16.05, 7.85, 0.52, 0xffd166, 0.06);
  addGlow(18.55, 1.75, 0.72, 0x6bd3ff, 0.08);

  return details;
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
        visual: playerVisual(),
      },
      guards: snapshot.guards.map((guard) => ({
        id: guard.id,
        kind: "guard",
        x: world(guard.position.x),
        y: world(guard.position.y),
        state: guard.state,
        bodyState: guard.bodyState ?? "active",
        dragging: snapshot.player.draggingBodyId === guard.id,
        hiddenBody: Boolean(guard.bodyHiddenIn),
        health: guard.health ? { ...guard.health } : undefined,
        suspicion: guard.suspicion,
        spriteFacingX: spriteFacingX(guard.facing),
        visual: guardVisual(guard.facing),
        visionCone: guardCone(guard),
      })),
      hidingSpots: prisonMap.hidingSpots.map((spot) => ({
        id: spot.id,
        kind: "hidingSpot",
        type: spot.type,
        x: world(spot.position.x),
        y: world(spot.position.y),
        bodyOccupied: snapshot.guards.some((guard) => guard.bodyHiddenIn === spot.id),
      })),
      coverObjects: prisonMap.coverObjects.map((cover) => ({
        id: cover.id,
        kind: "hidingSpot",
        x: world(cover.position.x),
        y: world(cover.position.y),
        width: world(cover.width),
        height: world(cover.height),
      })),
      setDressingObjects: prisonMap.setDressingObjects.map((object) => ({
        id: object.id,
        kind: object.kind,
        x: world(object.position.x),
        y: world(object.position.y),
        width: world(object.width),
        height: world(object.height),
        visual: object.kind === "prisoner" ? npcPrisonerVisual(object.id) : null,
      })),
      pebbles: snapshot.pebbles.map((pebble) => ({
        id: pebble.id,
        kind: "pebble",
        x: world(pebble.position.x),
        y: world(pebble.position.y),
        collected: pebble.collected,
      })),
      weaponPickups: snapshot.weaponPickups.map((pickup) => ({
        id: pickup.id,
        kind: "weaponPickup",
        x: world(pickup.position.x),
        y: world(pickup.position.y),
        weaponId: pickup.weaponId,
        collected: pickup.collected,
      })),
      healingPickups: snapshot.healingPickups.map((pickup) => ({
        id: pickup.id,
        kind: "healingPickup",
        x: world(pickup.position.x),
        y: world(pickup.position.y),
        amount: pickup.amount,
        collected: pickup.collected,
      })),
      doors: snapshot.doors.map((door) => ({
        id: door.id,
        kind: "door",
        x: world(door.position.x),
        y: world(door.position.y),
        width: world(door.width),
        height: world(door.height),
        open: door.open,
        unlocked: door.unlocked,
        hingeX: world(door.position.x - door.width / 2),
        hingeY: world(door.position.y),
        originX: 0,
        originY: 0.5,
        visualRotation: door.open ? (Math.PI / 2) * door.swingDirection : 0,
        swingDirection: door.swingDirection,
      })),
      doorKeyPickups: snapshot.doorKeyPickups.map((pickup) => ({
        id: pickup.id,
        kind: "doorKey",
        x: world(pickup.position.x),
        y: world(pickup.position.y),
        keyId: pickup.keyId,
        color: 0xffd166,
        strokeColor: 0xfff0b8,
        collected: pickup.collected,
      })),
      objectives: {
        key: {
          id: prisonMap.key.id,
          kind: "key",
          x: world(prisonMap.key.position.x),
          y: world(prisonMap.key.position.y),
          color: 0x57d7ff,
          strokeColor: 0xd7f7ff,
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
        const tileCenterX = world(x + 0.5);
        const tileCenterY = world(y + 0.5);
        const rect = scene.add
          .rectangle(
            tileCenterX,
            tileCenterY,
            renderScale,
            renderScale,
            isWall ? 0x111820 : 0x263341,
          )
          .setStrokeStyle(1, isWall ? 0x334151 : 0x34495c, isWall ? 0.75 : 0.25);
        if (isWall) {
          walls.push(rect);
          walls.push(
            scene.add
              .rectangle(tileCenterX, world(y + 0.16), renderScale, world(0.14), 0x526171, 0.52)
              .setDepth(2),
          );
          if (prisonMap.tiles[y + 1]?.[x] !== "#") {
            walls.push(
              scene.add
                .rectangle(tileCenterX, world(y + 0.92), renderScale, world(0.16), 0x071018, 0.42)
                .setDepth(2),
            );
          }
        } else {
          floors.push(rect);
          if ((x * 7 + y * 11) % 9 === 0) {
            floors.push(
              scene.add
                .rectangle(
                  tileCenterX + world(0.18),
                  tileCenterY - world(0.14),
                  world(0.42),
                  world(0.05),
                  0x2d3a47,
                  0.34,
                )
                .setDepth(1),
            );
          }
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
    const roomDetails = addRoomDetails(scene);

    this.objects = {
      floors,
      walls,
      lights,
      roomDetails,
      guards: new Map(),
      guardSilhouettes: new Map(),
      guardCones: new Map(),
      hidingSpots: new Map(),
      coverObjects: new Map(),
      setDressingObjects: new Map(),
      pebbles: new Map(),
      weaponPickups: new Map(),
      healingPickups: new Map(),
      doors: new Map(),
      doorKeyPickups: new Map(),
      aimLine: undefined,
      aimMarker: undefined,
      throwPebble: undefined,
      bodyDragLine: undefined,
      combatEffects: [],
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
      objects.player = createPlayerSprite(scene, descriptors.player.visual);
      objects.player.setDepth(18);
    }
    objects.player.setPosition(descriptors.player.x, descriptors.player.y);
    objects.player.setAlpha(descriptors.player.hidden ? 0.42 : 1);

    for (const spot of descriptors.hidingSpots) {
      const color = spot.bodyOccupied ? 0x5b3240 : spot.type === "locker" ? 0x566b7f : 0x151a22;
      const existing =
        objects.hidingSpots.get(spot.id) ??
        scene.add.rectangle(spot.x, spot.y, 34, 46, color, spot.type === "locker" ? 0.9 : 0.72);
      existing.setPosition(spot.x, spot.y);
      existing.setFillStyle(color, spot.bodyOccupied ? 0.94 : spot.type === "locker" ? 0.9 : 0.72);
      existing.setStrokeStyle(
        2,
        spot.bodyOccupied ? 0xff7a8a : spot.type === "locker" ? 0x90a9bf : 0x58616d,
        spot.bodyOccupied ? 0.8 : 0.45,
      );
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

    for (const object of descriptors.setDressingObjects) {
      if (object.visual) {
        const existing = objects.setDressingObjects.get(object.id);
        const container =
          existing && "list" in existing
            ? existing
            : createPlayerSprite(scene, object.visual);
        container.setPosition(object.x, object.y);
        container.setScale(npcPrisonerSpriteScale);
        container.setDepth(5);
        objects.setDressingObjects.set(object.id, container);
        continue;
      }

      const existing = objects.setDressingObjects.get(object.id);
      const prop =
        existing && "list" in existing
          ? existing
          : createSetDressingSprite(scene, object.kind, object.width, object.height);
      prop.setPosition(object.x, object.y);
      prop.setDepth(3);
      objects.setDressingObjects.set(object.id, prop);
    }

    for (const pebble of descriptors.pebbles) {
      const existing =
        objects.pebbles.get(pebble.id) ??
        scene.add.circle(pebble.x, pebble.y, 6, 0xb8aea1, 0.95);
      existing.setPosition(pebble.x, pebble.y);
      existing.setVisible(!pebble.collected);
      existing.setStrokeStyle(2, 0xefe1c8, 0.4);
      objects.pebbles.set(pebble.id, existing);
    }

    for (const pickup of descriptors.weaponPickups) {
      const existing =
        objects.weaponPickups.get(pickup.id) ??
        scene.add.rectangle(pickup.x, pickup.y, 26, 12, 0x9aa7b4, 0.96);
      existing.setPosition(pickup.x, pickup.y);
      existing.setVisible(!pickup.collected);
      existing.setRotation(-0.18);
      existing.setStrokeStyle(2, 0xffd166, 0.78);
      objects.weaponPickups.set(pickup.id, existing);
    }

    for (const pickup of descriptors.healingPickups) {
      const existing =
        objects.healingPickups.get(pickup.id) ??
        scene.add.rectangle(pickup.x, pickup.y, 24, 16, 0xcfffd5, 0.96);
      existing.setPosition(pickup.x, pickup.y);
      existing.setVisible(!pickup.collected);
      existing.setStrokeStyle(2, 0x72d18b, 0.85);
      objects.healingPickups.set(pickup.id, existing);
    }

    for (const door of descriptors.doors) {
      const existing =
        objects.doors.get(door.id) ??
        scene.add.rectangle(door.hingeX, door.hingeY, door.width, door.height, 0x8f5f34, 0.98);
      existing.setOrigin(door.originX, door.originY);
      existing.setPosition(door.hingeX, door.hingeY);
      existing.setSize(door.width, door.height);
      existing.setRotation(door.visualRotation);
      existing.setFillStyle(door.open ? 0x51745a : door.unlocked ? 0x8f5f34 : 0x5a3a28, door.open ? 0.72 : 0.98);
      existing.setStrokeStyle(3, door.unlocked ? 0xffd166 : 0xc45a4a, 0.86);
      objects.doors.set(door.id, existing);
    }

    for (const pickup of descriptors.doorKeyPickups) {
      const existing =
        objects.doorKeyPickups.get(pickup.id) ??
        scene.add.star(pickup.x, pickup.y, 5, 5, 13, 0xffd166, 0.96);
      existing.setPosition(pickup.x, pickup.y);
      existing.setVisible(!pickup.collected);
      existing.setFillStyle(pickup.color, 0.96);
      existing.setStrokeStyle(2, pickup.strokeColor, 0.75);
      objects.doorKeyPickups.set(pickup.id, existing);
    }

    if (!objects.key) {
      objects.key = scene.add.star(
        descriptors.objectives.key.x,
        descriptors.objectives.key.y,
        5,
        8,
        18,
        descriptors.objectives.key.color,
      );
    }
    objects.key.setVisible(!descriptors.objectives.key.collected);
    objects.key.setFillStyle(descriptors.objectives.key.color, 0.96);
    objects.key.setStrokeStyle(3, descriptors.objectives.key.strokeColor, 0.86);

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
    const draggedGuard = descriptors.guards.find((guard) => guard.dragging && !guard.hiddenBody);
    if (draggedGuard) {
      const line = objects.bodyDragLine ?? scene.add.graphics();
      objects.bodyDragLine = line;
      line.clear();
      line.setDepth(32);
      line.lineStyle(5, 0x8bd3ff, 0.45);
      line.beginPath();
      line.moveTo(descriptors.player.x, descriptors.player.y);
      line.lineTo(draggedGuard.x, draggedGuard.y);
      line.strokePath();
    } else {
      objects.bodyDragLine?.clear();
    }

    for (const guard of descriptors.guards) {
      liveGuardIds.add(guard.id);
      let container = objects.guards.get(guard.id);
      if (container && objects.guardSilhouettes.get(guard.id) !== guard.visual.silhouette) {
        destroyContainerWithChildren(container);
        objects.guards.delete(guard.id);
        objects.guardSilhouettes.delete(guard.id);
        container = undefined;
      }
      if (!container) {
        container = createGuardSprite(scene, guard.visual);
        container.setDepth(18);
        objects.guards.set(guard.id, container);
        objects.guardSilhouettes.set(guard.id, guard.visual.silhouette);
      }
      container.setPosition(guard.x, guard.y);
      container.setVisible(!guard.hiddenBody);
      container.setAlpha(guard.bodyState === "active" ? (guard.state === "search" ? 0.88 : 1) : 0.68);
      container.setRotation(guard.bodyState === "dead" ? Math.PI / 2 : guard.bodyState === "knocked_out" ? -Math.PI / 2 : 0);
      const guardScale = guard.dragging ? 0.92 : 1;
      container.setScale(guard.spriteFacingX * guardScale, guardScale);

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
        destroyContainerWithChildren(container);
        objects.guards.delete(id);
        objects.guardSilhouettes.delete(id);
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

  showPebbleAim(scene: Phaser.Scene, origin: Vector, target: Vector, maxRange = pebbleThrowRange): Vector {
    if (!this.objects) {
      this.mount(scene);
    }
    const objects = this.objects as RenderObjects;
    const landing = clampThrowTarget(origin, target, maxRange);
    const originX = world(origin.x);
    const originY = world(origin.y);
    const landingX = world(landing.x);
    const landingY = world(landing.y);
    const control = arcControlPoint({ x: originX, y: originY }, { x: landingX, y: landingY }, 42);
    const arrowStart = pointOnQuadratic(
      { x: originX, y: originY },
      control,
      { x: landingX, y: landingY },
      0.88,
    );
    const angle = Math.atan2(landingY - arrowStart.y, landingX - arrowStart.x);
    const arrowLength = 14;

    const aimLine = objects.aimLine ?? scene.add.graphics();
    objects.aimLine = aimLine;
    aimLine.clear();
    aimLine.lineStyle(3, 0xffd166, 0.72);
    aimLine.beginPath();
    aimLine.moveTo(originX, originY);
    for (let point = 1; point <= 18; point += 1) {
      const arcPoint = pointOnQuadratic(
        { x: originX, y: originY },
        control,
        { x: landingX, y: landingY },
        point / 18,
      );
      aimLine.lineTo(arcPoint.x, arcPoint.y);
    }
    aimLine.strokePath();
    aimLine.lineStyle(2, 0xfff0b8, 0.86);
    aimLine.beginPath();
    aimLine.moveTo(landingX, landingY);
    aimLine.lineTo(
      landingX - Math.cos(angle - Math.PI / 5) * arrowLength,
      landingY - Math.sin(angle - Math.PI / 5) * arrowLength,
    );
    aimLine.moveTo(landingX, landingY);
    aimLine.lineTo(
      landingX - Math.cos(angle + Math.PI / 5) * arrowLength,
      landingY - Math.sin(angle + Math.PI / 5) * arrowLength,
    );
    aimLine.strokePath();
    aimLine.setDepth(20);

    const marker = objects.aimMarker ?? scene.add.circle(landingX, landingY, 10, 0xffd166, 0.12);
    objects.aimMarker = marker;
    marker
      .setPosition(landingX, landingY)
      .setVisible(true)
      .setAlpha(0.9)
      .setDepth(21)
      .setStrokeStyle(2, 0xffd166, 0.75);

    return landing;
  }

  hidePebbleAim(): void {
    if (!this.objects) {
      return;
    }
    this.objects.aimLine?.clear();
    this.objects.aimMarker?.setVisible(false);
  }

  spawnPebbleThrow(
    scene: Phaser.Scene,
    origin: Vector,
    landing: Vector,
    onLanded: () => void,
  ): void {
    if (!this.objects) {
      return;
    }
    const pebble = this.objects.throwPebble ?? scene.add.circle(0, 0, 5, 0xd8c3a5, 1);
    this.objects.throwPebble = pebble;
    scene.tweens.killTweensOf?.(pebble);
    const start = { x: world(origin.x), y: world(origin.y) };
    const end = { x: world(landing.x), y: world(landing.y) };
    const control = arcControlPoint(start, end, 42);
    const flight = { progress: 0 };
    pebble
      .setPosition(start.x, start.y)
      .setScale(1)
      .setAlpha(1)
      .setVisible(true)
      .setDepth(30);
    scene.tweens.add({
      targets: flight,
      progress: 1,
      duration: 280,
      ease: "Sine.easeOut",
      onUpdate: () => {
        const position = pointOnQuadratic(start, control, end, flight.progress);
        pebble.setPosition(position.x, position.y).setScale(1 + Math.sin(flight.progress * Math.PI) * 0.55);
      },
      onComplete: () => {
        pebble.setVisible(false).setScale(1);
        onLanded();
      },
    });
  }

  spawnCombatFeedback(
    scene: Phaser.Scene,
    origin: Vector,
    target: Vector,
    kind: "melee" | "gun" | "guard_melee",
  ): void {
    if (!this.objects) {
      this.mount(scene);
    }
    const objects = this.objects as RenderObjects;
    const graphic = scene.add.graphics();
    objects.combatEffects.push(graphic);
    graphic.setDepth(35);

    const originX = world(origin.x);
    const originY = world(origin.y);
    const targetX = world(target.x);
    const targetY = world(target.y);
    const angle = Math.atan2(targetY - originY, targetX - originX);

    if (kind === "gun") {
      graphic.lineStyle(4, 0xfff0b8, 0.95);
      graphic.beginPath();
      graphic.moveTo(originX + Math.cos(angle) * 18, originY + Math.sin(angle) * 18);
      graphic.lineTo(targetX, targetY);
      graphic.strokePath();
      graphic.fillStyle(0xffd166, 0.95);
      graphic.fillCircle(originX + Math.cos(angle) * 22, originY + Math.sin(angle) * 22, 9);
    } else if (kind === "guard_melee") {
      const radius = 32;
      const reachX = originX + Math.cos(angle) * 28;
      const reachY = originY + Math.sin(angle) * 28;
      graphic.lineStyle(8, 0xff6b4a, 0.9);
      graphic.beginPath();
      graphic.arc(reachX, reachY, radius, angle - Math.PI / 2.8, angle + Math.PI / 2.8, false);
      graphic.strokePath();
      graphic.fillStyle(0xff2f2f, 0.34);
      graphic.fillCircle(targetX, targetY, 16);
    } else {
      const radius = 38;
      graphic.lineStyle(7, 0xffd166, 0.86);
      graphic.beginPath();
      graphic.arc(originX, originY, radius, angle - Math.PI / 3, angle + Math.PI / 3, false);
      graphic.strokePath();
      graphic.lineStyle(2, 0xfff0b8, 0.9);
      graphic.beginPath();
      graphic.arc(originX, originY, radius + 8, angle - Math.PI / 4, angle + Math.PI / 4, false);
      graphic.strokePath();
    }

    scene.tweens.add({
      targets: graphic,
      alpha: 0,
      duration: kind === "gun" ? 120 : kind === "guard_melee" ? 260 : 180,
      ease: "Sine.easeOut",
      onComplete: () => {
        graphic.destroy();
        objects.combatEffects = objects.combatEffects.filter((effect) => effect !== graphic);
      },
    });
  }

  spawnHealFeedback(scene: Phaser.Scene, position: Vector): void {
    if (!this.objects) {
      this.mount(scene);
    }
    const objects = this.objects as RenderObjects;
    const glow = scene.add.circle(world(position.x), world(position.y), 26, 0x72d18b, 0.38);
    objects.combatEffects.push(glow as unknown as Phaser.GameObjects.Graphics);
    glow.setDepth(34);
    glow.setStrokeStyle(4, 0xcfffd5, 0.92);
    scene.tweens.add({
      targets: glow,
      radius: 52,
      alpha: 0,
      duration: 1000,
      ease: "Sine.easeOut",
      onComplete: () => {
        glow.destroy();
        objects.combatEffects = objects.combatEffects.filter((effect) => effect !== (glow as unknown as Phaser.GameObjects.Graphics));
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
