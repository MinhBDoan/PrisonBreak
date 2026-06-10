# Adaptive Prison Break MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a five-minute Phaser stealth vertical slice whose required Node service stores detailed SQLite run history and uses Codex CLI to select one validated adaptation for every next run.

**Architecture:** A Vite/Phaser browser client renders a deterministic simulation and submits buffered run events to an Express service. The service owns SQLite, weighted analytics, strict Codex CLI invocation, adaptation validation, and next-run configuration. Shared TypeScript contracts keep the client and service aligned.

**Tech Stack:** TypeScript, Vite, Phaser 3, Express, SQLite via `better-sqlite3`, Vitest, Supertest, Zod, Codex CLI

---

## File Structure

```text
package.json                         Workspace scripts and dependencies
tsconfig.base.json                   Shared strict TypeScript settings
shared/contracts.ts                  Browser-service request/response contracts
shared/adaptations.ts                Adaptation allowlist and fairness caps
client/index.html                    Vite entry document and DOM HUD root
client/src/main.ts                   Phaser boot and DOM overlay setup
client/src/scenes/*.ts               Boot, menu, game, and report scenes
client/src/game/*.ts                 Deterministic simulation and gameplay systems
client/src/game/map.ts               Compact hand-authored prison map definition
client/src/render/GameRenderer.ts    Simulation-to-Phaser rendering adapter
client/src/ui/Hud.ts                 DOM HUD and retry/report panels
client/src/api/GameApiClient.ts      Typed service client
service/src/server.ts                Express composition and startup
service/src/db.ts                    SQLite connection and migrations
service/src/routes/*.ts              Readiness and run endpoints
service/src/repositories/*.ts        Run, event, adaptation, and report persistence
service/src/services/*.ts            Analytics, Codex invocation, and validation
tests/client/*.test.ts               Deterministic gameplay unit tests
tests/service/*.test.ts              Service unit and integration tests
tests/contract/*.test.ts             Shared contract tests
```

### Task 1: Scaffold The TypeScript Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `client/index.html`
- Create: `client/src/main.ts`
- Create: `service/src/server.ts`
- Create: `shared/contracts.ts`
- Create: `tests/contract/contracts.test.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import { RunEventSchema } from "../../shared/contracts";

describe("RunEventSchema", () => {
  it("accepts a positioned sprint event", () => {
    expect(RunEventSchema.parse({
      type: "sprint",
      atMs: 1200,
      position: { x: 4, y: 7 },
      payload: {}
    }).type).toBe("sprint");
  });
});
```

- [ ] **Step 2: Add workspace configuration and dependencies**

Create scripts for `dev:client`, `dev:service`, `test`, `typecheck`, and `build`. Add Phaser, Express, `better-sqlite3`, Zod, Vitest, Supertest, TypeScript, Vite, and TSX.

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm install && npm test -- tests/contract/contracts.test.ts`
Expected: FAIL because `shared/contracts.ts` does not yet export `RunEventSchema`.

- [ ] **Step 4: Implement the first shared contract**

```ts
import { z } from "zod";

export const PositionSchema = z.object({ x: z.number(), y: z.number() });
export const RunEventSchema = z.object({
  type: z.enum(["move", "sprint", "hide_enter", "hide_exit", "noise", "detection", "key_collected", "escape", "capture"]),
  atMs: z.number().nonnegative(),
  position: PositionSchema,
  payload: z.record(z.unknown())
});
export type RunEvent = z.infer<typeof RunEventSchema>;
```

- [ ] **Step 5: Add minimal Vite and Express entrypoints**

The client entrypoint creates a Phaser game with an empty scene. The service exports `createApp()` with `GET /api/ready` returning HTTP 503 until persistence is added.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: all commands pass.

Commit: `git commit -am "chore: scaffold prison break workspace"`

### Task 2: Add SQLite Persistence And Readiness

**Files:**
- Create: `service/src/db.ts`
- Create: `service/src/repositories/RunRepository.ts`
- Create: `service/src/routes/readiness.ts`
- Create: `tests/service/persistence.test.ts`
- Modify: `service/src/server.ts`
- Modify: `shared/contracts.ts`

- [ ] **Step 1: Write failing persistence tests**

Test that an in-memory database creates a run, completes it exactly once using an idempotency key, and that `/api/ready` returns `{ database: true, codex: false, ready: false }` when Codex is unavailable.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/service/persistence.test.ts`
Expected: FAIL because database and repository modules do not exist.

- [ ] **Step 3: Implement migrations**

Create tables for `runs`, `run_events`, `adaptations`, `reports`, and `completion_requests`. Use foreign keys, WAL mode, and unique completion idempotency keys.

- [ ] **Step 4: Implement RunRepository**

Expose `startRun(configJson)`, `completeRun(runId, outcome, durationMs, idempotencyKey)`, and `getRun(runId)`. Wrap completion in a SQLite transaction and return the existing result for duplicate keys.

- [ ] **Step 5: Implement readiness route**

Return database health and injected Codex health separately. Set `ready` only when both are true.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/service/persistence.test.ts && npm run typecheck`
Expected: PASS.

Commit: `git add service shared tests && git commit -m "feat: add sqlite persistence and readiness"`

### Task 3: Store Detailed Events And Calculate Weighted Analytics

**Files:**
- Create: `service/src/repositories/EventRepository.ts`
- Create: `service/src/services/AnalyticsService.ts`
- Create: `tests/service/analytics.test.ts`
- Modify: `shared/contracts.ts`

- [ ] **Step 1: Write failing analytics tests**

Seed three runs where recent east-corridor sprinting outweighs older west-corridor usage. Assert the summary identifies `east_corridor`, frequent sprinting, and the favorite hiding spot. Add a test proving changed recent behavior lowers the old route score.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/service/analytics.test.ts`
Expected: FAIL because analytics modules do not exist.

- [ ] **Step 3: Implement EventRepository**

Insert an entire run event buffer transactionally and expose recent completed runs with events. Reject events for unknown or already-finalized runs.

- [ ] **Step 4: Implement weighted analysis**

Use weights `1 / (1 + ageInRuns * 0.35)`. Aggregate corridor visits, hiding usage, sprint ratio, detections, and successful escapes into a `BehaviorSummary`.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/service/analytics.test.ts && npm run typecheck`
Expected: PASS.

Commit: `git add service shared tests && git commit -m "feat: add weighted behavior analytics"`

### Task 4: Integrate Codex CLI And Validate Adaptations

**Files:**
- Create: `shared/adaptations.ts`
- Create: `service/src/services/CodexService.ts`
- Create: `service/src/services/AdaptationValidator.ts`
- Create: `tests/service/adaptation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Test valid choices, rejection of unknown actions, capped levels, reserve-guard prerequisites, malformed JSON, CLI timeout, and non-zero CLI exit.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/service/adaptation.test.ts`
Expected: FAIL because services do not exist.

- [ ] **Step 3: Define the allowlist**

```ts
export const adaptationCaps = {
  increase_corridor_patrol: 3,
  inspect_hiding_spot: 2,
  increase_noise_sensitivity: 2,
  activate_reserve_guard: 1
} as const;
export type AdaptationType = keyof typeof adaptationCaps;
```

- [ ] **Step 4: Implement CodexService**

Invoke the locally configured `codex` executable through `spawn`, send a prompt containing only the behavior summary and allowlist, require JSON `{ action, target, rationale }`, capture stderr, and enforce a 20-second timeout. Make the process runner injectable for tests.

- [ ] **Step 5: Implement AdaptationValidator**

Parse output with Zod, verify action and target, apply prerequisite rules and caps, and return a validated decision or a typed blocking error.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/service/adaptation.test.ts && npm run typecheck`
Expected: PASS.

Commit: `git add shared service tests && git commit -m "feat: add validated codex adaptation selection"`

### Task 5: Complete The Run API And Intelligence Reports

**Files:**
- Create: `service/src/repositories/AdaptationRepository.ts`
- Create: `service/src/repositories/ReportRepository.ts`
- Create: `service/src/routes/runs.ts`
- Create: `tests/service/runs-api.test.ts`
- Modify: `service/src/server.ts`
- Modify: `shared/contracts.ts`

- [ ] **Step 1: Write failing API integration tests**

Test `POST /api/runs`, `POST /api/runs/:id/complete`, duplicate completion retries, successful Codex-selected adaptation storage, and HTTP 503 blocking errors for invalid Codex output.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/service/runs-api.test.ts`
Expected: FAIL because run routes do not exist.

- [ ] **Step 3: Implement run contracts and repositories**

Add `StartRunResponse`, `CompleteRunRequest`, `CompleteRunResponse`, `NextRunConfig`, and `BlockingError` schemas. Persist accepted adaptation levels and reports.

- [ ] **Step 4: Implement routes**

Starting a run returns active adaptations. Completing a run transactionally stores events, calculates analytics, invokes Codex, validates and stores one adaptation, stores the report, and returns the next-run configuration.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/service/runs-api.test.ts && npm test && npm run typecheck`
Expected: PASS.

Commit: `git add shared service tests && git commit -m "feat: add adaptive run lifecycle API"`

### Task 6: Build The Deterministic Prison Simulation

**Files:**
- Create: `client/src/game/types.ts`
- Create: `client/src/game/map.ts`
- Create: `client/src/game/GameSimulation.ts`
- Create: `client/src/game/GuardFSM.ts`
- Create: `client/src/game/DetectionSystem.ts`
- Create: `client/src/game/NoiseSystem.ts`
- Create: `client/src/game/HidingSystem.ts`
- Create: `client/src/game/ObjectiveSystem.ts`
- Create: `client/src/game/RunEventCollector.ts`
- Create: `tests/client/simulation.test.ts`

- [ ] **Step 1: Write failing deterministic simulation tests**

Test wall collision, key collection, exit unlocking, line-of-sight cover, suspicion-to-chase transition, capture threshold, sprint noise, locker concealment, learned locker inspection, and escape completion.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/client/simulation.test.ts`
Expected: FAIL because simulation modules do not exist.

- [ ] **Step 3: Implement the compact map and simulation state**

Define a tile grid with named corridors, walls, security room, key, exit, two lockers, one shadow zone, two patrol routes, and reserve-guard spawn.

- [ ] **Step 4: Implement systems incrementally**

Add fixed-step player movement and collision, objective interactions, event collection, grid raycast detection, noise propagation, hiding, and guard FSM transitions. Keep all rules independent of Phaser.

- [ ] **Step 5: Apply next-run configuration**

Map active adaptation levels to patrol frequency, learned hiding inspections, noise sensitivity, and reserve-guard activation.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/client/simulation.test.ts && npm run typecheck`
Expected: PASS.

Commit: `git add client tests && git commit -m "feat: add deterministic stealth simulation"`

### Task 7: Render The Playable Phaser Vertical Slice

**Files:**
- Create: `client/src/scenes/BootScene.ts`
- Create: `client/src/scenes/MenuScene.ts`
- Create: `client/src/scenes/GameScene.ts`
- Create: `client/src/render/GameRenderer.ts`
- Create: `client/src/ui/Hud.ts`
- Create: `client/src/styles.css`
- Modify: `client/src/main.ts`
- Modify: `client/index.html`

- [ ] **Step 1: Add a renderer smoke test**

Test that `GameRenderer` maps simulation entities to stable render descriptors and that unaware guards omit vision cones.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- tests/client/renderer.test.ts`
Expected: FAIL because renderer does not exist.

- [ ] **Step 3: Implement scenes and renderer**

Render the tile grid with simple shapes, strong silhouettes, warm security lights, player, guards, hiding spots, key, exit, noise ripples, and suspicion-visible vision cones. Use camera follow and restrained effects.

- [ ] **Step 4: Implement DOM HUD**

Show objective, key status, interaction prompt, subtle suspicion indicator, and state banners. Connect WASD, Shift, and E to simulation actions.

- [ ] **Step 5: Verify locally**

Run: `npm test && npm run build`
Expected: PASS.

Run: `npm run dev:client`
Expected: the map renders and a complete escape/capture loop is playable.

- [ ] **Step 6: Commit**

Commit: `git add client tests && git commit -m "feat: render playable prison stealth slice"`

### Task 8: Connect Client Runs, Reports, Retry, And Cumulative Replay

**Files:**
- Create: `client/src/api/GameApiClient.ts`
- Create: `client/src/scenes/ReportScene.ts`
- Create: `tests/contract/run-loop.test.ts`
- Modify: `client/src/scenes/MenuScene.ts`
- Modify: `client/src/scenes/GameScene.ts`
- Modify: `client/src/ui/Hud.ts`

- [ ] **Step 1: Write failing end-to-end contract test**

Use a fake API transport to prove Run 1 events are submitted, the returned adaptation config is applied to Run 2, and a failed completion blocks progression until Retry succeeds.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- tests/contract/run-loop.test.ts`
Expected: FAIL because the API client and report scene do not exist.

- [ ] **Step 3: Implement typed GameApiClient**

Validate every service response with shared Zod schemas. Expose `ready()`, `startRun()`, and `completeRun()` with readable blocking errors.

- [ ] **Step 4: Implement report and retry flow**

On escape or capture, submit events once using a generated idempotency key. Display outcome, learned habit, adaptation, recent trend, and `Begin Next Run`. On failure, display the error and Retry action without permitting the next run.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/contract/run-loop.test.ts && npm test && npm run build`
Expected: PASS.

Commit: `git add client tests && git commit -m "feat: connect cumulative adaptive run loop"`

### Task 9: Final Verification And Portfolio Documentation

**Files:**
- Create: `README.md`
- Create: `.env.example`
- Create: `tests/service/full-loop.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add full-loop integration test**

Use temporary SQLite and fake Codex responses to complete multiple runs. Assert detailed events persist, Run 2 receives Run 1's adaptation, changed recent behavior lowers an older habit score, and duplicate retries remain idempotent.

- [ ] **Step 2: Document setup and architecture**

Document prerequisites, Codex CLI configuration, database location, development commands, test commands, controls, adaptation allowlist, failure behavior, and architecture rationale.

- [ ] **Step 3: Run automated verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all tests pass, TypeScript reports no errors, and both client and service build.

- [ ] **Step 4: Run browser playtest**

Start client and service, then verify:

- Run 1 can end by escape or capture in under five minutes.
- The report blocks until Codex returns a valid action.
- Run 2 visibly applies the selected adaptation.
- Cover, three hiding spots, vision-cone reveal, noise ripples, key, and exit are readable.
- Stopping the service produces a blocking Retry screen.

- [ ] **Step 5: Inspect SQLite**

Query runs, events, adaptations, and reports. Confirm detailed events and cumulative decisions persist across service restart.

- [ ] **Step 6: Commit**

Commit: `git add README.md .env.example package.json tests && git commit -m "docs: finalize adaptive prison break MVP"`

## Plan Self-Review

- Every MVP acceptance criterion maps to Tasks 2–9.
- Required SQLite persistence, detailed events, cumulative learning, decay, fairness caps, Codex selection, blocking failures, and idempotent retry are explicitly covered.
- Gameplay remains deterministic and independent of Phaser.
- No multiple maps, combat, procedural generation, arbitrary Codex rules, or cloud dependencies are introduced.
