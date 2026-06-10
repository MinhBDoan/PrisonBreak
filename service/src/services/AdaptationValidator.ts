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
