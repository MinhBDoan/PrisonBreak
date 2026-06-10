import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../service/src/db";
import { createApp } from "../../service/src/server";
import type { ProcessRunner } from "../../service/src/services/CodexService";
import { CompleteRunResponseSchema, StartRunResponseSchema } from "../../shared/contracts";

function positionedEvent(type: "move" | "sprint" | "hide_enter", payload: Record<string, unknown>) {
  return {
    type,
    atMs: 100,
    position: { x: 4, y: 7 },
    payload,
  };
}

function createTestApp(processRunner: ProcessRunner) {
  return createApp({
    database: createDatabase(":memory:"),
    codexHealth: () => true,
    codexProcessRunner: processRunner,
  });
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
});
