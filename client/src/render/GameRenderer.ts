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
  silhouette: "front" | "side_profile" | "back";
  uniformColor: number;
  accentColor: number;
  outlineColor: number;
  playerHighlight: boolean;
};

export type PlayerVisualFacing = "up" | "down" | "left" | "right";

export type PlayerRenderState = {
  facing: PlayerVisualFacing;
  walkPhase: 0 | 1;
  moving: boolean;
};

const defaultPlayerRenderState: PlayerRenderState = {
  facing: "down",
  walkPhase: 0,
  moving: false,
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
  playerSilhouette?: CharacterVisualDescriptor["silhouette"];
  playerStepping?: boolean;
  guards: Map<string, Phaser.GameObjects.Container>;
  guardSilhouettes: Map<string, CharacterVisualDescriptor["silhouette"]>;
  guardCones: Map<string, Phaser.GameObjects.Graphics>;
  hidingSpots: Map<string, Phaser.GameObjects.Container>;
  lockerOccupied: Map<string, boolean>;
  coverObjects: Map<string, Phaser.GameObjects.Container>;
  coverSizes: Map<string, { width: number; height: number }>;
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

function playerSilhouette(facing: PlayerVisualFacing): CharacterVisualDescriptor["silhouette"] {
  if (facing === "up") {
    return "back";
  }
  if (facing === "down") {
    return "front";
  }
  return "side_profile";
}

function playerScaleX(facing: PlayerVisualFacing): 1 | -1 {
  return facing === "left" ? -1 : 1;
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

type PixelToken = "." | "O" | "M" | "D" | "F" | "G" | "W" | "S" | "H";
type PaintedPixelToken = Exclude<PixelToken, ".">;

type PixelMatrixSprite = {
  rows: readonly string[];
  palette: Record<PaintedPixelToken, number>;
  alpha?: Partial<Record<PaintedPixelToken, number>>;
};

function createPlayerSprite(
  scene: Phaser.Scene,
  visual: CharacterVisualDescriptor,
  playerState: PlayerRenderState = defaultPlayerRenderState,
): Phaser.GameObjects.Container {
  const hasMask = visual.species === "raccoon";
  const isBack = visual.silhouette === "back";
  const isSide = visual.silhouette === "side_profile";
  const stepOffset = playerState.moving && playerState.walkPhase === 1 ? 2 : 0;
  const skinColor = visual.species === "possum" ? 0xb8aeb6 : visual.species === "cat" ? 0xb9946b : 0x8d9bab;
  const tailColor = visual.species === "possum" ? 0xd2b7c0 : visual.species === "cat" ? 0x9b7654 : 0x6f7d8d;
  const earHeight = visual.species === "cat" ? 10 : visual.species === "possum" ? 9 : 7;
  const earWidth = visual.species === "cat" ? 7 : 6;
  const snoutColor = visual.species === "possum" ? 0xe0c7cf : visual.species === "cat" ? 0xd7b58d : 0xb5c1ca;
  const tailHeight = visual.species === "possum" ? 24 : visual.species === "cat" ? 21 : 18;
  const tailRotation = visual.species === "cat" ? -0.12 : -0.3;
  const shadow = scene.add.ellipse(0, 17, 30, 10, 0x081018, 0.24);
  const tail = addPixelRect(scene, isSide ? -17 : isBack ? 0 : -14, isBack ? 8 : 6, isBack ? 6 : 7, tailHeight, tailColor).setRotation(
    isBack ? 0 : tailRotation,
  );
  tail.setStrokeStyle(2, visual.outlineColor, 0.9);
  const legLeft = addPixelRect(scene, -5 - stepOffset, 21, 6, 10 + stepOffset, 0x172231);
  const legRight = addPixelRect(scene, 5 + stepOffset, 21, 6, 10 - stepOffset, 0x172231);
  const armLeft = addPixelRect(scene, -13, 5 + stepOffset, 5, 18 - stepOffset, skinColor);
  const armRight = addPixelRect(scene, 13, 5 - stepOffset, 5, 18 + stepOffset, skinColor);
  const body = addPixelRect(scene, isSide ? 2 : 0, 5, isSide ? 17 : 21, 26, visual.uniformColor);
  body.setStrokeStyle(2, visual.outlineColor, 0.96);
  const stripeA = addPixelRect(scene, isSide ? 2 : 0, -1, isSide ? 13 : 17, 3, visual.accentColor, 0.95);
  const stripeB = addPixelRect(scene, isSide ? 2 : 0, 8, isSide ? 13 : 17, 3, visual.accentColor, 0.95);
  const chestHighlight = addPixelRect(scene, isSide ? 8 : 7, 2, isSide ? 5 : 4, 13, isBack ? 0x6a7d8f : 0xfff0b8, 0.92);
  const shoulderChipLeft = addPixelRect(scene, -12, -5, 4, 5, isBack ? 0x6a7d8f : 0xffd166, 0.92);
  const shoulderChipRight = addPixelRect(scene, 12, -5, 4, 5, isBack ? 0x6a7d8f : 0xffd166, 0.92);
  const headRim = addPixelRect(scene, isSide ? 3 : 0, -24, isSide ? 10 : 14, 3, isBack ? 0xd7f7ff : 0xf8fbff, 0.72);
  const playerMark = visual.playerHighlight ? addPixelRect(scene, 0, -28, 12, 3, visual.accentColor, 0.98) : null;
  const head = addPixelRect(scene, isSide ? 3 : 0, -15, isSide ? 16 : 20, 17, skinColor);
  head.setStrokeStyle(2, visual.outlineColor, 0.96);
  const earLeft = addPixelRect(scene, isSide ? -3 : -7, -26, earWidth, earHeight, skinColor);
  const earRight = addPixelRect(scene, isSide ? 8 : 7, -26, earWidth, earHeight, skinColor);
  const mask = hasMask && !isBack ? addPixelRect(scene, isSide ? 5 : 0, -17, isSide ? 10 : 18, 5, 0x202a36) : null;
  const snout = isBack
    ? null
    : addPixelRect(scene, isSide ? 11 : visual.species === "possum" ? 1 : 0, -11, isSide ? 7 : visual.species === "possum" ? 10 : 8, 4, snoutColor);
  const eyeLeft = isBack ? null : addPixelRect(scene, isSide ? 8 : -4, -17, 2, 2, 0xf8fbff);
  const eyeRight = isBack || isSide ? null : addPixelRect(scene, 4, -17, 2, 2, 0xf8fbff);
  const backCollar = isBack ? addPixelRect(scene, 0, -8, 16, 4, 0x6a7d8f, 0.95) : null;
  const sideFaceCue = isSide ? addPixelRect(scene, 12, -9, 4, 5, 0xfff0b8, 0.9) : null;
  const sideRimChip = isSide ? addPixelRect(scene, 4, -22, 5, 3, 0x75e1ff, 0.82) : null;

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
    chestHighlight,
    shoulderChipLeft,
    shoulderChipRight,
    headRim,
    head,
    earLeft,
    earRight,
  ];
  if (snout) {
    parts.push(snout);
  }
  if (eyeLeft) {
    parts.push(eyeLeft);
  }
  if (eyeRight) {
    parts.push(eyeRight);
  }
  if (mask) {
    parts.push(mask);
  }
  if (backCollar) {
    parts.push(backCollar);
  }
  if (sideFaceCue) {
    parts.push(sideFaceCue);
  }
  if (sideRimChip) {
    parts.push(sideRimChip);
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
    const radioGlow = addPixelRect(scene, -8, 1, 4, 5, 0x8bd3ff, 0.9);
    const cuffLeft = addPixelRect(scene, -15, 17, 5, 4, 0x6bd3ff, 0.82);
    const cuffRight = addPixelRect(scene, 15, 17, 5, 4, 0x6bd3ff, 0.82);
    const visorChip = addPixelRect(scene, 0, -23, 13, 3, 0x8bd3ff, 0.68);
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
      radioGlow,
      cuffLeft,
      cuffRight,
      head,
      earLeft,
      earRight,
      muzzle,
      nose,
      cap,
      visorChip,
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
  const radioGlow = addPixelRect(scene, 1, 1, 4, 5, 0x8bd3ff, 0.9);
  const cuffBack = addPixelRect(scene, -10, 17, 5, 4, 0x6bd3ff, 0.78);
  const cuffFront = addPixelRect(scene, 13, 18, 5, 4, 0x6bd3ff, 0.82);
  const visorChip = addPixelRect(scene, 8, -24, 12, 3, 0x8bd3ff, 0.68);
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
    radioGlow,
    cuffBack,
    cuffFront,
    neck,
    head,
    earBack,
    earFront,
    muzzle,
    nose,
    cap,
    visorChip,
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

function createLockerSprite(scene: Phaser.Scene, bodyOccupied: boolean): Phaser.GameObjects.Container {
  const outline = bodyOccupied ? 0xff7a8a : 0x90a9bf;
  const body = addPixelRect(scene, 0, 0, 30, 44, bodyOccupied ? 0x5b3240 : 0x566b7f, bodyOccupied ? 0.94 : 0.9);
  body.setStrokeStyle(2, outline, bodyOccupied ? 0.8 : 0.55);
  const leftDoorOffset = addPixelRect(scene, -8, -1, 11, 39, bodyOccupied ? 0x74384a : 0x48596c, 0.82);
  const doorSplit = addPixelRect(scene, 0, 0, 3, 40, bodyOccupied ? 0xff7a8a : 0x293746, 0.85);
  const topLip = addPixelRect(scene, 1, -23, 24, 4, bodyOccupied ? 0xff7a8a : 0x90a9bf, 0.62);
  const ventTop = addPixelRect(scene, -6, -13, 9, 3, 0xd7f7ff, 0.72);
  const ventBottom = addPixelRect(scene, 6, -7, 9, 3, 0x90a9bf, 0.72);
  const handle = addPixelRect(scene, 9, 3, 3, 10, bodyOccupied ? 0xffd166 : 0xfff0b8, 0.9);
  const base = addPixelRect(scene, 0, 23, 26, 5, 0x101820, 0.55);
  const notchLeft = addPixelRect(scene, -17, -18, 4, 8, 0x101820, 0.34);
  const notchRight = addPixelRect(scene, 17, 15, 4, 8, 0x101820, 0.34);

  return scene.add.container(0, 0, [
    body,
    leftDoorOffset,
    doorSplit,
    topLip,
    ventTop,
    ventBottom,
    handle,
    base,
    notchLeft,
    notchRight,
  ]);
}

function createShadowHidingSpotSprite(scene: Phaser.Scene, bodyOccupied: boolean): Phaser.GameObjects.Container {
  const shadow = addPixelRect(scene, 0, 2, 34, 20, bodyOccupied ? 0x5b3240 : 0x151a22, bodyOccupied ? 0.82 : 0.72);
  shadow.setStrokeStyle(2, bodyOccupied ? 0xff7a8a : 0x58616d, bodyOccupied ? 0.62 : 0.45);
  const backEdge = addPixelRect(scene, -6, -8, 22, 7, bodyOccupied ? 0x74384a : 0x0b1118, 0.42);
  const sideGap = addPixelRect(scene, 15, 2, 6, 15, 0x05090e, 0.36);

  return scene.add.container(0, 0, [shadow, backEdge, sideGap]);
}

function createCoverSprite(scene: Phaser.Scene, width: number, height: number): Phaser.GameObjects.Container {
  const body = addPixelRect(scene, 0, 0, width, height, 0x6b5845, 0.95);
  body.setStrokeStyle(2, 0xb28b63, 0.75);
  const top = addPixelRect(scene, 0, -height * 0.32, width * 0.84, Math.max(5, height * 0.18), 0x8a6a4c, 0.9);
  const boardChip = addPixelRect(scene, -width * 0.18, -height * 0.45, width * 0.28, Math.max(4, height * 0.12), 0xfff0b8, 0.66);
  const strap = addPixelRect(scene, 0, 0, Math.max(5, width * 0.12), height * 0.86, 0xfff0b8, 0.72);
  const leftCap = addPixelRect(scene, -width * 0.44, height * 0.18, Math.max(5, width * 0.12), height * 0.35, 0x3b3028, 0.88);
  const rightCap = addPixelRect(scene, width * 0.44, -height * 0.1, Math.max(5, width * 0.12), height * 0.35, 0x3b3028, 0.88);
  const cornerNotch = addPixelRect(scene, width * 0.34, height * 0.32, Math.max(4, width * 0.1), Math.max(4, height * 0.16), 0x101820, 0.4);
  const shadow = addPixelRect(scene, 0, height * 0.5, width * 0.76, Math.max(4, height * 0.14), 0x101820, 0.38);

  return scene.add.container(0, 0, [body, top, boardChip, strap, leftCap, rightCap, cornerNotch, shadow]);
}

function createSetDressingSprite(
  scene: Phaser.Scene,
  kind: SetDressingKind,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const createPixelMatrixSprite = (sprite: PixelMatrixSprite): Phaser.GameObjects.Container => {
    const rowCount = sprite.rows.length;
    const columnCount = Math.max(...sprite.rows.map((row) => row.length));
    const pixelSize = Math.max(1, Math.floor(Math.min(width / columnCount, height / rowCount)));
    const totalWidth = columnCount * pixelSize;
    const totalHeight = rowCount * pixelSize;
    const xStart = -totalWidth / 2 + pixelSize / 2;
    const yStart = -totalHeight / 2 + pixelSize / 2;
    const matrixParts: Phaser.GameObjects.Rectangle[] = [];

    sprite.rows.forEach((row, rowIndex) => {
      const tokens = [...row.padEnd(columnCount, ".")];
      let columnIndex = 0;
      while (columnIndex < tokens.length) {
        const token = tokens[columnIndex] as PixelToken;
        if (token === ".") {
          columnIndex += 1;
          continue;
        }

        let runLength = 1;
        while (tokens[columnIndex + runLength] === token) {
          runLength += 1;
        }

        const painted = token;
        const part = addPixelRect(
          scene,
          xStart + columnIndex * pixelSize + ((runLength - 1) * pixelSize) / 2,
          yStart + rowIndex * pixelSize,
          pixelSize * runLength,
          pixelSize,
          sprite.palette[painted],
          sprite.alpha?.[painted] ?? 1,
        );
        if (painted === "O" || painted === "M" || painted === "S") {
          part.setStrokeStyle(1, 0x0b1118, painted === "O" ? 0.92 : 0.42);
        }
        matrixParts.push(part);
        columnIndex += runLength;
      }
    });

    return scene.add.container(0, 0, matrixParts);
  };

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
  const notch = (x: number, y: number, partWidth: number, partHeight: number, color: number, alpha = 0.96) =>
    addPart(x, y, partWidth, partHeight, color, setDressingStroke(kind), alpha);
  const cap = (x: number, y: number, partWidth: number, partHeight: number, color: number) =>
    addPart(x, y, partWidth, partHeight, color, setDressingStroke(kind), 0.9);

  if (kind === "bars") {
    addPart(0, -height * 0.42, width, Math.max(4, height * 0.22), 0xd5dde5, 0xeef6ff, 0.9);
    addPart(0, height * 0.42, width, Math.max(4, height * 0.22), 0x6a7d8f, 0xd5dde5, 0.88);
    for (const offset of [-0.36, -0.12, 0.12, 0.36]) {
      addPart(width * offset, 0, Math.max(3, width * 0.06), height * 1.12, 0x9aa7b4, 0xd5dde5, 0.92);
    }
    cap(-width * 0.48, 0, Math.max(3, width * 0.08), height * 1.2, 0x44515f);
    cap(width * 0.48, 0, Math.max(3, width * 0.08), height * 1.2, 0x44515f);
    addPart(0, -height * 0.48, width * 0.78, Math.max(3, height * 0.08), 0x0b1118, 0xd5dde5, 0.82);
    for (const offset of [-0.36, -0.12, 0.12, 0.36]) {
      addPart(width * offset, -height * 0.2, Math.max(3, width * 0.05), height * 0.18, 0xb8c6d1, 0xeef6ff, 0.94);
      addPart(width * offset, height * 0.22, Math.max(3, width * 0.05), height * 0.18, 0xb8c6d1, 0xeef6ff, 0.94);
    }
  } else if (kind === "cot") {
    addPart(0, 0, width * 0.92, height * 0.7, 0x475766, 0x7f93a8, 0.96);
    addPart(-width * 0.26, -height * 0.08, width * 0.28, height * 0.42, 0xd7f7ff, 0xf8fbff, 0.92);
    addPart(width * 0.17, height * 0.02, width * 0.42, height * 0.44, 0xf28c38, 0xffd166, 0.95);
    notch(-width * 0.42, -height * 0.4, width * 0.12, height * 0.2, 0x172231, 0.9);
    notch(width * 0.42, -height * 0.4, width * 0.12, height * 0.2, 0x172231, 0.9);
    notch(-width * 0.42, height * 0.42, width * 0.12, height * 0.18, 0x172231, 0.9);
    notch(width * 0.42, height * 0.42, width * 0.12, height * 0.18, 0x172231, 0.9);
    addPart(0, height * 0.46, width * 0.74, Math.max(3, height * 0.12), 0x101820, 0x293341, 0.5);
    addPart(0, -height * 0.34, width * 0.82, Math.max(3, height * 0.08), 0x7f93a8, 0xd6dde4, 0.88);
    addPart(0, height * 0.28, width * 0.78, Math.max(3, height * 0.08), 0x7f93a8, 0xd6dde4, 0.88);
    addPart(-width * 0.34, -height * 0.04, width * 0.1, height * 0.3, 0xd6dde4, 0xf8fbff, 0.86);
    addPart(width * 0.02, -height * 0.02, width * 0.1, height * 0.36, 0x2d3b49, 0x7f93a8, 0.88);
    addPart(width * 0.32, -height * 0.02, width * 0.1, height * 0.34, 0x2d3b49, 0x7f93a8, 0.88);
    for (const xOffset of [-0.34, -0.18, 0.02, 0.18, 0.34]) {
      addPart(width * xOffset, height * 0.2, width * 0.07, height * 0.08, 0xf28c38, 0xffd166, 0.88);
    }
    for (const xOffset of [-0.34, -0.12, 0.12, 0.34]) {
      addPart(width * xOffset, -height * 0.24, width * 0.07, height * 0.08, 0xd7f7ff, 0xf8fbff, 0.82);
    }
    for (const xOffset of [-0.44, 0.44]) {
      addPart(width * xOffset, 0, width * 0.07, height * 0.52, 0x111820, 0x7f93a8, 0.85);
    }
    addPart(width * 0.43, height * 0.2, width * 0.08, height * 0.08, 0xffd166, 0xfff0b8, 0.8);
    addPart(-width * 0.43, height * 0.2, width * 0.08, height * 0.08, 0xffd166, 0xfff0b8, 0.8);
    addPart(0, 0, width * 0.06, height * 0.56, 0x7f93a8, 0xd6dde4, 0.7);
  } else if (kind === "toilet") {
    addPart(0, -height * 0.28, width * 0.58, height * 0.34, 0xc8d3dc, 0xf0f6fa, 0.96);
    addPart(0, height * 0.08, width * 0.76, height * 0.5, 0xf0f6fa, 0x6a7d8f, 0.96);
    addPart(0, height * 0.08, width * 0.38, height * 0.24, 0x6a7d8f, 0xd7f7ff, 0.76);
    addPart(-width * 0.26, height * 0.36, width * 0.18, height * 0.2, 0x44515f, 0x9aa7b4, 0.85);
    addPart(width * 0.28, -height * 0.44, width * 0.16, height * 0.22, 0xd7f7ff, 0xf0f6fa, 0.82);
    addPart(-width * 0.34, -height * 0.12, width * 0.18, height * 0.24, 0xf0f6fa, 0xd7f7ff, 0.88);
    addPart(0, height * 0.5, width * 0.6, Math.max(3, height * 0.1), 0x101820, 0x293341, 0.45);
    addPart(0, -height * 0.28, width * 0.34, height * 0.12, 0xe9f1f6, 0xf8fbff, 0.88);
    addPart(0, height * 0.02, width * 0.5, height * 0.12, 0xe9f1f6, 0xf8fbff, 0.9);
    addPart(0, height * 0.18, width * 0.3, height * 0.12, 0x91a8b6, 0xd7f7ff, 0.82);
    for (const xOffset of [-0.24, 0.24]) {
      addPart(width * xOffset, height * 0.1, width * 0.12, height * 0.32, 0xe9f1f6, 0xf8fbff, 0.84);
      addPart(width * xOffset, -height * 0.34, width * 0.1, height * 0.16, 0x91a8b6, 0xd7f7ff, 0.78);
    }
    for (const xOffset of [-0.26, 0, 0.26]) {
      addPart(width * xOffset, height * 0.36, width * 0.08, height * 0.12, 0x111820, 0x6a7d8f, 0.72);
    }
    for (const yOffset of [-0.42, -0.2, 0.28]) {
      addPart(width * 0.38, height * yOffset, width * 0.08, height * 0.12, 0xe9f1f6, 0xf8fbff, 0.74);
      addPart(-width * 0.38, height * yOffset, width * 0.08, height * 0.12, 0x91a8b6, 0xd7f7ff, 0.72);
    }
    addPart(0, -height * 0.48, width * 0.18, height * 0.08, 0x6a7d8f, 0xd7f7ff, 0.72);
    addPart(0, height * 0.42, width * 0.18, height * 0.08, 0xf0f6fa, 0xd7f7ff, 0.76);
    addPart(width * 0.18, height * 0.44, width * 0.1, height * 0.08, 0x91a8b6, 0xd7f7ff, 0.72);
    addPart(-width * 0.18, height * 0.44, width * 0.1, height * 0.08, 0xe9f1f6, 0xf8fbff, 0.72);
  } else if (kind === "desk") {
    addPart(0, 0, width, height, 0x4d3f34, 0x9b7459, 0.96);
    addPart(0, -height * 0.24, width * 0.86, Math.max(5, height * 0.18), 0x173142, 0x6bd3ff, 0.88);
    addPart(-width * 0.26, height * 0.2, width * 0.18, height * 0.45, 0x2f2721, 0x7a5b45, 0.98);
    addPart(width * 0.26, height * 0.2, width * 0.18, height * 0.45, 0x2f2721, 0x7a5b45, 0.98);
    addPart(-width * 0.18, -height * 0.3, width * 0.16, Math.max(4, height * 0.16), 0x75e1ff, 0xd7f7ff, 0.82);
    addPart(width * 0.18, -height * 0.3, width * 0.16, Math.max(4, height * 0.16), 0xff5f56, 0xffb3b0, 0.82);
    addPart(0, -height * 0.3, width * 0.12, Math.max(4, height * 0.14), 0x6bd3ff, 0xd7f7ff, 0.8);
  } else if (kind === "monitor") {
    addPart(0, 0, width, height * 0.82, 0x173142, 0x6bd3ff, 0.95);
    addPart(-width * 0.26, -height * 0.08, width * 0.26, height * 0.36, 0x75e1ff, 0xd7f7ff, 0.92);
    addPart(0, -height * 0.08, width * 0.22, height * 0.36, 0x2bc3ff, 0xd7f7ff, 0.86);
    addPart(width * 0.25, -height * 0.08, width * 0.2, height * 0.36, 0xd7f7ff, 0xf8fbff, 0.8);
    addPart(width * 0.36, height * 0.2, width * 0.1, height * 0.16, 0xff5f56, 0xffb3b0, 0.82);
    addPart(0, height * 0.48, width * 0.54, Math.max(4, height * 0.12), 0x111820, 0x3d4650, 0.88);
    for (const xOffset of [-0.34, -0.2, -0.06, 0.08, 0.22, 0.36]) {
      addPart(width * xOffset, height * 0.28, width * 0.06, height * 0.12, 0xd7f7ff, 0xf8fbff, 0.74);
    }
    for (const xOffset of [-0.32, -0.16, 0, 0.16, 0.32]) {
      addPart(width * xOffset, -height * 0.3, width * 0.08, height * 0.08, 0x75e1ff, 0xd7f7ff, 0.8);
    }
    for (const xOffset of [-0.28, -0.1, 0.1, 0.28]) {
      addPart(width * xOffset, height * 0.06, width * 0.08, height * 0.1, 0x173142, 0x6bd3ff, 0.86);
    }
    addPart(-width * 0.42, 0, width * 0.06, height * 0.66, 0x173142, 0x6bd3ff, 0.9);
    addPart(width * 0.42, 0, width * 0.06, height * 0.66, 0x173142, 0x6bd3ff, 0.9);
  } else if (kind === "weapon_rack") {
    addPart(0, 0, width * 0.9, height * 0.72, 0x3d4650, 0xffd166, 0.88);
    addPart(0, -height * 0.3, width * 0.82, Math.max(4, height * 0.12), 0xffd166, 0xfff0b8, 0.78);
    addPart(0, height * 0.24, width * 0.82, Math.max(4, height * 0.12), 0x111820, 0xc7d1db, 0.9);
    addPart(-width * 0.28, -height * 0.02, Math.min(6, width * 0.08), height * 0.62, 0xc7d1db, 0xfff0b8, 0.96);
    addPart(-width * 0.06, 0, Math.min(6, width * 0.08), height * 0.7, 0x8090a0, 0xfff0b8, 0.94).setRotation(0.22);
    addPart(width * 0.18, 0, Math.min(6, width * 0.08), height * 0.66, 0xc7d1db, 0xfff0b8, 0.96).setRotation(-0.18);
    addPart(width * 0.34, -height * 0.1, Math.min(5, width * 0.07), height * 0.44, 0xffd166, 0xfff0b8, 0.9);
    notch(-width * 0.4, height * 0.12, width * 0.1, height * 0.18, 0x111820, 0.72);
    for (const xOffset of [-0.34, -0.18, 0, 0.18, 0.34]) {
      addPart(width * xOffset, -height * 0.34, width * 0.07, height * 0.14, 0xffd166, 0xfff0b8, 0.78);
      addPart(width * xOffset, height * 0.34, width * 0.07, height * 0.14, 0x111820, 0xc7d1db, 0.84);
    }
    addPart(-width * 0.42, 0, width * 0.06, height * 0.62, 0x3d4650, 0xffd166, 0.9);
    addPart(width * 0.42, 0, width * 0.06, height * 0.62, 0x3d4650, 0xffd166, 0.9);
    addPart(-width * 0.18, height * 0.04, Math.min(6, width * 0.08), height * 0.4, 0xc7d1db, 0xfff0b8, 0.94).setRotation(-0.28);
    addPart(width * 0.04, -height * 0.02, Math.min(6, width * 0.08), height * 0.36, 0xc7d1db, 0xfff0b8, 0.94).setRotation(0.28);
    addPart(-width * 0.32, 0, 4, 14, 0xc7d1db, 0xfff0b8, 0.96);
    addPart(width * 0.28, 0, 4, 14, 0xffd166, 0xfff0b8, 0.9);
  } else if (kind === "supply_shelf") {
    addPart(0, 0, width, height, 0x5f4938, 0xb28b63, 0.86);
    addPart(0, -height * 0.34, width * 0.88, Math.max(4, height * 0.12), 0x2f2721, 0xb28b63, 0.94);
    addPart(0, 0, width * 0.9, Math.max(4, height * 0.1), 0x2f2721, 0xb28b63, 0.94);
    addPart(0, height * 0.34, width * 0.88, Math.max(4, height * 0.12), 0x2f2721, 0xb28b63, 0.94);
    addPart(-width * 0.43, 0, width * 0.08, height * 0.88, 0x2f2721, 0xb28b63, 0.96);
    addPart(width * 0.43, 0, width * 0.08, height * 0.88, 0x2f2721, 0xb28b63, 0.96);
    addPart(-width * 0.25, -height * 0.18, width * 0.18, height * 0.2, 0xd6a04f, 0xfff0b8, 0.9);
    addPart(0, -height * 0.18, width * 0.16, height * 0.2, 0x566b7f, 0xd7f7ff, 0.88);
    addPart(width * 0.24, -height * 0.18, width * 0.18, height * 0.2, 0xcfffd5, 0x8fd694, 0.78);
    addPart(-width * 0.22, height * 0.18, width * 0.22, height * 0.22, 0xfff0b8, 0xd6a04f, 0.82);
    addPart(width * 0.16, height * 0.18, width * 0.24, height * 0.22, 0x8fd694, 0xcfffd5, 0.84);
    for (const xOffset of [-0.3, -0.1, 0.12, 0.32]) {
      addPart(width * xOffset, -height * 0.34, width * 0.08, height * 0.12, 0xb28b63, 0xfff0b8, 0.72);
      addPart(width * xOffset, 0, width * 0.08, height * 0.1, 0xb28b63, 0xfff0b8, 0.72);
      addPart(width * xOffset, height * 0.34, width * 0.08, height * 0.12, 0xb28b63, 0xfff0b8, 0.72);
    }
    for (const xOffset of [-0.34, -0.12, 0.1, 0.3]) {
      addPart(width * xOffset, height * 0.02, width * 0.1, height * 0.12, 0xcfffd5, 0x8fd694, 0.74);
    }
    addPart(-width * 0.34, height * 0.2, width * 0.1, height * 0.12, 0x566b7f, 0xd7f7ff, 0.82);
    addPart(width * 0.34, height * 0.2, width * 0.1, height * 0.12, 0xd6a04f, 0xfff0b8, 0.82);
    addPart(0, -height * 0.02, width * 0.08, height * 0.82, 0x2f2721, 0xb28b63, 0.88);
  } else if (kind === "supply_boxes") {
    addPart(-width * 0.2, -height * 0.16, width * 0.48, height * 0.44, 0x8b5f3c, 0xb28b63, 0.94);
    addPart(-width * 0.2, -height * 0.28, width * 0.36, height * 0.16, 0xfff0b8, 0xd6a04f, 0.78);
    addPart(width * 0.2, height * 0.08, width * 0.46, height * 0.5, 0xb28b63, 0xfff0b8, 0.94);
    addPart(width * 0.2, -height * 0.08, width * 0.22, height * 0.16, 0x566b7f, 0xd7f7ff, 0.88);
    addPart(-width * 0.28, height * 0.24, width * 0.34, height * 0.34, 0xd6a04f, 0xfff0b8, 0.94);
    addPart(-width * 0.28, height * 0.18, width * 0.16, height * 0.12, 0x8fd694, 0xcfffd5, 0.9);
    addPart(0, height * 0.4, width * 0.72, Math.max(3, height * 0.1), 0x111820, 0x2f2721, 0.44);
    addPart(width * 0.34, height * 0.2, width * 0.12, height * 0.16, 0xffefb0, 0xfff0b8, 0.78);
    addPart(-width * 0.34, -height * 0.1, width * 0.12, height * 0.14, 0xfff0b8, 0xd6a04f, 0.82);
    for (const xOffset of [-0.36, -0.2, -0.04, 0.14, 0.32]) {
      addPart(width * xOffset, height * 0.02, width * 0.08, height * 0.1, 0x8b5f3c, 0xb28b63, 0.78);
      addPart(width * xOffset, height * 0.3, width * 0.08, height * 0.1, 0xd6a04f, 0xfff0b8, 0.78);
    }
    addPart(width * 0.02, -height * 0.24, width * 0.1, height * 0.12, 0xb28b63, 0xfff0b8, 0.82);
    addPart(width * 0.36, -height * 0.16, width * 0.08, height * 0.12, 0x566b7f, 0xd7f7ff, 0.82);
    addPart(-width * 0.1, height * 0.28, width * 0.08, height * 0.12, 0xffefb0, 0xfff0b8, 0.78);
    addPart(-width * 0.42, height * 0.28, width * 0.08, height * 0.12, 0x8fd694, 0xcfffd5, 0.82);
  } else if (kind === "floor_label") {
    addPart(0, 0, width, height, 0xffd166, 0xfff0b8, 0.52);
    addPart(-width * 0.24, 0, width * 0.12, height * 1.5, 0x263341, 0xfff0b8, 0.72);
    addPart(0, 0, width * 0.12, height * 1.5, 0x263341, 0xfff0b8, 0.72);
    addPart(width * 0.24, 0, width * 0.12, height * 1.5, 0x263341, 0xfff0b8, 0.72);
  } else if (kind === "control_panel") {
    addPart(0, 0, width, height, 0x173142, 0x6bd3ff, 0.94);
    addPart(-width * 0.24, -height * 0.1, width * 0.2, height * 0.3, 0x75e1ff, 0xd7f7ff, 0.9);
    addPart(0, -height * 0.1, width * 0.16, height * 0.24, 0x2bc3ff, 0xd7f7ff, 0.88);
    addPart(width * 0.24, -height * 0.1, width * 0.12, height * 0.2, 0x75e1ff, 0xd7f7ff, 0.76);
    addPart(width * 0.28, height * 0.22, width * 0.12, height * 0.12, 0xff5f56, 0xffb3b0, 0.92);
    addPart(-width * 0.28, height * 0.22, width * 0.12, height * 0.12, 0xffd166, 0xfff0b8, 0.86);
  } else if (kind === "camera_marker") {
    addPart(0, 0, width, height, 0x3d4650, 0xd5dde5, 0.94);
    addPart(width * 0.16, 0, width * 0.36, height * 0.54, 0x111820, 0x6bd3ff, 0.96);
    addPart(-width * 0.28, -height * 0.2, width * 0.18, height * 0.2, 0x8b929a, 0xd5dde5, 0.9);
    addPart(-width * 0.36, height * 0.22, width * 0.2, height * 0.2, 0x6bd3ff, 0xd7f7ff, 0.78);
    addPart(width * 0.38, height * 0.18, width * 0.16, height * 0.16, 0xff5f56, 0xffb3b0, 0.7);
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
    addPart(-width * 0.38, 0, width * 0.1, height * 1.5, 0x6a7d8f, 0xd5dde5, 0.24);
    addPart(-width * 0.12, 0, width * 0.1, height * 1.5, 0x6a7d8f, 0xd5dde5, 0.2);
    addPart(width * 0.14, 0, width * 0.1, height * 1.5, 0x6a7d8f, 0xd5dde5, 0.24);
    addPart(width * 0.4, 0, width * 0.1, height * 1.5, 0x6a7d8f, 0xd5dde5, 0.2);
  } else if (kind === "zone_sign") {
    addPart(0, 0, width, height, 0x173142, 0x6bd3ff, 0.88);
    addPart(-width * 0.28, 0, width * 0.12, height * 0.72, 0x6bd3ff, 0xd7f7ff, 0.82);
    addPart(width * 0.02, 0, width * 0.38, Math.max(4, height * 0.18), 0xffd166, 0xfff0b8, 0.72);
    addPart(width * 0.28, 0, width * 0.1, height * 0.58, 0xff5f56, 0xffb3b0, 0.68);
  } else if (kind === "supply_marker") {
    addPart(0, 0, width, height, 0xcfffd5, 0x72d18b, 0.52);
    addPart(0, 0, width * 0.18, height * 1.5, 0x72d18b, 0xcfffd5, 0.78);
    addPart(0, 0, width * 0.64, height * 0.34, 0x72d18b, 0xcfffd5, 0.78);
    addPart(width * 0.32, 0, width * 0.12, height * 1.12, 0xfff0b8, 0xcfffd5, 0.46);
  } else if (kind === "exit_marker") {
    return createPixelMatrixSprite({
      rows: [
        "..G..G..G..",
        ".GG.GG.GG..",
        "GHHGHHGHHG.",
        ".GG.GG.GG..",
        "..G..G..G..",
      ],
      palette: {
        O: 0x0b1118,
        M: 0x9aa7b4,
        D: 0x263341,
        F: 0x2d3b49,
        G: 0x57d7ff,
        W: 0xffd166,
        S: 0x111820,
        H: 0xd7f7ff,
      },
      alpha: { G: 0.72, H: 0.46 },
    });
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
  addRect(5, 2.48, 8.35, 2.98, 0x101923, 0.82, 0, 0x6a7d8f);
  addRect(5, 3.86, 8.35, 0.18, 0x314352, 0.38, 2);
  addRect(14.9, 7.34, 4.25, 2.75, 0x3a2f25, 0.36, 0, 0xb28b63);
  addRect(20.75, 2.5, 7.55, 3.15, 0x0e2a3a, 0.34, 0, 0x6bd3ff);
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
  for (const y of [4.5, 6.5, 8.5]) {
    addRect(16.5, y, 15.0, 0.06, 0x425566, 0.3, 0);
  }
  for (const x of [10.5, 14.5, 18.5, 22.5]) {
    addRect(x, 5.5, 0.72, 0.05, 0xffd166, 0.2, 0);
    addRect(x, 9.5, 0.72, 0.05, 0xffd166, 0.18, 0);
  }
  addRect(9.0, 4.02, 16.0, 0.08, 0x0b1118, 0.5, 0);
  addRect(17.0, 4.02, 0.08, 7.0, 0x0b1118, 0.42, 0);
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
            isWall ? 0x0d141c : 0x23313d,
          )
          .setStrokeStyle(1, isWall ? 0x405568 : 0x314252, isWall ? 0.78 : 0.18);
        if (isWall) {
          walls.push(rect);
          walls.push(
            scene.add
              .rectangle(tileCenterX, world(y + 0.16), renderScale, world(0.14), 0x6a7d8f, 0.5)
              .setDepth(2),
          );
          if (prisonMap.tiles[y + 1]?.[x] !== "#") {
            walls.push(
              scene.add
                .rectangle(tileCenterX, world(y + 0.92), renderScale, world(0.16), 0x05090e, 0.48)
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
                  0x2a3642,
                  0.24,
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
      playerSilhouette: undefined,
      playerStepping: undefined,
      guards: new Map(),
      guardSilhouettes: new Map(),
      guardCones: new Map(),
      hidingSpots: new Map(),
      lockerOccupied: new Map(),
      coverObjects: new Map(),
      coverSizes: new Map(),
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

  render(
    scene: Phaser.Scene,
    snapshot: SimulationSnapshot,
    playerState: PlayerRenderState = defaultPlayerRenderState,
  ): void {
    if (!this.objects) {
      this.mount(scene);
    }
    const objects = this.objects as RenderObjects;
    const descriptors = this.describe(snapshot);
    const visualSilhouette = playerSilhouette(playerState.facing);
    const playerStepping = playerState.moving && playerState.walkPhase === 1;
    const playerVisual = {
      ...descriptors.player.visual,
      silhouette: visualSilhouette,
    };

    if (
      objects.player &&
      (objects.playerSilhouette !== visualSilhouette ||
        objects.playerStepping !== playerStepping)
    ) {
      destroyContainerWithChildren(objects.player);
      objects.player = undefined;
      objects.playerSilhouette = undefined;
      objects.playerStepping = undefined;
    }
    if (!objects.player) {
      objects.player = createPlayerSprite(scene, playerVisual, playerState);
      objects.player.setDepth(18);
      objects.playerSilhouette = visualSilhouette;
      objects.playerStepping = playerStepping;
    }
    objects.player.setPosition(descriptors.player.x, descriptors.player.y);
    objects.player.setAlpha(descriptors.player.hidden ? 0.42 : 1);
    objects.player.setScale(playerScaleX(playerState.facing), 1);
    objects.player.setDepth(18);

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

    for (const spot of descriptors.hidingSpots) {
      let container = objects.hidingSpots.get(spot.id);
      const recordedOccupied = objects.lockerOccupied.get(spot.id);
      if (container && recordedOccupied !== spot.bodyOccupied) {
        destroyContainerWithChildren(container);
        objects.hidingSpots.delete(spot.id);
        objects.lockerOccupied.delete(spot.id);
        container = undefined;
      }
      if (!container) {
        container = spot.type === "locker"
          ? createLockerSprite(scene, spot.bodyOccupied)
          : createShadowHidingSpotSprite(scene, spot.bodyOccupied);
        objects.hidingSpots.set(spot.id, container);
        objects.lockerOccupied.set(spot.id, spot.bodyOccupied);
      }
      container.setPosition(spot.x, spot.y);
      container.setDepth(3);
    }

    for (const cover of descriptors.coverObjects) {
      let container = objects.coverObjects.get(cover.id);
      const recordedSize = objects.coverSizes.get(cover.id);
      if (container && recordedSize && (recordedSize.width !== cover.width || recordedSize.height !== cover.height)) {
        destroyContainerWithChildren(container);
        objects.coverObjects.delete(cover.id);
        objects.coverSizes.delete(cover.id);
        container = undefined;
      }
      if (!container) {
        container = createCoverSprite(scene, cover.width, cover.height);
        objects.coverObjects.set(cover.id, container);
        objects.coverSizes.set(cover.id, { width: cover.width, height: cover.height });
      }
      container.setPosition(cover.x, cover.y);
      container.setDepth(3);
    }

    for (const pebble of descriptors.pebbles) {
      const existing =
        objects.pebbles.get(pebble.id) ??
        scene.add.circle(pebble.x, pebble.y, 6, 0xb8aea1, 0.95);
      existing.setPosition(pebble.x, pebble.y);
      existing.setVisible(!pebble.collected);
      existing.setStrokeStyle(3, 0xfff0b8, 0.62);
      objects.pebbles.set(pebble.id, existing);
    }

    for (const pickup of descriptors.weaponPickups) {
      const existing =
        objects.weaponPickups.get(pickup.id) ??
        scene.add.rectangle(pickup.x, pickup.y, 26, 12, 0xd5dde5, 0.98);
      existing.setPosition(pickup.x, pickup.y);
      existing.setVisible(!pickup.collected);
      existing.setRotation(-0.18);
      existing.setFillStyle(0xd5dde5, 0.98);
      existing.setStrokeStyle(5, 0xfff0b8, 0.92);
      objects.weaponPickups.set(pickup.id, existing);
    }

    for (const pickup of descriptors.healingPickups) {
      const existing =
        objects.healingPickups.get(pickup.id) ??
        scene.add.rectangle(pickup.x, pickup.y, 24, 16, 0x72d18b, 0.98);
      existing.setPosition(pickup.x, pickup.y);
      existing.setVisible(!pickup.collected);
      existing.setFillStyle(0x72d18b, 0.98);
      existing.setStrokeStyle(5, 0xcfffd5, 0.94);
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
      existing.setStrokeStyle(4, door.unlocked ? 0xfff0b8 : 0xff7a6f, 0.9);
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
    objects.key.setStrokeStyle(5, 0xfff0b8, 0.94);

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
    objects.exit.setStrokeStyle(5, descriptors.objectives.exit.unlocked ? 0xcfffd5 : 0xd7f7ff, 0.9);

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
