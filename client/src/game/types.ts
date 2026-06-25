import type { ActiveAdaptation, RunEvent, RunOutcome } from "../../../shared/contracts";

export type Vector = { x: number; y: number };
export type Tile = "floor" | "wall";
export type CorridorId = "west_corridor" | "central_corridor" | "east_corridor" | "security_room" | "exit_hall";
export type HidingSpotType = "locker" | "shadow";
export type GuardState = "patrol" | "investigate" | "search" | "chase" | "return";

export type SimulationInput = {
  direction: Vector;
  sprint: boolean;
  interact: boolean;
  throwTarget?: Vector | null;
};

export type HidingSpot = {
  id: string;
  type: HidingSpotType;
  position: Vector;
};

export type CoverObject = {
  id: string;
  position: Vector;
  width: number;
  height: number;
};

export type ObjectivePoint = {
  id: string;
  position: Vector;
};

export type Pebble = {
  id: string;
  position: Vector;
};

export type PatrolPoint = Vector & {
  corridor: CorridorId;
};

export type PatrolRoute = {
  id: string;
  points: PatrolPoint[];
};

export type PrisonMap = {
  width: number;
  height: number;
  tiles: string[];
  corridors: Record<CorridorId, { minX: number; maxX: number; minY: number; maxY: number }>;
  key: ObjectivePoint;
  exit: ObjectivePoint;
  pebbles: Pebble[];
  hidingSpots: HidingSpot[];
  coverObjects: CoverObject[];
  patrolRoutes: PatrolRoute[];
  reserveGuardSpawn: Vector;
};

export type PlayerState = {
  position: Vector;
  hasKey: boolean;
  hiddenIn: string | null;
  pebbles: number;
};

export interface HealthState {
  entityId: string;
  hp: number;
  maxHp: number;
  isDown: boolean;
}

export type BodyState = "active" | "knocked_out" | "dead";

export type GuardStateSnapshot = {
  id: string;
  position: Vector;
  facing: Vector;
  state: GuardState;
  routeId: string;
  routeIndex: number;
  suspicion: number;
  captureProgress: number;
  inspectionTarget: string | null;
};

export type AppliedAdaptations = {
  active: ActiveAdaptation[];
  patrolFrequency: Partial<Record<CorridorId, number>>;
  inspectHidingSpots: Record<string, number>;
  noiseSensitivity: number;
  reserveGuardActive: boolean;
};

export type SimulationSnapshot = {
  timeMs: number;
  player: PlayerState;
  guards: GuardStateSnapshot[];
  objectives: {
    hasKey: boolean;
    exitUnlocked: boolean;
  };
  pebbles: Array<Pebble & { collected: boolean }>;
  completed: { outcome: RunOutcome; durationMs: number } | null;
  adaptations: AppliedAdaptations;
};

export type GuardOverride = {
  id: string;
  position: Vector;
  facing?: Vector;
};

export type SimulationOptions = {
  nextRunConfig?: { adaptations: ActiveAdaptation[] };
  guardOverrides?: GuardOverride[];
};

export type RunEventDraft = Omit<RunEvent, "atMs">;

export type WeaponSlot = "fists" | "melee" | "sidearm" | "primary";
export type WeaponKind = "unarmed" | "melee" | "gun";
export type AmmoType = "none" | "nine_mm" | "shells" | "rifle";
export type WeaponId =
  | "fists"
  | "makeshift_knife"
  | "baton"
  | "bat"
  | "pipe"
  | "pistol"
  | "smg"
  | "shotgun"
  | "assault_rifle"
  | "suppressed_pistol";

export interface WeaponStats {
  id: WeaponId;
  label: string;
  slot: WeaponSlot;
  kind: WeaponKind;
  ammoType: AmmoType;
  damage: number;
  stun: number;
  range: number;
  attackMs: number;
  noise: number;
  lethal: boolean;
  magazineSize: number;
  reloadMs: number;
  recoil: number;
  movingAccuracyPenalty: number;
}

export interface WeaponState {
  meleeWeaponId: WeaponId;
  primaryGunId: WeaponId | null;
  sidearmId: WeaponId | null;
  ammoByWeapon: Partial<Record<WeaponId, number>>;
  reserveAmmoByType: Record<AmmoType, number>;
  reload: { weaponId: WeaponId; remainingMs: number } | null;
  healingItems: number;
}

export interface CombatResult {
  attackerId: string;
  targetId: string;
  weaponId: WeaponId;
  hit: boolean;
  damage: number;
  stun: number;
  noise: number;
  bodyState: BodyState;
}
