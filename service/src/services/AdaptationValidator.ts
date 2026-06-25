import { z } from "zod";
import {
  AdaptationDecisionSchema,
  adaptationCaps,
  type AdaptationDecision,
  type AdaptationType,
} from "../../../shared/adaptations";
import type { BehaviorSummary } from "../../../shared/contracts";
import { BlockingCodexError } from "./CodexService";

const REPEATED_ESCAPE_THRESHOLD = 2;
const ZONE_TARGETED_COMBAT_ACTIONS = new Set<AdaptationType>([
  "add_body_checks",
  "place_armed_response",
  "improve_guard_cover",
  "increase_melee_caution",
]);
const GUN_RELATED_ACTIONS = new Set<AdaptationType>([
  "place_armed_response",
  "improve_guard_cover",
  "reduce_ammo_availability",
]);
const BODY_EVIDENCE_ACTIONS = new Set<AdaptationType>([
  "add_body_checks",
  "increase_guard_durability",
]);

export class AdaptationValidator {
  parseAndValidate(
    rawJson: string,
    behaviorSummary: BehaviorSummary,
    activeAdaptations: AdaptationDecision[],
  ): AdaptationDecision {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new BlockingCodexError("Codex returned malformed JSON.", "malformed_json");
    }
    return this.validate(parsed, behaviorSummary, activeAdaptations);
  }

  validate(
    candidate: unknown,
    behaviorSummary: BehaviorSummary,
    activeAdaptations: AdaptationDecision[],
  ): AdaptationDecision {
    const decision = parseDecision(candidate);
    this.verifyTarget(decision, behaviorSummary);
    this.verifyPrerequisites(decision, behaviorSummary);
    this.verifyCap(decision.action, activeAdaptations);
    return decision;
  }

  private verifyTarget(decision: AdaptationDecision, behaviorSummary: BehaviorSummary): void {
    if (
      decision.action === "increase_corridor_patrol" &&
      decision.target !== behaviorSummary.mostUsedCorridor
    ) {
      throw invalid(`Target must match most-used corridor ${behaviorSummary.mostUsedCorridor}.`);
    }
    if (
      decision.action === "inspect_hiding_spot" &&
      decision.target !== behaviorSummary.favoriteHidingSpot
    ) {
      throw invalid(`Target must match favorite hiding spot ${behaviorSummary.favoriteHidingSpot}.`);
    }
    if (decision.action === "increase_noise_sensitivity" && decision.target !== "global") {
      throw invalid("Noise sensitivity target must be global.");
    }
    if (decision.action === "activate_reserve_guard" && decision.target !== "exit") {
      throw invalid("Reserve guard target must be exit.");
    }
    if (
      ZONE_TARGETED_COMBAT_ACTIONS.has(decision.action) &&
      decision.target !== behaviorSummary.combat.favoriteCombatZone
    ) {
      throw invalid(
        `Target must match favorite combat zone ${behaviorSummary.combat.favoriteCombatZone}.`,
      );
    }
    if (
      (decision.action === "reduce_ammo_availability" ||
        decision.action === "increase_guard_durability") &&
      decision.target !== "global"
    ) {
      throw invalid(`${decision.action} target must be global.`);
    }
    if (decision.action === "maintain_security_posture" && decision.target !== "global") {
      throw invalid("Maintain security posture target must be global.");
    }
  }

  private verifyPrerequisites(
    decision: AdaptationDecision,
    behaviorSummary: BehaviorSummary,
  ): void {
    if (decision.action === "increase_corridor_patrol" && !behaviorSummary.mostUsedCorridor) {
      throw invalid("Corridor patrol requires a most-used corridor.");
    }
    if (decision.action === "inspect_hiding_spot" && !behaviorSummary.favoriteHidingSpot) {
      throw invalid("Hiding spot inspection requires a favorite hiding spot.");
    }
    if (decision.action === "increase_noise_sensitivity" && !behaviorSummary.frequentSprinting) {
      throw invalid("Noise sensitivity requires frequent sprinting.");
    }
    if (
      decision.action === "activate_reserve_guard" &&
      behaviorSummary.successfulEscapes < REPEATED_ESCAPE_THRESHOLD
    ) {
      throw invalid("Reserve guard requires repeated successful escapes.");
    }
    if (
      ZONE_TARGETED_COMBAT_ACTIONS.has(decision.action) &&
      !behaviorSummary.combat.favoriteCombatZone
    ) {
      throw invalid(`${decision.action} requires a favorite combat zone.`);
    }
    if (
      GUN_RELATED_ACTIONS.has(decision.action) &&
      (behaviorSummary.combat.gunAttackCount === 0 ||
        !["gun", "hybrid"].includes(behaviorSummary.combat.primaryStyle))
    ) {
      throw invalid(`${decision.action} requires gun combat evidence.`);
    }
    if (
      decision.action === "increase_melee_caution" &&
      (behaviorSummary.combat.meleeAttackCount === 0 ||
        !["melee", "hybrid"].includes(behaviorSummary.combat.primaryStyle))
    ) {
      throw invalid("Melee caution requires melee combat evidence.");
    }
    if (
      BODY_EVIDENCE_ACTIONS.has(decision.action) &&
      behaviorSummary.combat.knockoutCount === 0 &&
      behaviorSummary.combat.killCount === 0 &&
      behaviorSummary.combat.bodyDiscoveryCount === 0
    ) {
      throw invalid(`${decision.action} requires knockout, kill, or body discovery evidence.`);
    }
  }

  private verifyCap(action: AdaptationType, activeAdaptations: AdaptationDecision[]): void {
    const currentLevel = activeAdaptations.filter((adaptation) => adaptation.action === action).length;
    if (currentLevel >= adaptationCaps[action]) {
      throw invalid(`${action} is already at cap ${adaptationCaps[action]}.`);
    }
  }
}

function parseDecision(candidate: unknown): AdaptationDecision {
  try {
    return AdaptationDecisionSchema.parse(candidate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw invalid(error.issues.map((issue) => issue.message).join("; "));
    }
    throw error;
  }
}

function invalid(message: string): BlockingCodexError {
  return new BlockingCodexError(message, "invalid_decision");
}
