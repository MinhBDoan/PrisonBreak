import type { ActiveAdaptation, RunEvent, RunOutcome } from "../../../shared/contracts";

export type Vector = { x: number; y: number };
export type Tile = "floor" | "wall";
export type CorridorId =
  | "cell_block"
  | "central_corridor"
  | "storage_room"
  | "east_corridor"
  | "security_room"
  | "exit_hall";
export type PrisonLevelId = "cell_block" | "security_wing" | "cafeteria_riot" | "maintenance" | "outer_gate";
export type HidingSpotType = "locker" | "shadow";
export type GuardState = "patrol" | "investigate" | "search" | "chase" | "return";
export type DoorKeyId = "general_key";

export type SimulationInput = {
  direction: Vector;
  sprint: boolean;
  interact: boolean;
  throwTarget?: Vector | null;
  attack?: { mode: "melee" | "gun"; target: Vector; weaponId?: WeaponId } | null;
  heal?: boolean;
  reload?: boolean;
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

export type SetDressingKind =
  | "bars"
  | "cot"
  | "bench"
  | "floor_marking"
  | "toilet"
  | "prisoner"
  | "desk"
  | "monitor"
  | "weapon_rack"
  | "supply_shelf"
  | "supply_boxes"
  | "floor_label"
  | "control_panel"
  | "camera_marker"
  | "status_lights"
  | "cell_grime"
  | "prisoner_shadow"
  | "corridor_stripe"
  | "zone_sign"
  | "supply_marker"
  | "exit_marker"
  | "surveillance_marks";

export type SetDressingObject = {
  id: string;
  kind: SetDressingKind;
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

export type WeaponPickup = {
  id: string;
  weaponId: WeaponId;
  position: Vector;
};

export type HealingPickup = {
  id: string;
  position: Vector;
  amount: number;
};

export type Door = {
  id: string;
  position: Vector;
  width: number;
  height: number;
  locked: boolean;
  keyId?: DoorKeyId;
};

export type DoorKeyCarrier = {
  guardId: string;
  keyId: DoorKeyId;
};

export type DoorKeyPickup = {
  id: string;
  keyId: DoorKeyId;
  position: Vector;
};

export type PatrolPoint = Vector & {
  corridor: CorridorId;
};

export type PatrolRoute = {
  id: string;
  points: PatrolPoint[];
};

export type StationaryGuard = {
  id: string;
  position: Vector;
  facing: Vector;
  corridor: CorridorId;
};

export type PrisonMap = {
  width: number;
  height: number;
  tiles: string[];
  corridors: Record<CorridorId, { minX: number; maxX: number; minY: number; maxY: number }>;
  key: ObjectivePoint;
  exit: ObjectivePoint;
  pebbles: Pebble[];
  weaponPickups: WeaponPickup[];
  healingPickups: HealingPickup[];
  doors: Door[];
  doorKeyCarriers: DoorKeyCarrier[];
  hidingSpots: HidingSpot[];
  coverObjects: CoverObject[];
  setDressingObjects: SetDressingObject[];
  patrolRoutes: PatrolRoute[];
  stationaryGuards: StationaryGuard[];
  reserveGuardSpawn: Vector;
};

export type PrisonLevel = {
  id: PrisonLevelId;
  name: string;
  section: string;
  nextLevelId: PrisonLevelId | null;
  map: PrisonMap;
};

export type PlayerState = {
  position: Vector;
  hasKey: boolean;
  hiddenIn: string | null;
  draggingBodyId: string | null;
  pebbles: number;
  doorKeys: DoorKeyId[];
};

export interface HealthState {
  entityId: string;
  hp: number;
  maxHp: number;
  isDown: boolean;
}

export type BodyState = "active" | "knocked_out" | "dead";
export type AlertLevel = "calm" | "suspicious" | "alert" | "armed_response" | "lockdown_pressure";

export interface AlertState {
  level: AlertLevel;
  pressure: number;
  armedResponseTriggered: boolean;
}

export interface BodyRecord {
  guardId: string;
  bodyState: Exclude<BodyState, "active">;
  position: Vector;
  discoveredBy?: string;
  hiddenIn?: string;
}

export interface BodySystemState {
  bodies: Record<string, BodyRecord>;
}

export type GuardStateSnapshot = {
  id: string;
  position: Vector;
  facing: Vector;
  state: GuardState;
  bodyState?: BodyState;
  health?: HealthState;
  routeId: string;
  routeIndex: number;
  suspicion: number;
  captureProgress: number;
  inspectionTarget: string | null;
  bodyHiddenIn?: string;
  combatLockedOnPlayer?: boolean;
};

export type AppliedAdaptations = {
  active: ActiveAdaptation[];
  patrolFrequency: Partial<Record<CorridorId, number>>;
  inspectHidingSpots: Record<string, number>;
  noiseSensitivity: number;
  reserveGuardActive: boolean;
  bodyCheckLevel: number;
  armedResponseLevel: number;
  guardCoverLevel: number;
  guardDurabilityLevel: number;
  ammoReductionLevel: number;
  meleeCautionLevel: number;
};

export type SimulationSnapshot = {
  timeMs: number;
  level: {
    id: PrisonLevelId;
    name: string;
    section: string;
    nextLevelId: PrisonLevelId | null;
  };
  player: PlayerState & {
    health: HealthState;
    weapons: WeaponState;
  };
  guards: GuardStateSnapshot[];
  alert: AlertState;
  objectives: {
    hasKey: boolean;
    exitUnlocked: boolean;
  };
  pebbles: Array<Pebble & { collected: boolean }>;
  weaponPickups: Array<WeaponPickup & { collected: boolean }>;
  healingPickups: Array<HealingPickup & { collected: boolean }>;
  doors: Array<Door & { open: boolean; unlocked: boolean; swingDirection: 1 | -1 }>;
  doorKeyPickups: Array<DoorKeyPickup & { collected: boolean }>;
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
  levelId?: PrisonLevelId;
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
