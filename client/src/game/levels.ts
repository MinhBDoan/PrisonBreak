import { prisonMap } from "./map";
import type { PrisonLevel, PrisonLevelId } from "./types";

export const prisonLevels: PrisonLevel[] = [
  {
    id: "cell_block",
    name: "Cell Block",
    section: "Cell Block to Security Room",
    nextLevelId: "security_wing",
    map: prisonMap,
  },
];

export const defaultLevelId: PrisonLevelId = "cell_block";

export function levelById(levelId: PrisonLevelId = defaultLevelId): PrisonLevel {
  const level = prisonLevels.find((candidate) => candidate.id === levelId);
  if (!level) {
    throw new Error(`Unknown prison level: ${levelId}`);
  }
  return level;
}
