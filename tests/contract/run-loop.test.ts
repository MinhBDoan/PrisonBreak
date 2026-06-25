import { describe, expect, it } from "vitest";
import { GameApiClient, BlockingApiError, type ApiTransport } from "../../client/src/api/GameApiClient";
import { GameSimulation } from "../../client/src/game/GameSimulation";
import type { CompleteRunRequest } from "../../shared/contracts";

function createTransport(): ApiTransport & {
  completions: CompleteRunRequest[];
  failNextCompletion: boolean;
} {
  const completions: CompleteRunRequest[] = [];
  return {
    completions,
    failNextCompletion: false,
    async request(path, init) {
      if (path === "/api/ready") {
        return { status: 200, body: { database: true, codex: true, ready: true } };
      }
      if (path === "/api/runs" && init?.method === "POST") {
        return { status: 201, body: { runId: completions.length + 1, config: { adaptations: [] } } };
      }
      if (path.endsWith("/complete") && init?.method === "POST") {
        const request = init.body as CompleteRunRequest;
        if (this.failNextCompletion) {
          this.failNextCompletion = false;
          return {
            status: 503,
            body: {
              error: {
                code: "invalid_decision",
                message: "Codex returned an invalid adaptation.",
                retryable: true,
              },
            },
          };
        }
        completions.push(request);
        return {
          status: 200,
          body: {
            runId: Number(path.split("/")[3]),
            outcome: request.outcome,
            report: {
              summary: {
                corridorScores: { east_corridor: 2 },
                hidingSpotScores: {},
                mostUsedCorridor: "east_corridor",
                favoriteHidingSpot: null,
                sprintRatio: 0.5,
                frequentSprinting: false,
                detections: 0,
                successfulEscapes: request.outcome === "escape" ? 1 : 0,
                combat: {
                  primaryStyle: "stealth",
                  favoriteCombatZone: null,
                  gunAttackCount: 0,
                  meleeAttackCount: 0,
                  knockoutCount: 0,
                  killCount: 0,
                  bodyDiscoveryCount: 0,
                  healingUseCount: 0,
                  armedResponseTriggers: 0,
                },
              },
              adaptation: {
                action: "increase_corridor_patrol",
                target: "east_corridor",
                level: 1,
                rationale: "The player favored the east corridor.",
              },
              rationale: "Security is increasing patrol pressure in the east corridor.",
            },
            nextRun: {
              adaptations: [
                {
                  action: "increase_corridor_patrol",
                  target: "east_corridor",
                  level: 1,
                  rationale: "The player favored the east corridor.",
                },
              ],
            },
          },
        };
      }
      return { status: 404, body: { error: { code: "missing", message: "Missing route.", retryable: false } } };
    },
  };
}

describe("adaptive run loop contract", () => {
  it("reports HTML fallthrough responses as service connectivity errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    const client = new GameApiClient();

    try {
      await expect(client.ready()).rejects.toMatchObject({
        blockingError: {
          code: "service_unreachable",
          message: expect.stringContaining("non-JSON response"),
          retryable: true,
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("submits Run 1 events, applies the returned adaptation to Run 2, and blocks until Retry succeeds", async () => {
    const transport = createTransport();
    const client = new GameApiClient({ transport, idempotencyKeyFactory: () => "run-1-completion" });
    const firstRun = await client.startRun();
    const simulation = new GameSimulation({ nextRunConfig: firstRun.config });
    simulation.setPlayerPosition({ x: 10.2, y: 3.5 });
    simulation.step({ direction: { x: 1, y: 0 }, sprint: false, interact: false });
    simulation.step({ direction: { x: 1, y: 0 }, sprint: true, interact: false });

    transport.failNextCompletion = true;
    await expect(
      client.completeRun({
        runId: firstRun.runId,
        outcome: "escape",
        durationMs: 12_000,
        events: simulation.getEvents(),
      }),
    ).rejects.toMatchObject({
      blockingError: {
        code: "invalid_decision",
        retryable: true,
      },
    });
    expect(transport.completions).toHaveLength(0);

    const completion = await client.completeRun({
      runId: firstRun.runId,
      outcome: "escape",
      durationMs: 12_000,
      events: simulation.getEvents(),
    });
    const secondRunSimulation = new GameSimulation({ nextRunConfig: completion.nextRun });

    expect(transport.completions).toHaveLength(1);
    expect(transport.completions[0]).toMatchObject({
      outcome: "escape",
      durationMs: 12_000,
      idempotencyKey: "run-1-completion",
    });
    expect(transport.completions[0]?.events.map((event) => event.type)).toContain("sprint");
    expect(secondRunSimulation.getSnapshot().adaptations.patrolFrequency.east_corridor).toBe(1);
  });

  it("turns malformed service responses into readable blocking errors", async () => {
    const client = new GameApiClient({
      transport: {
        async request() {
          return { status: 200, body: { nope: true } };
        },
      },
    });

    await expect(client.ready()).rejects.toBeInstanceOf(BlockingApiError);
    await expect(client.ready()).rejects.toMatchObject({
      blockingError: {
        code: "invalid_response",
        retryable: true,
      },
    });
  });
});
