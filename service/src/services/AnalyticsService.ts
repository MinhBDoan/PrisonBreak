import type { BehaviorSummary, RunEvent } from "../../../shared/contracts";
import type { EventRepository } from "../repositories/EventRepository";

const AGE_DECAY = 0.35;
const FREQUENT_SPRINT_THRESHOLD = 0.3;

function payloadId(event: RunEvent, key: string): string | null {
  const value = event.payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function highestScore(scores: Record<string, number>): string | null {
  return Object.entries(scores).sort(
    ([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId),
  )[0]?.[0] ?? null;
}

export class AnalyticsService {
  constructor(private readonly events: EventRepository) {}

  summarize(recentRunLimit = 20): BehaviorSummary {
    const runs = this.events.getRecentCompletedRunsWithEvents(recentRunLimit);
    const corridorScores: Record<string, number> = {};
    const hidingSpotScores: Record<string, number> = {};
    let weightedMovement = 0;
    let weightedSprints = 0;
    let detections = 0;
    let successfulEscapes = 0;

    runs.forEach((run, ageInRuns) => {
      const weight = 1 / (1 + ageInRuns * AGE_DECAY);
      if (run.outcome === "escape") successfulEscapes += weight;

      for (const event of run.events) {
        if (event.type === "move" || event.type === "sprint") {
          weightedMovement += weight;
          if (event.type === "sprint") weightedSprints += weight;
          const corridorId = payloadId(event, "corridorId");
          if (corridorId) corridorScores[corridorId] = (corridorScores[corridorId] ?? 0) + weight;
        }
        if (event.type === "hide_enter") {
          const hidingSpotId = payloadId(event, "hidingSpotId");
          if (hidingSpotId) {
            hidingSpotScores[hidingSpotId] = (hidingSpotScores[hidingSpotId] ?? 0) + weight;
          }
        }
        if (event.type === "detection") detections += weight;
      }
    });

    const sprintRatio = weightedMovement === 0 ? 0 : weightedSprints / weightedMovement;
    return {
      corridorScores,
      hidingSpotScores,
      mostUsedCorridor: highestScore(corridorScores),
      favoriteHidingSpot: highestScore(hidingSpotScores),
      sprintRatio,
      frequentSprinting: sprintRatio >= FREQUENT_SPRINT_THRESHOLD,
      detections,
      successfulEscapes,
    };
  }
}
