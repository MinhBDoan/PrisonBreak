import express, { type Express } from "express";
import { fileURLToPath } from "node:url";

export function createApp(): Express {
  const app = express();

  app.get("/api/ready", (_request, response) => {
    response.status(503).json({
      database: false,
      codex: false,
      ready: false,
    });
  });

  return app;
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const port = Number(process.env.PORT ?? 3001);
  createApp().listen(port, () => {
    console.log(`Prison Break service listening on port ${port}`);
  });
}
