# Adaptive Prison Break: MVP Design

## Product Direction

Build a tense but readable five-minute stealth vertical slice that demonstrates cumulative adaptive guard intelligence. The player must collect a key from a guarded security room and return to a locked exit without being captured.

The MVP prioritizes a convincing repeated-run learning loop over a large prison map. It uses deterministic game systems for reliable stealth behavior and requires Codex CLI to select one validated security adaptation after every completed run.

## Gameplay And World

The game takes place in one compact, hand-authored prison wing:

- A cell-area starting corridor
- A guarded security room containing the key
- A locked exit across the map
- Walls and obstacles that provide line-of-sight cover
- Three dedicated hiding spots: two lockers and one shadow zone

The initial run has two patrol guards. A reserve third guard can be activated by an adaptation.

The player uses WASD to move, Shift to sprint, and E to interact. Interactions include collecting the key, entering or leaving dedicated hiding spots, and unlocking the exit. Normal cover works by breaking guard line of sight; dedicated hiding spots provide stronger concealment but can become learned inspection targets.

Sprint movement generates more noise. Guard vision cones remain hidden while guards are unaware, then appear during suspicion, search, and chase. Capture occurs when a guard maintains detection long enough. Escape or capture ends the run.

## Adaptive Learning Loop

Run 2 learns from Run 1, and every later run learns from the accumulated run history.

Each run records:

- Player route and tile heatmap events
- Hiding-spot entries and duration
- Sprint and noise events
- Guard detections and capture progress
- Key collection
- Escape or capture outcome

After a run, deterministic analytics summarize recent and historical behavior. Recent runs receive greater weight, allowing old habits to decay when the player consistently changes strategy.

The required local service sends the behavior summary to Codex CLI. Codex must choose exactly one adaptation from this allowlist:

- Increase patrol frequency in the most-used corridor
- Add a guard inspection near the favorite hiding spot
- Increase noise sensitivity after frequent sprinting
- Activate the reserve guard near the exit after repeated successful escapes

Adaptations accumulate across runs, but each type has a capped level. Changed player behavior reduces the relevance and eventual strength of older adaptations. The service rejects malformed output, actions outside the allowlist, and adaptations that exceed fairness caps.

The accepted adaptation affects the next run and is explained in an intelligence report. If Codex selection, validation, persistence, or report generation fails, the game blocks progression and displays a Retry screen.

## Architecture

The browser client uses Phaser 3, TypeScript, and Vite. A required local Node and Express service owns SQLite persistence and Codex CLI access.

Gameplay state remains outside Phaser scenes. Scenes render state and translate input into simulation actions.

### Browser Client

- `BootScene`: loads assets and map data.
- `MenuScene`: verifies service readiness and starts runs.
- `GameScene`: renders the prison, guards, player, effects, and inputs.
- `ReportScene`: displays the intelligence report and blocks progression until adaptation succeeds.
- `GameSimulation`: owns run state and coordinates gameplay systems.
- `GuardFSM`: handles patrol, investigate, search, chase, and return states.
- `DetectionSystem`: calculates line of sight, cover, suspicion, and capture progress.
- `NoiseSystem`: emits movement noise and applies current sensitivity adaptations.
- `HidingSystem`: handles lockers, shadow zones, and learned inspections.
- `ObjectiveSystem`: tracks key collection and exit unlocking.
- `RunEventCollector`: buffers timestamped gameplay events.
- `GameApiClient`: communicates with the required local service.

### Local Service

- `RunRepository` and `EventRepository`: store runs and detailed events in SQLite.
- `AnalyticsService`: calculates weighted recent and historical behavior statistics.
- `CodexService`: invokes Codex CLI with a strict structured-output prompt.
- `AdaptationValidator`: validates allowlisted actions and applies fairness caps.
- `AdaptationRepository`: stores cumulative adaptation state and history.
- `ReportRepository`: stores generated intelligence reports.

The high-level data flow is:

`player action -> deterministic systems -> run event buffer -> service API -> SQLite -> analytics -> Codex CLI -> validation -> stored adaptation and report -> next-run configuration`

## Persistence Model

SQLite stores detailed events and aggregate statistics so the adaptive behavior is durable, queryable, and debuggable.

Core records include:

- Runs with timestamps, outcome, duration, key status, and active configuration
- Timestamped run events with event type, position, and structured payload
- Tile heatmap aggregates
- Hiding-spot usage aggregates
- Noise, sprint, and detection aggregates
- Adaptation decisions, levels, status, and source report
- Intelligence reports and Codex response metadata

The local service is required to start and complete runs. Service or database failures route to a blocking Retry screen.

## Interface And Presentation

Normal gameplay uses a minimal DOM-based HUD:

- Current objective
- Key status
- Contextual interaction prompt
- Subtle suspicion indicator
- Compact status banners for `Suspicious`, `Searching`, and `Lockdown`

Noise is communicated primarily through footsteps and brief expanding floor ripples. Dedicated hiding spots receive a restrained highlight only when the player is nearby.

The intelligence report is the visual centerpiece between runs. It:

- Summarizes the completed run
- Identifies the learned player habit
- Announces the selected security adaptation
- Shows a compact recent-run trend
- Enables `Begin Next Run` only after validated output is stored
- Shows a blocking Retry panel on service, database, Codex CLI, or validation failure

The visual style uses dark blue-gray prison tiles, warm security lighting, strong silhouettes, and restrained amber and red alert colors.

## Error Handling

The required service exposes a readiness check that verifies API availability, SQLite access, and Codex CLI availability before a run begins.

The game blocks progression with a readable Retry screen when:

- The service is unavailable
- SQLite cannot read or write required data
- Codex CLI fails or times out
- Codex returns malformed output
- Codex selects an invalid or unfair adaptation

Run completion requests must be idempotent so retrying does not duplicate events, adaptations, or reports.

## Testing

- Unit tests cover guard state transitions, line-of-sight detection, noise propagation, event aggregation, historical decay, allowlist validation, and adaptation caps.
- Service integration tests use a temporary SQLite database and fake Codex CLI responses.
- Contract tests verify browser-service agreement for run events, summaries, reports, and next-run configurations.
- A deterministic simulation test proves Run 1 behavior produces the expected Run 2 adaptation and that changed behavior gradually weakens old adaptations.
- Manual playtesting verifies a full run finishes within five minutes, cover and hiding are understandable, and adaptations are noticeable without making escape unreasonable.
- Failure tests verify unavailable services, database errors, malformed Codex output, and invalid actions produce the blocking Retry screen.

## MVP Acceptance Criteria

- The player can collect the key and escape or be captured.
- Guards patrol, investigate, search, chase, return, and inspect learned hiding spots.
- SQLite retains detailed events and cumulative learning across service restarts.
- Every completed run receives one valid Codex-selected adaptation before another run begins.
- Later runs visibly respond to accumulated player behavior.
- Adaptation strength remains capped, and old habits lose influence when player behavior changes.
- The playable vertical slice can be completed in under five minutes.

## Explicit Non-Goals

- Multiple prison maps
- Multiplayer
- Procedural generation
- Combat or player health
- Reinforcement learning
- Arbitrary Codex-generated gameplay rules
- Cloud AI dependencies
