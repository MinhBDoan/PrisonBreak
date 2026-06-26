import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp, resolveHost } from "../../service/src/server";
import { createDatabase } from "../../service/src/db";

describe("service readiness", () => {
  it("reports database and injected Codex health separately", async () => {
    const response = await request(
      createApp({
        database: createDatabase(":memory:"),
        codexHealth: () => false,
      }),
    ).get("/api/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      database: true,
      codex: false,
      ready: false,
    });
  });

  it("allows browser client requests from the local Vite origin", async () => {
    const response = await request(
      createApp({
        database: createDatabase(":memory:"),
        codexHealth: () => true,
      }),
    )
      .options("/api/ready")
      .set("Origin", "http://127.0.0.1:5173");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("allows browser client requests from alternate local Vite ports", async () => {
    const response = await request(
      createApp({
        database: createDatabase(":memory:"),
        codexHealth: () => true,
      }),
    )
      .options("/api/ready")
      .set("Origin", "http://127.0.0.1:5174");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5174");
  });

  it("accepts large run completion payloads without falling through to an HTML parser error", async () => {
    const app = createApp({
      database: createDatabase(":memory:"),
      codexHealth: () => true,
      codexProcessRunner: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          action: "increase_corridor_patrol",
          target: "west_corridor",
          rationale: "The player repeatedly used the west corridor.",
        }),
        stderr: "",
        timedOut: false,
      }),
    });
    const start = await request(app).post("/api/runs").send({});
    const events = Array.from({ length: 4_000 }, (_, index) => ({
      type: "move",
      atMs: index * 100,
      position: { x: 1 + (index % 10) / 10, y: 2 },
      payload: { corridorId: "west_corridor", sample: "x".repeat(40) },
    }));

    const response = await request(app)
      .post(`/api/runs/${start.body.runId}/complete`)
      .send({
        outcome: "escape",
        durationMs: 12_000,
        idempotencyKey: "large-completion",
        events,
      });

    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).not.toEqual({});
  });

  it("returns JSON when request body parsing fails", async () => {
    const response = await request(
      createApp({
        database: createDatabase(":memory:"),
        codexHealth: () => true,
      }),
    )
      .post("/api/runs/1/complete")
      .set("Content-Type", "application/json")
      .send("{not-json");

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).toEqual({
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON.",
        retryable: false,
      },
    });
  });
});

describe("resolveHost", () => {
  it("binds to localhost by default", () => {
    expect(resolveHost(undefined)).toBe("127.0.0.1");
  });

  it("allows an explicit host override", () => {
    expect(resolveHost("0.0.0.0")).toBe("0.0.0.0");
  });
});
