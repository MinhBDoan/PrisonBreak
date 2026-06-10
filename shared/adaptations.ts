import { z } from "zod";

export const adaptationCaps = {
  increase_corridor_patrol: 3,
  inspect_hiding_spot: 2,
  increase_noise_sensitivity: 2,
  activate_reserve_guard: 1,
  maintain_security_posture: 999,
} as const;

export type AdaptationType = keyof typeof adaptationCaps;

export const AdaptationTypeSchema = z.enum([
  "increase_corridor_patrol",
  "inspect_hiding_spot",
  "increase_noise_sensitivity",
  "activate_reserve_guard",
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
    action: "maintain_security_posture",
    validTargets: "global",
    description: "Keep the current adaptation set when every specific eligible response is capped.",
  },
];
