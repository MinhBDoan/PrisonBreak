import type { BehaviorSummary, RunEvent } from "../../../shared/contracts";
import type { EventRepository } from "../repositories/EventRepository";

const AGE_DECAY = 0.35;
const FREQUENT_SPRINT_THRESHOLD = 0.3;
const COMBAT_ZONES = {
  west_corridor: { minX: 1, maxX: 8, minY: 1, maxY: 10 },
  central_corridor: { minX: 9, maxX: 16, minY: 4, maxY: 10 },
  security_room: { minX: 17, maxX: 24, minY: 1, maxY: 3 },
  exit_hall: { minX: 17, maxX: 24, minY: 7, maxY: 10 },
  east_corridor: { minX: 17, maxX: 24, minY: 4, maxY: 10 },
} as const;
const GUN_WEAPON_IDS = new Set([
  "pistol",
  "smg",
  "shotgun",
  "assault_rifle",
  "suppressed_pistol",
]);
const MELEE_WEAPON_IDS = new Set([
  "fists",
  "makeshift_knife",
  "baton",
  "bat",
  "pipe",
]);

function payloadId(event: RunEvent, key: string): string | null {
  const value = event.payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function highestScore(scores: Record<string, number>): string | null {
  return Object.entries(scores).sort(
    ([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId),
  )[0]?.[0] ?? null;
}

function combatZone(event: RunEvent): string | null {
  const explicitZone = payloadId(event, "corridorId") ?? payloadId(event, "zoneId");
  if (explicitZone) return explicitZone;

  return Object.entries(COMBAT_ZONES).find(
    ([, bounds]) =>
      event.position.x >= bounds.minX &&
      event.position.x <= bounds.maxX &&
      event.position.y >= bounds.minY &&
      event.position.y <= bounds.maxY,
  )?.[0] ?? null;
}

function primaryStyle(gunAttackCount: number, meleeAttackCount: number): BehaviorSummary["combat"]["primaryStyle"] {
  if (gunAttackCount === 0 && meleeAttackCount === 0) return "stealth";
  if (gunAttackCount > 0 && meleeAttackCount === 0) return "gun";
  if (meleeAttackCount > 0 && gunAttackCount === 0) return "melee";
  return "hybrid";
}

function attackStyle(event: RunEvent): "gun" | "melee" | null {
  const attackType = payloadId(event, "attackType");
  if (attackType === "gun") return "gun";
  if (attackType === "melee" || attackType === "unarmed") return "melee";

  const weaponId = payloadId(event, "weaponId");
  if (weaponId && GUN_WEAPON_IDS.has(weaponId)) return "gun";
  if (weaponId && MELEE_WEAPON_IDS.has(weaponId)) return "melee";
  return null;
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
    const combatZoneScores: Record<string, number> = {};
    let gunAttackCount = 0;
    let meleeAttackCount = 0;
    let knockoutCount = 0;
    let killCount = 0;
    let bodyDiscoveryCount = 0;
    let healingUseCount = 0;
    let armedResponseTriggers = 0;

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
        if (event.type === "attack") {
          const style = attackStyle(event);
          if (style === "gun") gunAttackCount += 1;
          if (style === "melee") meleeAttackCount += 1;
        }
        if (event.type === "knockout") knockoutCount += 1;
        if (event.type === "kill") killCount += 1;
        if (event.type === "body_discovered") bodyDiscoveryCount += 1;
        if (event.type === "heal") healingUseCount += 1;
        if (event.type === "armed_response_triggered") armedResponseTriggers += 1;
        if (
          event.type === "attack" ||
          event.type === "knockout" ||
          event.type === "kill" ||
          event.type === "body_discovered" ||
          event.type === "heal" ||
          event.type === "armed_response_triggered"
        ) {
          const zone = combatZone(event);
          if (zone) combatZoneScores[zone] = (combatZoneScores[zone] ?? 0) + weight;
        }
        if (event.type === "detection") {
          detections += weight;
          const corridorId = payloadId(event, "corridorId");
          if (corridorId) corridorScores[corridorId] = (corridorScores[corridorId] ?? 0) + weight;
        }
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
      combat: {
        primaryStyle: primaryStyle(gunAttackCount, meleeAttackCount),
        favoriteCombatZone: highestScore(combatZoneScores),
        gunAttackCount,
        meleeAttackCount,
        knockoutCount,
        killCount,
        bodyDiscoveryCount,
        healingUseCount,
        armedResponseTriggers,
      },
    };
  }
}
