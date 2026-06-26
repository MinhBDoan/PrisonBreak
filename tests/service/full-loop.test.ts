import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type ServiceDatabase } from "../../service/src/db";
import { EventRepository } from "../../service/src/repositories/EventRepository";
import { createApp } from "../../service/src/server";
import { AnalyticsService } from "../../service/src/services/AnalyticsService";
import type { ProcessRunner } from "../../service/src/services/CodexService";
import { CompleteRunResponseSchema, StartRunResponseSchema, type RunEvent } from "../../shared/contracts";

let tempDirs: string[] = [];
let tempDatabases: ServiceDatabase[] = [];

afterEach(async () => {
  for (const database of tempDatabases) {
    database.close();
  }
  tempDatabases = [];
  for (const tempDir of tempDirs) {
    await rm(tempDir, { force: true, recursive: true });
  }
  tempDirs = [];
});

function runEvent(
  type: RunEvent["type"],
  atMs: number,
  payload: Record<string, unknown>,
): RunEvent {
  return {
    type,
    atMs,
    position: { x: 4, y: 7 },
    payload,
  };
}

function movementEvents(corridorId: string, count: number): RunEvent[] {
  return Array.from({ length: count }, (_unused, index) =>
    runEvent("move", 100 + index * 100, { corridorId }),
  );
}

async function createTempDatabase(): Promise<ServiceDatabase> {
  const tempDir = await mkdtemp(join(tmpdir(), "prison-break-full-loop-"));
  tempDirs.push(tempDir);
  const database = createDatabase(join(tempDir, "test.sqlite"));
  tempDatabases.push(database);
  return database;
}

describe("adaptive run full loop", () => {
  it("persists detailed events, carries adaptations forward, decays old habits, and keeps retries idempotent", async () => {
    const database = await createTempDatabase();
    const decisions = [
      {
        action: "increase_corridor_patrol",
        target: "east_corridor",
        rationale: "The player repeatedly used the east corridor.",
      },
      {
        action: "increase_corridor_patrol",
        target: "west_corridor",
        rationale: "Recent runs shifted toward the west corridor.",
      },
      {
        action: "increase_corridor_patrol",
        target: "west_corridor",
        rationale: "The west corridor remained the newer habit.",
      },
      {
        action: "place_armed_response",
        target: "security_room",
        rationale: "Gunfire and a death escalated combat in the security room.",
      },
    ];
    const processRunner: ProcessRunner = vi.fn(async () => {
      const decision = decisions.shift();
      if (!decision) throw new Error("Unexpected Codex invocation");
      return {
        exitCode: 0,
        stdout: JSON.stringify(decision),
        stderr: "",
        timedOut: false,
      };
    });
    const app = createApp({
      database,
      codexHealth: () => true,
      codexProcessRunner: processRunner,
    });
    const analytics = new AnalyticsService(new EventRepository(database));

    const firstStart = StartRunResponseSchema.parse(
      (await request(app).post("/api/runs").send({})).body,
    );
    const firstBody = {
      outcome: "escape",
      durationMs: 45_000,
      idempotencyKey: "run-1-completion",
      events: [
        ...movementEvents("east_corridor", 4),
        runEvent("hide_enter", 700, { hidingSpotId: "locker_2" }),
        runEvent("escape", 45_000, {}),
      ],
    };
    const firstCompletion = await request(app)
      .post(`/api/runs/${firstStart.runId}/complete`)
      .send(firstBody);

    expect(firstCompletion.status).toBe(200);
    const firstResponse = CompleteRunResponseSchema.parse(firstCompletion.body);
    expect(firstResponse.nextRun.adaptations).toContainEqual(
      expect.objectContaining({
        action: "increase_corridor_patrol",
        target: "east_corridor",
        level: 1,
      }),
    );
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM run_events WHERE run_id = ?")
        .get(firstStart.runId),
    ).toEqual({ count: firstBody.events.length });

    const duplicate = await request(app)
      .post(`/api/runs/${firstStart.runId}/complete`)
      .send(firstBody);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toEqual(firstResponse);
    expect(processRunner).toHaveBeenCalledTimes(1);

    const secondStart = StartRunResponseSchema.parse(
      (await request(app).post("/api/runs").send({})).body,
    );
    expect(secondStart.config.adaptations).toContainEqual(
      expect.objectContaining({
        action: "increase_corridor_patrol",
        target: "east_corridor",
        level: 1,
      }),
    );

    const oldEastScore = analytics.summarize().corridorScores.east_corridor;

    await request(app)
      .post(`/api/runs/${secondStart.runId}/complete`)
      .send({
        outcome: "capture",
        durationMs: 35_000,
        idempotencyKey: "run-2-completion",
        events: movementEvents("west_corridor", 8),
      })
      .expect(200);
    const thirdStart = StartRunResponseSchema.parse(
      (await request(app).post("/api/runs").send({})).body,
    );
    await request(app)
      .post(`/api/runs/${thirdStart.runId}/complete`)
      .send({
        outcome: "capture",
        durationMs: 32_000,
        idempotencyKey: "run-3-completion",
        events: movementEvents("west_corridor", 8),
      })
      .expect(200);

    const updatedSummary = analytics.summarize();
    expect(updatedSummary.corridorScores.east_corridor).toBeLessThan(oldEastScore);
    expect(updatedSummary.mostUsedCorridor).toBe("west_corridor");

    const combatStart = StartRunResponseSchema.parse(
      (await request(app).post("/api/runs").send({})).body,
    );
    await request(app)
      .post(`/api/runs/${combatStart.runId}/complete`)
      .send({
        outcome: "death",
        durationMs: 28_000,
        idempotencyKey: "run-4-combat-death",
        events: [
          ...movementEvents("security_room", 3),
          runEvent("attack", 12_000, { weaponId: "pistol", zoneId: "security_room" }),
          runEvent("attack", 12_800, { weaponId: "pistol", zoneId: "security_room" }),
          runEvent("kill", 13_100, { guardId: "guard-a", weaponId: "pistol", zoneId: "security_room" }),
          runEvent("armed_response_triggered", 14_000, { zoneId: "security_room" }),
          runEvent("death", 28_000, { reason: "hp_depleted" }),
        ],
      })
      .expect(200);
    const combatNextStart = StartRunResponseSchema.parse(
      (await request(app).post("/api/runs").send({})).body,
    );

    expect(combatNextStart.config.adaptations).toContainEqual(
      expect.objectContaining({
        action: "place_armed_response",
        target: "security_room",
        level: 1,
      }),
    );
    expect(analytics.summarize().combat).toMatchObject({
      primaryStyle: "gun",
      favoriteCombatZone: "security_room",
      gunAttackCount: 2,
      killCount: 1,
      armedResponseTriggers: 1,
    });
    expect(processRunner).toHaveBeenCalledTimes(4);
  });
});
