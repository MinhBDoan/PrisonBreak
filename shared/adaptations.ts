import { z } from "zod";

export const adaptationCaps = {
  increase_corridor_patrol: 3,
  inspect_hiding_spot: 2,
  increase_noise_sensitivity: 2,
  activate_reserve_guard: 1,
  add_body_checks: 2,
  place_armed_response: 2,
  improve_guard_cover: 2,
  increase_guard_durability: 2,
  reduce_ammo_availability: 2,
  increase_melee_caution: 2,
  maintain_security_posture: 999,
} as const;

export type AdaptationType = keyof typeof adaptationCaps;

export const AdaptationTypeSchema = z.enum([
  "increase_corridor_patrol",
  "inspect_hiding_spot",
  "increase_noise_sensitivity",
  "activate_reserve_guard",
  "add_body_checks",
  "place_armed_response",
  "improve_guard_cover",
  "increase_guard_durability",
  "reduce_ammo_availability",
  "increase_melee_caution",
  "maintain_security_posture",
]);

export const AdaptationDecisionSchema = z.object({
  action: AdaptationTypeSchema,
  target: z.string().min(1),
  rationale: z.string().min(1),
});

export type AdaptationDecision = z.infer<typeof AdaptationDecisionSchema>;

export const adaptationAllowlist: ReadonlyArray<{
  action: AdaptationType;
  validTargets: string;
  description: string;
}> = [
  {
    action: "increase_corridor_patrol",
    validTargets: "behaviorSummary.mostUsedCorridor",
    description: "Increase patrol frequency in the player's most-used corridor.",
  },
  {
    action: "inspect_hiding_spot",
    validTargets: "behaviorSummary.favoriteHidingSpot",
    description: "Add a guard check near the favorite hiding spot.",
  },
  {
    action: "increase_noise_sensitivity",
    validTargets: "global",
    description: "Increase noise sensitivity after frequent sprinting.",
  },
  {
    action: "activate_reserve_guard",
    validTargets: "exit",
    description: "Activate the reserve guard near the exit after repeated successful escapes.",
  },
  {
    action: "add_body_checks",
    validTargets: "behaviorSummary.combat.favoriteCombatZone",
    description: "Add guard checks around zones where bodies or incapacitated guards are found.",
  },
  {
    action: "place_armed_response",
    validTargets: "behaviorSummary.combat.favoriteCombatZone",
    description: "Place armed response near the player's favored gun combat zone.",
  },
  {
    action: "improve_guard_cover",
    validTargets: "behaviorSummary.combat.favoriteCombatZone",
    description: "Improve guard cover in zones where the player relies on gun attacks.",
  },
  {
    action: "increase_guard_durability",
    validTargets: "global",
    description: "Increase guard durability after combat repeatedly incapacitates guards.",
  },
  {
    action: "reduce_ammo_availability",
    validTargets: "global",
    description: "Reduce ammo availability when the player relies on guns.",
  },
  {
    action: "increase_melee_caution",
    validTargets: "behaviorSummary.combat.favoriteCombatZone",
    description: "Increase guard caution in zones where the player relies on melee attacks.",
  },
  {
    action: "maintain_security_posture",
    validTargets: "global",
    description: "Keep the current adaptation set when every specific eligible response is capped.",
  },
];
