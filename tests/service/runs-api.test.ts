import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../service/src/db";
import { createApp } from "../../service/src/server";
import type { ProcessRunner } from "../../service/src/services/CodexService";
import { CompleteRunResponseSchema, StartRunResponseSchema } from "../../shared/contracts";
import type { ServiceDatabase } from "../../service/src/db";

function positionedEvent(type: "move" | "sprint" | "hide_enter", payload: Record<string, unknown>) {
  return {
    type,
    atMs: 100,
    position: { x: 4, y: 7 },
    payload,
  };
}

function createTestApp(processRunner: ProcessRunner, database: ServiceDatabase = createDatabase(":memory:")) {
  return createApp({
    database,
    codexHealth: () => true,
    codexProcessRunner: processRunner,
  });
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("run lifecycle API", () => {
  it("starts a run and returns active adaptations", async () => {
    const app = createTestApp(vi.fn());

    const response = await request(app).post("/api/runs").send({});

    expect(response.status).toBe(201);
    expect(StartRunResponseSchema.parse(response.body)).toEqual({
      runId: 1,
      config: { adaptations: [] },
    });
  });

  it("completes a run, stores events, accepts a Codex-selected adaptation, and returns the next config", async () => {
    const processRunner = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        action: "increase_corridor_patrol",
        target: "east_corridor",
        rationale: "The player repeatedly used the east corridor.",
      }),
      stderr: "",
      timedOut: false,
    }));
    const app = createTestApp(processRunner);
    const start = await request(app).post("/api/runs").send({});

    const response = await request(app)
      .post(`/api/runs/${start.body.runId}/complete`)
      .send({
        outcome: "escape",
        durationMs: 42_000,
        idempotencyKey: "completion-1",
        events: [
          positionedEvent("move", { corridorId: "east_corridor" }),
          positionedEvent("sprint", { corridorId: "east_corridor" }),
        ],
      });

    expect(response.status).toBe(200);
    expect(CompleteRunResponseSchema.parse(response.body)).toMatchObject({
      runId: start.body.runId,
      outcome: "escape",
      report: {
        adaptation: {
          action: "increase_corridor_patrol",
          target: "east_corridor",
          level: 1,
        },
      },
      nextRun: {
        adaptations: [
          {
            action: "increase_corridor_patrol",
            target: "east_corridor",
            level: 1,
          },
        ],
      },
    });
    expect(processRunner).toHaveBeenCalledTimes(1);
  });

  it("returns the same completion response for duplicate completion retries", async () => {
    const processRunner = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        action: "increase_noise_sensitivity",
        target: "global",
        rationale: "The player sprinted frequently.",
      }),
      stderr: "",
      timedOut: false,
    }));
    const app = createTestApp(processRunner);
    const start = await request(app).post("/api/runs").send({});
    const body = {
      outcome: "capture",
      durationMs: 20_000,
      idempotencyKey: "completion-retry",
      events: [
        positionedEvent("sprint", { corridorId: "west_corridor" }),
        positionedEvent("sprint", { corridorId: "west_corridor" }),
      ],
    };

    const first = await request(app).post(`/api/runs/${start.body.runId}/complete`).send(body);
    const duplicate = await request(app).post(`/api/runs/${start.body.runId}/complete`).send(body);

    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toEqual(first.body);
    expect(processRunner).toHaveBeenCalledTimes(1);
  });

  it("does not invoke Codex or apply adaptations twice for concurrent duplicate completions", async () => {
    const releaseCodexCallbacks: Array<() => void> = [];
    const codexStarted = deferred();
    const duplicateCodexStarted = deferred();
    const processRunner = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ProcessRunner>>>((resolveCodex) => {
          if (releaseCodexCallbacks.length === 0) {
            codexStarted.resolve();
          } else {
            duplicateCodexStarted.resolve();
          }
          releaseCodexCallbacks.push(() =>
            resolveCodex({
              exitCode: 0,
              stdout: JSON.stringify({
                action: "increase_noise_sensitivity",
                target: "global",
                rationale: "The player sprinted frequently.",
              }),
              stderr: "",
              timedOut: false,
            }),
          );
        }),
    );
    const app = createTestApp(processRunner);
    const start = await request(app).post("/api/runs").send({});
    const body = {
      outcome: "capture",
      durationMs: 20_000,
      idempotencyKey: "parallel-completion",
      events: [
        positionedEvent("sprint", { corridorId: "west_corridor" }),
        positionedEvent("sprint", { corridorId: "west_corridor" }),
      ],
    };

    const firstCompletion = request(app)
      .post(`/api/runs/${start.body.runId}/complete`)
      .send(body)
      .then((response) => response);
    await codexStarted.promise;
    const duplicateCompletion = request(app)
      .post(`/api/runs/${start.body.runId}/complete`)
      .send(body)
      .then((response) => response);
    await Promise.race([
      duplicateCodexStarted.promise,
      new Promise((resolve) => setTimeout(resolve, 20)),
    ]);
    for (const release of releaseCodexCallbacks) release();
    const [first, duplicate] = await Promise.all([firstCompletion, duplicateCompletion]);
    const nextRun = await request(app).post("/api/runs").send({});

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toEqual(first.body);
    expect(processRunner).toHaveBeenCalledTimes(1);
    expect(nextRun.body.config.adaptations).toHaveLength(1);
  });

  it("keeps duplicate completion responses stable after later adaptations", async () => {
    const decisions = [
      {
        action: "increase_corridor_patrol",
        target: "east_corridor",
        rationale: "The player repeatedly used the east corridor.",
      },
      {
        action: "increase_noise_sensitivity",
        target: "global",
        rationale: "The player sprinted frequently.",
      },
    ];
    const processRunner = vi.fn(async () => ({
      exitCode: 0,
      stdout: JSON.stringify(decisions.shift()),
      stderr: "",
      timedOut: false,
    }));
    const app = createTestApp(processRunner);
    const firstStart = await request(app).post("/api/runs").send({});
    const firstBody = {
      outcome: "escape",
      durationMs: 42_000,
      idempotencyKey: "first-completion",
      events: [
        positionedEvent("move", { corridorId: "east_corridor" }),
        positionedEvent("sprint", { corridorId: "east_corridor" }),
      ],
    };

    const first = await request(app)
      .post(`/api/runs/${firstStart.body.runId}/complete`)
      .send(firstBody);
    const secondStart = await request(app).post("/api/runs").send({});
    await request(app)
      .post(`/api/runs/${secondStart.body.runId}/complete`)
      .send({
        outcome: "capture",
        durationMs: 20_000,
        idempotencyKey: "second-completion",
        events: [
          positionedEvent("sprint", { corridorId: "east_corridor" }),
          positionedEvent("sprint", { corridorId: "east_corridor" }),
        ],
      });

    const firstRetry = await request(app)
      .post(`/api/runs/${firstStart.body.runId}/complete`)
      .send(firstBody);

    expect(firstRetry.body).toEqual(first.body);
  });

  it("blocks with HTTP 503 when Codex output is invalid", async () => {
    const app = createTestApp(
      vi.fn(async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          action: "teleport_guard",
          target: "east_corridor",
          rationale: "Nope.",
        }),
        stderr: "",
        timedOut: false,
      })),
    );
    const start = await request(app).post("/api/runs").send({});

    const response = await request(app)
      .post(`/api/runs/${start.body.runId}/complete`)
      .send({
        outcome: "escape",
        durationMs: 42_000,
        idempotencyKey: "completion-invalid",
        events: [positionedEvent("move", { corridorId: "east_corridor" })],
      });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: {
        code: "invalid_decision",
        message: expect.any(String),
        retryable: true,
      },
    });
  });

  it("rolls back accepted adaptations when completion report persistence fails", async () => {
    const database = createDatabase(":memory:");
    database.exec(`
      CREATE TRIGGER fail_report_insert
      BEFORE INSERT ON reports
      BEGIN
        SELECT RAISE(FAIL, 'forced report failure');
      END;
    `);
    const app = createTestApp(
      vi.fn(async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          action: "increase_corridor_patrol",
          target: "east_corridor",
          rationale: "The player repeatedly used the east corridor.",
        }),
        stderr: "",
        timedOut: false,
      })),
      database,
    );
    const start = await request(app).post("/api/runs").send({});

    const response = await request(app)
      .post(`/api/runs/${start.body.runId}/complete`)
      .send({
        outcome: "escape",
        durationMs: 42_000,
        idempotencyKey: "completion-report-failure",
        events: [positionedEvent("move", { corridorId: "east_corridor" })],
      });
    const nextRun = await request(app).post("/api/runs").send({});

    expect(response.status).toBe(400);
    expect(nextRun.body.config.adaptations).toEqual([]);
  });

  it("blocks one of two different concurrent completions when finalizing both would exceed an adaptation cap", async () => {
    const database = createDatabase(":memory:");
    const seedApp = createTestApp(
      vi.fn(async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          action: "increase_noise_sensitivity",
          target: "global",
          rationale: "The player sprinted frequently.",
        }),
        stderr: "",
        timedOut: false,
      })),
      database,
    );
    const seedStart = await request(seedApp).post("/api/runs").send({});
    await request(seedApp)
      .post(`/api/runs/${seedStart.body.runId}/complete`)
      .send({
        outcome: "capture",
        durationMs: 20_000,
        idempotencyKey: "seed-noise-adaptation",
        events: [
          positionedEvent("sprint", { corridorId: "west_corridor" }),
          positionedEvent("sprint", { corridorId: "west_corridor" }),
        ],
      });

    const releaseCodexCallbacks: Array<() => void> = [];
    const firstConcurrentCodexStarted = deferred();
    const secondConcurrentCodexStarted = deferred();
    let calls = 0;
    const processRunner = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ProcessRunner>>>((resolveCodex) => {
          calls += 1;
          const codexResult = {
            exitCode: 0,
            stdout: JSON.stringify({
              action: "increase_noise_sensitivity",
              target: "global",
              rationale: "The player sprinted frequently.",
            }),
            stderr: "",
            timedOut: false,
          } as const;
          if (calls > 2) {
            resolveCodex(codexResult);
            return;
          }
          if (calls === 1) {
            firstConcurrentCodexStarted.resolve();
          }
          if (calls === 2) {
            secondConcurrentCodexStarted.resolve();
          }
          releaseCodexCallbacks.push(() => resolveCodex(codexResult));
        }),
    );
    const app = createTestApp(processRunner, database);
    const firstStart = await request(app).post("/api/runs").send({});
    const secondStart = await request(app).post("/api/runs").send({});

    const firstCompletion = request(app)
      .post(`/api/runs/${firstStart.body.runId}/complete`)
      .send({
        outcome: "capture",
        durationMs: 21_000,
        idempotencyKey: "parallel-cap-first",
        events: [
          positionedEvent("sprint", { corridorId: "west_corridor" }),
          positionedEvent("sprint", { corridorId: "west_corridor" }),
        ],
      })
      .then((response) => response);
    await firstConcurrentCodexStarted.promise;
    const secondCompletion = request(app)
      .post(`/api/runs/${secondStart.body.runId}/complete`)
      .send({
        outcome: "capture",
        durationMs: 22_000,
        idempotencyKey: "parallel-cap-second",
        events: [
          positionedEvent("sprint", { corridorId: "west_corridor" }),
          positionedEvent("sprint", { corridorId: "west_corridor" }),
        ],
      })
      .then((response) => response);
    await secondConcurrentCodexStarted.promise;
    for (const release of releaseCodexCallbacks) release();

    const [first, second] = await Promise.all([firstCompletion, secondCompletion]);
    const statuses = [first.status, second.status].sort();
    const blocked = [first, second].find((response) => response.status === 503);
    const nextRun = await request(app).post("/api/runs").send({});
    const noiseAdaptation = nextRun.body.config.adaptations.find(
      (adaptation: { action: string }) => adaptation.action === "increase_noise_sensitivity",
    );

    expect(statuses).toEqual([200, 503]);
    expect(blocked?.body).toMatchObject({
      error: {
        code: "invalid_decision",
        retryable: true,
      },
    });
    expect(noiseAdaptation).toMatchObject({
      action: "increase_noise_sensitivity",
      target: "global",
      level: 2,
    });

    const retryBlocked = await request(app)
      .post(`/api/runs/${blocked === first ? firstStart.body.runId : secondStart.body.runId}/complete`)
      .send({
        outcome: "capture",
        durationMs: blocked === first ? 21_000 : 22_000,
        idempotencyKey: blocked === first ? "parallel-cap-first" : "parallel-cap-second",
        events: [
          positionedEvent("sprint", { corridorId: "west_corridor" }),
          positionedEvent("sprint", { corridorId: "west_corridor" }),
        ],
      });
    const afterRetry = await request(app).post("/api/runs").send({});

    expect(retryBlocked.status).toBe(503);
    expect(afterRetry.body.config.adaptations).toEqual(nextRun.body.config.adaptations);
  });
});
