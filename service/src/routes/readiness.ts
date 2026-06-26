import { Router } from "express";
import type { ServiceDatabase } from "../db";

export interface ReadinessDependencies {
  database?: ServiceDatabase;
  codexHealth?: () => boolean | Promise<boolean>;
}

export function createReadinessRouter(dependencies: ReadinessDependencies): Router {
  const router = Router();
  router.get("/", async (_request, response) => {
    let database = false;
    let codex = false;
    try {
      dependencies.database?.prepare("SELECT 1").get();
      database = dependencies.database !== undefined;
    } catch {}
    try {
      codex = (await dependencies.codexHealth?.()) ?? false;
    } catch {}
    const ready = database && codex;
    response.status(ready ? 200 : 503).json({ database, codex, ready });
  });
  return router;
}
