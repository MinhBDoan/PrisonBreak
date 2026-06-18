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
  hidingSpots: HidingSpot[];
  coverObjects: CoverObject[];
  patrolRoutes: PatrolRoute[];
  reserveGuardSpawn: Vector;
};

export type PlayerState = {
  position: Vector;
  hasKey: boolean;
  hiddenIn: string | null;
};

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
