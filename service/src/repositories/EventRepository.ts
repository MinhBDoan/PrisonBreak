import { RunEventSchema, type RunEvent, type RunOutcome } from "../../../shared/contracts";
import type { ServiceDatabase } from "../db";

export interface CompletedRunWithEvents {
  id: number;
  outcome: RunOutcome;
  events: RunEvent[];
}

interface RunStateRow {
  completed_at: string | null;
}

interface CompletedRunRow {
  id: number;
  outcome: RunOutcome;
}

interface EventRow {
  event_json: string;
}

export class EventRepository {
  constructor(private readonly database: ServiceDatabase) {}

  insertRunEvents(runId: number, events: RunEvent[]): void {
    this.database.transaction(() => {
      const run = this.database
        .prepare("SELECT completed_at FROM runs WHERE id = ?")
        .get(runId) as RunStateRow | undefined;
      if (!run) throw new Error(`Cannot record events for unknown run ${runId}`);
      if (run.completed_at) throw new Error(`Cannot record events for finalized run ${runId}`);

      const insert = this.database.prepare(
        "INSERT INTO run_events (run_id, event_json) VALUES (?, ?)",
      );
      for (const candidate of events) {
        insert.run(runId, JSON.stringify(RunEventSchema.parse(candidate)));
      }
    })();
  }

  getRecentCompletedRunsWithEvents(limit: number): CompletedRunWithEvents[] {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError("Recent run limit must be a nonnegative integer");
    }

    const runs = this.database
      .prepare(`
        SELECT id, outcome FROM runs
        WHERE completed_at IS NOT NULL
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as CompletedRunRow[];
    const eventQuery = this.database.prepare(`
      SELECT event_json FROM run_events WHERE run_id = ? ORDER BY id ASC
    `);

    return runs.map((run) => ({
      id: run.id,
      outcome: run.outcome,
      events: (eventQuery.all(run.id) as EventRow[]).map((row) =>
        RunEventSchema.parse(JSON.parse(row.event_json)),
      ),
    }));
  }
}
