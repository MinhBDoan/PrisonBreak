import { z } from "zod";

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
  ]),
  atMs: z.number().nonnegative(),
  position: PositionSchema,
  payload: z.record(z.unknown()),
});

export type RunEvent = z.infer<typeof RunEventSchema>;

export const RunOutcomeSchema = z.enum(["escape", "capture"]);
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
