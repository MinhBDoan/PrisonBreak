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
  app.use(express.json());
  app.use("/api/ready", createReadinessRouter(dependencies));
  if (dependencies.database) {
    app.use("/api/runs", createRunsRouter({ database: dependencies.database, codexProcessRunner: dependencies.codexProcessRunner }));
  }

  return app;
}

function localBrowserCors(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction,
): void {
  const origin = request.header("origin");
  if (origin === "http://127.0.0.1:5173" || origin === "http://localhost:5173") {
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
