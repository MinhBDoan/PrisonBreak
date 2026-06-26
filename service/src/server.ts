import express, { type Express } from "express";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./db";
import {
  createReadinessRouter,
  type ReadinessDependencies,
} from "./routes/readiness";
import { createRunsRouter, type RunsDependencies } from "./routes/runs";
import {
  createCodexHealthCheck,
  resolveCodexExecutable,
} from "./services/CodexHealth";
import type { ProcessRunner } from "./services/CodexService";

export type AppDependencies = ReadinessDependencies & Partial<RunsDependencies>;

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();

  app.use(localBrowserCors);
  app.use(express.json({ limit: "2mb" }));
  app.use(jsonBodyErrorHandler);
  app.use("/api/ready", createReadinessRouter(dependencies));
  if (dependencies.database) {
    app.use("/api/runs", createRunsRouter({ database: dependencies.database, codexProcessRunner: dependencies.codexProcessRunner }));
  }

  return app;
}

function jsonBodyErrorHandler(
  error: unknown,
  _request: express.Request,
  response: express.Response,
  next: express.NextFunction,
): void {
  if (isRequestEntityTooLarge(error)) {
    response.status(413).json({
      error: {
        code: "request_too_large",
        message: "Run completion payload is too large. Please retry with a shorter run.",
        retryable: false,
      },
    });
    return;
  }

  if (error instanceof SyntaxError) {
    response.status(400).json({
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON.",
        retryable: false,
      },
    });
    return;
  }

  next(error);
}

function isRequestEntityTooLarge(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type?: unknown }).type === "entity.too.large"
  );
}

function localBrowserCors(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction,
): void {
  const origin = request.header("origin");
  if (origin && /^http:\/\/(127\.0\.0\.1|localhost):517\d$/.test(origin)) {
    response.header("Access-Control-Allow-Origin", origin);
    response.header("Vary", "Origin");
    response.header("Access-Control-Allow-Headers", "Content-Type");
    response.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  next();
}

export function resolveHost(host: string | undefined): string {
  return host ?? "127.0.0.1";
}

export function createProductionDependencies(
  env: NodeJS.ProcessEnv = process.env,
  processRunner?: ProcessRunner,
): AppDependencies {
  const database = createDatabase(env.DATABASE_PATH ?? "prison-break.sqlite");
  return {
    database,
    codexHealth: createCodexHealthCheck({
      executable: resolveCodexExecutable(env),
      processRunner,
    }),
  };
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const host = resolveHost(process.env.HOST);
  const port = Number(process.env.PORT ?? 3001);
  createApp(createProductionDependencies()).listen(port, host, () => {
    console.log(`Prison Break service listening on http://${host}:${port}`);
  });
}
