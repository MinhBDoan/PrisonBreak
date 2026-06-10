import { describe, expect, it } from "vitest";
import { createDatabase } from "../../service/src/db";
import {
  RunCompletionConflictError,
  RunRepository,
} from "../../service/src/repositories/RunRepository";

describe("SQLite persistence", () => {
  it("creates and completes a run exactly once per idempotency key", () => {
    const database = createDatabase(":memory:");
    const repository = new RunRepository(database);
    const run = repository.startRun(JSON.stringify({ guardCount: 2 }));

    const first = repository.completeRun(run.id, "escape", 42_000, "completion-1");
    const duplicate = repository.completeRun(run.id, "escape", 42_000, "completion-1");

    expect(duplicate).toEqual(first);
    expect(repository.getRun(run.id)).toEqual(first);
    expect(first).toMatchObject({
      id: run.id,
      outcome: "escape",
      durationMs: 42_000,
      completionIdempotencyKey: "completion-1",
    });
  });

  it("rejects idempotency key reuse for a different run", () => {
    const database = createDatabase(":memory:");
    const repository = new RunRepository(database);
    const firstRun = repository.startRun("{}");
    const secondRun = repository.startRun("{}");
    repository.completeRun(firstRun.id, "escape", 42_000, "completion-1");

    expect(() =>
      repository.completeRun(secondRun.id, "escape", 42_000, "completion-1"),
    ).toThrow(RunCompletionConflictError);
    expect(repository.getRun(secondRun.id).outcome).toBeNull();
  });

  it.each([
    ["outcome", "capture" as const, 42_000],
    ["duration", "escape" as const, 99_000],
  ])("rejects idempotency key reuse with a changed %s", (_field, outcome, durationMs) => {
    const database = createDatabase(":memory:");
    const repository = new RunRepository(database);
    const run = repository.startRun("{}");
    repository.completeRun(run.id, "escape", 42_000, "completion-1");

    expect(() => repository.completeRun(run.id, outcome, durationMs, "completion-1")).toThrow(
      RunCompletionConflictError,
    );
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid duration %s before persistence",
    (durationMs) => {
      const database = createDatabase(":memory:");
      const repository = new RunRepository(database);
      const run = repository.startRun("{}");

      expect(() => repository.completeRun(run.id, "capture", durationMs, "completion-1")).toThrow(
        RangeError,
      );
      expect(repository.getRun(run.id).outcome).toBeNull();
    },
  );

  it("creates all Task 2 tables with foreign keys enabled", () => {
    const database = createDatabase(":memory:");
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "runs",
        "run_events",
        "adaptations",
        "reports",
        "completion_requests",
      ]),
    );
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("indexes run events for lookup by run and ordering by insertion id", () => {
    const database = createDatabase(":memory:");
    const indexRows = database.pragma("index_list('run_events')") as Array<{ name: string }>;
    const indexes = indexRows.map((row) => row.name);

    expect(indexes).toContain("idx_run_events_run_id_id");

    const columnRows = database.pragma("index_info('idx_run_events_run_id_id')") as Array<{
      name: string;
    }>;
    const indexedColumns = columnRows.map((row) => row.name);

    expect(indexedColumns).toEqual(["run_id", "id"]);
  });
});
