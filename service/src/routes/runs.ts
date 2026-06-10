import { Router } from "express";
import {
  BlockingErrorSchema,
  CompleteRunRequestSchema,
  CompleteRunResponseSchema,
  StartRunResponseSchema,
  type CompleteRunResponse,
  type IntelligenceReport,
  type NextRunConfig,
  type RunOutcome,
} from "../../../shared/contracts";
import type { ServiceDatabase } from "../db";
import { AdaptationRepository } from "../repositories/AdaptationRepository";
import { EventRepository } from "../repositories/EventRepository";
import { ReportRepository } from "../repositories/ReportRepository";
import { RunCompletionConflictError, RunRepository } from "../repositories/RunRepository";
import { AnalyticsService } from "../services/AnalyticsService";
import { BlockingCodexError, CodexService, type ProcessRunner } from "../services/CodexService";

export interface RunsDependencies {
  database: ServiceDatabase;
  codexProcessRunner?: ProcessRunner;
}

export function createRunsRouter(dependencies: RunsDependencies): Router {
  const router = Router();
  const runs = new RunRepository(dependencies.database);
  const events = new EventRepository(dependencies.database);
  const adaptations = new AdaptationRepository(dependencies.database);
  const reports = new ReportRepository(dependencies.database);
  const analytics = new AnalyticsService(events);
  const codex = new CodexService({ processRunner: dependencies.codexProcessRunner });

  router.post("/", (_request, response) => {
    const config = nextRunConfig(adaptations);
    const run = runs.startRun(JSON.stringify(config));

    response.status(201).json(StartRunResponseSchema.parse({ runId: run.id, config }));
  });

  router.post("/:id/complete", async (request, response) => {
    const runId = Number(request.params.id);
    const parsed = CompleteRunRequestSchema.safeParse(request.body);
    if (!Number.isInteger(runId) || runId <= 0 || !parsed.success) {
      response.status(400).json({ error: { code: "bad_request", message: "Invalid run completion request.", retryable: false } });
      return;
    }

    try {
      const existingRun = runs.getRun(runId);
      const completedRun =
        existingRun.outcome === null
          ? dependencies.database.transaction(() =>
              completeFreshRun(runs, events, runId, parsed.data),
            )()
          : runs.completeRun(runId, parsed.data.outcome, parsed.data.durationMs, parsed.data.idempotencyKey);

      const existingCompletion = reports.findLatestCompletion(runId);
      if (existingCompletion) {
        response.json(existingCompletion);
        return;
      }

      const summary = analytics.summarize();
      const activeBeforeDecision = adaptations.listDecisionHistory();
      const decision = await codex.selectAdaptation(summary, activeBeforeDecision);
      const acceptedAdaptation = adaptations.storeAccepted(runId, decision);
      const report: IntelligenceReport = {
        summary,
        adaptation: acceptedAdaptation,
        rationale: decision.rationale,
      };
      const completion = completionResponse(
        runId,
        completedRun.outcome as RunOutcome,
        report,
        adaptations,
      );

      response.json(reports.store(runId, completion));
    } catch (error) {
      if (error instanceof BlockingCodexError) {
        response.status(503).json(
          BlockingErrorSchema.parse({
            error: {
              code: error.code,
              message: error.message,
              retryable: true,
            },
          }),
        );
        return;
      }
      if (error instanceof RunCompletionConflictError) {
        response.status(409).json({
          error: {
            code: "idempotency_conflict",
            message: error.message,
            retryable: false,
          },
        });
        return;
      }
      response.status(400).json({
        error: {
          code: "run_completion_failed",
          message: error instanceof Error ? error.message : "Run completion failed.",
          retryable: false,
        },
      });
    }
  });

  return router;
}

function completeFreshRun(
  runs: RunRepository,
  events: EventRepository,
  runId: number,
  request: {
    outcome: RunOutcome;
    durationMs: number;
    idempotencyKey: string;
    events: Parameters<EventRepository["insertRunEvents"]>[1];
  },
) {
  events.insertRunEvents(runId, request.events);
  return runs.completeRun(runId, request.outcome, request.durationMs, request.idempotencyKey);
}

function nextRunConfig(adaptations: AdaptationRepository): NextRunConfig {
  return { adaptations: adaptations.listActive() };
}

function completionResponse(
  runId: number,
  outcome: RunOutcome,
  report: IntelligenceReport,
  adaptations: AdaptationRepository,
): CompleteRunResponse {
  return CompleteRunResponseSchema.parse({
    runId,
    outcome,
    report,
    nextRun: nextRunConfig(adaptations),
  });
}
