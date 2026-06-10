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

export function resolveHost(host: string | undefined): string {
  return host ?? "127.0.0.1";
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const host = resolveHost(process.env.HOST);
  const port = Number(process.env.PORT ?? 3001);
  createApp().listen(port, host, () => {
    console.log(`Prison Break service listening on http://${host}:${port}`);
  });
}
