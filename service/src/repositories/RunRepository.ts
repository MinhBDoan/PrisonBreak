import type { ServiceDatabase } from "../db";
import type { RunOutcome } from "../../../shared/contracts";

export interface RunRecord {
  id: number;
  configJson: string;
  outcome: RunOutcome | null;
  durationMs: number | null;
  completionIdempotencyKey: string | null;
}

interface RunRow {
  id: number;
  config_json: string;
  outcome: RunOutcome | null;
  duration_ms: number | null;
  completion_idempotency_key: string | null;
}

interface CompletionRequestRow {
  run_id: number;
  outcome: RunOutcome;
  duration_ms: number;
}

export class RunCompletionConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(`Idempotency key ${idempotencyKey} was already used for a different completion request`);
    this.name = "RunCompletionConflictError";
  }
}

export class RunRepository {
  constructor(private readonly database: ServiceDatabase) {}

  startRun(configJson: string): RunRecord {
    const result = this.database
      .prepare("INSERT INTO runs (config_json) VALUES (?)")
      .run(configJson);
    return this.getRun(Number(result.lastInsertRowid));
  }

  completeRun(
    runId: number,
    outcome: RunOutcome,
    durationMs: number,
    idempotencyKey: string,
  ): RunRecord {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError("Run duration must be a finite nonnegative number");
    }

    return this.database.transaction(() => {
      const existing = this.database
        .prepare(
          "SELECT run_id, outcome, duration_ms FROM completion_requests WHERE idempotency_key = ?",
        )
        .get(idempotencyKey) as CompletionRequestRow | undefined;
      if (existing) {
        if (
          existing.run_id !== runId ||
          existing.outcome !== outcome ||
          existing.duration_ms !== durationMs
        ) {
          throw new RunCompletionConflictError(idempotencyKey);
        }
        return this.getRun(existing.run_id);
      }

      const result = this.database
        .prepare(`
          UPDATE runs
          SET outcome = ?, duration_ms = ?, completion_idempotency_key = ?,
              completed_at = CURRENT_TIMESTAMP
          WHERE id = ? AND completed_at IS NULL
        `)
        .run(outcome, durationMs, idempotencyKey, runId);
      if (result.changes === 0) throw new Error(`Run ${runId} cannot be completed`);

      this.database
        .prepare(`
          INSERT INTO completion_requests (idempotency_key, run_id, outcome, duration_ms)
          VALUES (?, ?, ?, ?)
        `)
        .run(idempotencyKey, runId, outcome, durationMs);
      return this.getRun(runId);
    })();
  }

  getRun(runId: number): RunRecord {
    const row = this.database.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as
      | RunRow
      | undefined;
    if (!row) throw new Error(`Run ${runId} not found`);
    return {
      id: row.id,
      configJson: row.config_json,
      outcome: row.outcome,
      durationMs: row.duration_ms,
      completionIdempotencyKey: row.completion_idempotency_key,
    };
  }
}
