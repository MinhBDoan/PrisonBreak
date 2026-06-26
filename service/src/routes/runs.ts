import { Router, type Response } from "express";
import { createHash } from "node:crypto";
import {
  BlockingErrorSchema,
  CompleteRunRequestSchema,
  CompleteRunResponseSchema,
  StartRunResponseSchema,
  type CompleteRunResponse,
  type CompleteRunRequest,
  type IntelligenceReport,
  type NextRunConfig,
  type RunOutcome,
} from "../../../shared/contracts";
import type { AdaptationDecision } from "../../../shared/adaptations";
import type { ServiceDatabase } from "../db";
import { AdaptationRepository } from "../repositories/AdaptationRepository";
import { EventRepository } from "../repositories/EventRepository";
import { ReportRepository } from "../repositories/ReportRepository";
import { RunCompletionConflictError, RunRepository } from "../repositories/RunRepository";
import { AnalyticsService } from "../services/AnalyticsService";
import { AdaptationValidator } from "../services/AdaptationValidator";
import { BlockingCodexError, CodexService, type ProcessRunner } from "../services/CodexService";

export interface RunsDependencies {
  database: ServiceDatabase;
  codexProcessRunner?: ProcessRunner;
}

export function createRunsRouter(dependencies: RunsDependencies): Router {
  const router = Router();
  const inFlightCompletions = new Map<string, InFlightCompletion>();
  const runs = new RunRepository(dependencies.database);
  const events = new EventRepository(dependencies.database);
  const adaptations = new AdaptationRepository(dependencies.database);
  const reports = new ReportRepository(dependencies.database);
  const analytics = new AnalyticsService(events);
  const codex = new CodexService({ processRunner: dependencies.codexProcessRunner });
  const adaptationValidator = new AdaptationValidator();

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

    const requestKey = parsed.data.idempotencyKey;
    const requestHash = completionRequestHash(runId, parsed.data);
    const existingInFlight = inFlightCompletions.get(requestKey);
    if (existingInFlight) {
      if (!sameCompletionRequest(existingInFlight, requestHash)) {
        response.status(409).json({
          error: {
            code: "idempotency_conflict",
            message: `Idempotency key ${requestKey} is already being used for a different completion request`,
            retryable: false,
          },
        });
        return;
      }

      try {
        response.json(await existingInFlight.promise);
      } catch (error) {
        writeCompletionError(response, error);
      }
      return;
    }

    const completionPromise = finalizeCompletion({
      database: dependencies.database,
      runs,
      events,
      adaptations,
      reports,
      analytics,
      codex,
      adaptationValidator,
      runId,
      request: parsed.data,
      requestHash,
    });
    inFlightCompletions.set(requestKey, {
      runId,
      outcome: parsed.data.outcome,
      durationMs: parsed.data.durationMs,
      requestHash,
      promise: completionPromise,
    });

    try {
      response.json(await completionPromise);
    } catch (error) {
      writeCompletionError(response, error);
    } finally {
      inFlightCompletions.delete(requestKey);
    }
  });

  return router;
}

interface InFlightCompletion {
  runId: number;
  outcome: RunOutcome;
  durationMs: number;
  requestHash: string;
  promise: Promise<CompleteRunResponse>;
}

async function finalizeCompletion({
  database,
  runs,
  events,
  adaptations,
  reports,
  analytics,
  codex,
  adaptationValidator,
  runId,
  request,
  requestHash,
}: {
  database: ServiceDatabase;
  runs: RunRepository;
  events: EventRepository;
  adaptations: AdaptationRepository;
  reports: ReportRepository;
  analytics: AnalyticsService;
  codex: CodexService;
  adaptationValidator: AdaptationValidator;
  runId: number;
  request: {
    outcome: RunOutcome;
    durationMs: number;
    idempotencyKey: string;
    events: Parameters<EventRepository["insertRunEvents"]>[1];
  };
  requestHash: string;
}): Promise<CompleteRunResponse> {
  const existingRun = runs.getRun(runId);
  const completedRun =
    existingRun.outcome === null
      ? database.transaction(() => completeFreshRun(runs, events, runId, request, requestHash))()
      : runs.completeRun(runId, request.outcome, request.durationMs, request.idempotencyKey, requestHash);

  const existingCompletion = reports.findLatestCompletion(runId);
  if (existingCompletion) return existingCompletion;

  const summary = analytics.summarize();
  const activeBeforeDecision = adaptations.listDecisionHistory();
  const decision = await codex.selectAdaptation(summary, activeBeforeDecision);

  return storeFinalizedCompletion(
    database,
    adaptations,
    reports,
    runId,
    completedRun.outcome as RunOutcome,
    summary,
    decision,
    adaptationValidator,
  );
}

function storeFinalizedCompletion(
  database: ServiceDatabase,
  adaptations: AdaptationRepository,
  reports: ReportRepository,
  runId: number,
  outcome: RunOutcome,
  summary: IntelligenceReport["summary"],
  decision: AdaptationDecision,
  adaptationValidator: AdaptationValidator,
): CompleteRunResponse {
  return database.transaction(() => {
    const existingCompletion = reports.findLatestCompletion(runId);
    if (existingCompletion) return existingCompletion;

    adaptationValidator.validate(decision, summary, adaptations.listDecisionHistory());
    const acceptedAdaptation = adaptations.storeAccepted(runId, decision);
    const report: IntelligenceReport = {
      summary,
      adaptation: acceptedAdaptation,
      rationale: decision.rationale,
    };
    const completion = completionResponse(runId, outcome, report, adaptations);

    return reports.store(runId, completion);
  })();
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
  requestHash: string,
) {
  events.insertRunEvents(runId, request.events);
  return runs.completeRun(runId, request.outcome, request.durationMs, request.idempotencyKey, requestHash);
}

function sameCompletionRequest(inFlight: InFlightCompletion, requestHash: string): boolean {
  return inFlight.requestHash === requestHash;
}

function completionRequestHash(runId: number, request: CompleteRunRequest): string {
  return createHash("sha256")
    .update(stableJson({ runId, outcome: request.outcome, durationMs: request.durationMs, events: request.events }))
    .digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }
  return value;
}

function writeCompletionError(response: Response, error: unknown): void {
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
