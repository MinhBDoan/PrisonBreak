import express, { type Express } from "express";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./db";
import {
  createReadinessRouter,
  type ReadinessDependencies,
} from "./routes/readiness";

export function createApp(dependencies: ReadinessDependencies = {}): Express {
  const app = express();

  app.use("/api/ready", createReadinessRouter(dependencies));

  return app;
}

export function resolveHost(host: string | undefined): string {
  return host ?? "127.0.0.1";
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const host = resolveHost(process.env.HOST);
  const port = Number(process.env.PORT ?? 3001);
  const database = createDatabase(process.env.DATABASE_PATH ?? "prison-break.sqlite");
  createApp({ database, codexHealth: () => false }).listen(port, host, () => {
    console.log(`Prison Break service listening on http://${host}:${port}`);
  });
}
