import { z } from "zod";
import { AdaptationDecisionSchema, AdaptationTypeSchema } from "./adaptations";

export const PositionSchema = z.object({ x: z.number(), y: z.number() });

export const RunEventSchema = z.object({
  type: z.enum([
    "move",
    "sprint",
    "hide_enter",
    "hide_exit",
    "noise",
    "detection",
    "key_collected",
    "escape",
    "capture",
    "death",
    "weapon_pickup",
    "weapon_swap",
    "attack",
    "reload",
    "damage_dealt",
    "damage_taken",
    "knockout",
    "kill",
    "body_discovered",
    "guard_wakeup",
    "heal",
    "alert_changed",
    "armed_response_triggered",
  ]),
  atMs: z.number().nonnegative(),
  position: PositionSchema,
  payload: z.record(z.unknown()),
});

export type RunEvent = z.infer<typeof RunEventSchema>;

export const RunOutcomeSchema = z.enum(["escape", "capture", "death"]);
export type RunOutcome = z.infer<typeof RunOutcomeSchema>;

export const BehaviorSummarySchema = z.object({
  corridorScores: z.record(z.number().nonnegative()),
  hidingSpotScores: z.record(z.number().nonnegative()),
  mostUsedCorridor: z.string().nullable(),
  favoriteHidingSpot: z.string().nullable(),
  sprintRatio: z.number().nonnegative(),
  frequentSprinting: z.boolean(),
  detections: z.number().nonnegative(),
  successfulEscapes: z.number().nonnegative(),
});
export type BehaviorSummary = z.infer<typeof BehaviorSummarySchema>;

export const ReadinessSchema = z.object({
  database: z.boolean(),
  codex: z.boolean(),
  ready: z.boolean(),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

export const ActiveAdaptationSchema = z.object({
  action: AdaptationTypeSchema,
  target: z.string().min(1),
  level: z.number().int().positive(),
  rationale: z.string().min(1),
});
export type ActiveAdaptation = z.infer<typeof ActiveAdaptationSchema>;

export const NextRunConfigSchema = z.object({
  adaptations: z.array(ActiveAdaptationSchema),
});
export type NextRunConfig = z.infer<typeof NextRunConfigSchema>;

export const StartRunResponseSchema = z.object({
  runId: z.number().int().positive(),
  config: NextRunConfigSchema,
});
export type StartRunResponse = z.infer<typeof StartRunResponseSchema>;

export const CompleteRunRequestSchema = z.object({
  outcome: RunOutcomeSchema,
  durationMs: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1),
  events: z.array(RunEventSchema),
});
export type CompleteRunRequest = z.infer<typeof CompleteRunRequestSchema>;

export const IntelligenceReportSchema = z.object({
  summary: BehaviorSummarySchema,
  adaptation: ActiveAdaptationSchema,
  rationale: z.string().min(1),
});
export type IntelligenceReport = z.infer<typeof IntelligenceReportSchema>;

export const CompleteRunResponseSchema = z.object({
  runId: z.number().int().positive(),
  outcome: RunOutcomeSchema,
  report: IntelligenceReportSchema,
  nextRun: NextRunConfigSchema,
});
export type CompleteRunResponse = z.infer<typeof CompleteRunResponseSchema>;

export const BlockingErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
});
export type BlockingError = z.infer<typeof BlockingErrorSchema>;

export {
  AdaptationTypeSchema,
  adaptationAllowlist,
  adaptationCaps,
} from "./adaptations";
export type { AdaptationDecision, AdaptationType } from "./adaptations";
