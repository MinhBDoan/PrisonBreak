# Adaptive Prison Break

Adaptive Prison Break is a Phaser 3 stealth vertical slice backed by a required local Node service. The browser client handles the playable prison wing, while the service owns SQLite persistence, cumulative analytics, and Codex CLI-selected guard adaptations between runs.

## Prerequisites

- Node.js 20 or newer
- npm
- Codex CLI installed and available on the service machine
- A terminal that can run both the Vite client and the Express service

Install dependencies:

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` if you want a local reference for environment values. The service reads environment variables from the shell, so export them or set them before starting `npm run dev:service`.

```bash
HOST=127.0.0.1
PORT=3001
DATABASE_PATH=./data/prison-break.sqlite
CODEX_EXECUTABLE=codex
```

`HOST` defaults to `127.0.0.1` so the Codex/SQLite service is not exposed to the local network by accident. `PORT` defaults to `3001`. `DATABASE_PATH` defaults to `prison-break.sqlite` in the working directory. `CODEX_EXECUTABLE` defaults to `codex`. Readiness checks run the configured Codex executable with `--version` using a short timeout, so the menu stays blocked until the CLI is installed and runnable.

Create the database directory before using a nested `DATABASE_PATH`:

```bash
mkdir -p data
```

On Windows PowerShell, set values like this:

```powershell
$env:DATABASE_PATH = ".\data\prison-break.sqlite"
$env:CODEX_EXECUTABLE = "codex"
npm run dev:service
```

## Development

Run the service:

```bash
npm run dev:service
```

Run the browser client in another terminal:

```bash
npm run dev:client
```

Open the Vite URL printed by the client, usually `http://localhost:5173`. The client expects the service at `http://127.0.0.1:3001`.

## Test And Build

```bash
npm test
npm run typecheck
npm run build
```

Useful focused checks:

```bash
npm test -- tests/service/full-loop.test.ts
npm test -- tests/contract/run-loop.test.ts
npm test -- tests/client/simulation.test.ts
```

## Controls

- `WASD`: move
- `Shift`: sprint
- `E`: interact with the key, exit, lockers, and shadow hiding spot

The objective is to collect the security key, reach the locked exit, and escape. Being detected long enough causes capture and ends the run.

## Adaptive Loop

Each completed run sends detailed timestamped events to the service. SQLite stores the run, event buffer, completion request hash, accepted adaptation, and report. Analytics weight recent runs more heavily with gradual decay, so changed behavior can lower older habit scores over time.

After a run completes:

1. The service persists the event buffer.
2. Analytics summarize route usage, hiding usage, sprinting, detections, and escapes.
3. Codex CLI receives the summary and the allowlist.
4. The service validates exactly one selected adaptation.
5. The adaptation and report are stored atomically.
6. The next run starts with the updated adaptation config.

Duplicate completion retries use the same idempotency key and return the stored response without reinvoking Codex. Reusing an idempotency key with a changed event payload returns a conflict.

## Adaptation Allowlist

Codex may choose only one of these validated actions after each run:

- `increase_corridor_patrol`: increases patrol pressure in the most-used corridor, capped at level 3.
- `inspect_hiding_spot`: adds guard checks near the favorite hiding spot, capped at level 2.
- `increase_noise_sensitivity`: makes guards respond to sprint noise from farther away, capped at level 2.
- `activate_reserve_guard`: activates the reserve guard near the exit after repeated successful escapes, capped at level 1.

Invalid actions, invalid targets, cap violations, malformed JSON, CLI timeouts, non-zero CLI exits, and output-limit breaches block progression with a retryable service error.

## Failure Behavior

The client treats service, database, Codex, validation, and completion failures as blocking. The report screen shows the error and a Retry action. It does not begin the next run until the service has stored a valid adaptation and report.

The service also protects the adaptive loop:

- Adaptation and report writes happen in one transaction.
- Concurrent duplicate completions share one in-flight finalization.
- Finalization revalidates caps against current adaptation history.
- Codex process output is bounded and timed-out processes are cleaned up.

## Architecture Rationale

The Phaser client stays thin: scenes translate input into deterministic simulation actions and render snapshots. Gameplay rules live in Phaser-independent systems for movement, detection, noise, hiding, objectives, guard state, and event collection.

The Node service owns persistence and adaptation because browser storage is not enough for a portfolio-grade cumulative learning loop. SQLite keeps detailed run history queryable across restarts, and the service is the trust boundary for Codex CLI execution, validation, idempotency, and failure handling.
