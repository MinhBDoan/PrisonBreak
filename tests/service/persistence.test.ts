import { describe, expect, it } from "vitest";
import { createDatabase } from "../../service/src/db";
import { RunRepository } from "../../service/src/repositories/RunRepository";

describe("SQLite persistence", () => {
  it("creates and completes a run exactly once per idempotency key", () => {
    const database = createDatabase(":memory:");
    const repository = new RunRepository(database);
    const run = repository.startRun(JSON.stringify({ guardCount: 2 }));

    const first = repository.completeRun(run.id, "escape", 42_000, "completion-1");
    const duplicate = repository.completeRun(run.id, "capture", 99_000, "completion-1");

    expect(duplicate).toEqual(first);
    expect(repository.getRun(run.id)).toEqual(first);
    expect(first).toMatchObject({
      id: run.id,
      outcome: "escape",
      durationMs: 42_000,
      completionIdempotencyKey: "completion-1",
    });
  });

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
});
