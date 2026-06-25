import type { RunEvent } from "../../../shared/contracts";
import type { RunEventDraft } from "./types";

function clonePayloadValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => clonePayloadValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        clonePayloadValue(nestedValue),
      ]),
    );
  }

  return value;
}

function clonePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, clonePayloadValue(value)]),
  );
}

export class RunEventCollector {
  private readonly events: RunEvent[] = [];

  record(timeMs: number, draft: RunEventDraft): void {
    this.events.push({
      ...draft,
      position: { ...draft.position },
      payload: clonePayload(draft.payload),
      atMs: timeMs,
    });
  }

  list(): RunEvent[] {
    return this.events.map((event) => ({
      ...event,
      position: { ...event.position },
      payload: clonePayload(event.payload),
    }));
  }
}
