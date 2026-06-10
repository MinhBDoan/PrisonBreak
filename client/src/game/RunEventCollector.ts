import type { RunEvent } from "../../../shared/contracts";
import type { RunEventDraft } from "./types";

export class RunEventCollector {
  private readonly events: RunEvent[] = [];

  record(timeMs: number, draft: RunEventDraft): void {
    this.events.push({ ...draft, atMs: timeMs });
  }

  list(): RunEvent[] {
    return this.events.map((event) => ({
      ...event,
      position: { ...event.position },
      payload: { ...event.payload },
    }));
  }
}
