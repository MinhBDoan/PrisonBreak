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
