import { prisonMap } from "../game/map";
import type { SimulationSnapshot } from "../game/types";
import type { BlockingError, CompleteRunResponse, RunOutcome } from "../../../shared/contracts";

export type HudBanner = {
  text: string;
  tone: "neutral" | "warn" | "danger" | "success";
};

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function interactionPrompt(snapshot: SimulationSnapshot): string {
  if (snapshot.player.hiddenIn) {
    return "Press E to leave hiding";
  }
  const nearHiding = prisonMap.hidingSpots.find((spot) => distance(spot.position, snapshot.player.position) < 0.75);
  if (nearHiding) {
    return `Press E to hide in ${nearHiding.type === "locker" ? "locker" : "shadow"}`;
  }
  if (!snapshot.objectives.hasKey && distance(prisonMap.key.position, snapshot.player.position) < 0.8) {
    return "Press E to take security key";
  }
  if (distance(prisonMap.exit.position, snapshot.player.position) < 0.9) {
    return snapshot.objectives.hasKey ? "Press E to unlock exit" : "Find the key before using the exit";
  }
  return "WASD move | Shift sprint | E interact";
}

function bannerFor(snapshot: SimulationSnapshot): HudBanner {
  if (snapshot.completed?.outcome === "escape") {
    return { text: "Escaped", tone: "success" };
  }
  if (snapshot.completed?.outcome === "capture") {
    return { text: "Captured", tone: "danger" };
  }
  const mostAlertGuard = snapshot.guards.reduce((best, guard) => (guard.suspicion > best.suspicion ? guard : best));
  if (mostAlertGuard.state === "chase") {
    return { text: "Lockdown", tone: "danger" };
  }
  if (mostAlertGuard.state === "search") {
    return { text: "Searching", tone: "warn" };
  }
  if (mostAlertGuard.state === "investigate" || mostAlertGuard.suspicion > 0) {
    return { text: "Suspicious", tone: "warn" };
  }
  return { text: "Stay quiet", tone: "neutral" };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export class Hud {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add("hud");
  }

  update(snapshot: SimulationSnapshot): void {
    const maxSuspicion = Math.max(0, ...snapshot.guards.map((guard) => guard.suspicion));
    const banner = bannerFor(snapshot);
    const objective = snapshot.objectives.hasKey ? "Reach the locked exit" : "Find the security key";

    this.root.innerHTML = `
      <section class="hud__panel">
        <div class="hud__eyebrow">Objective</div>
        <div class="hud__objective">${objective}</div>
        <div class="hud__row">
          <span>Key</span>
          <strong>${snapshot.objectives.hasKey ? "secured" : "missing"}</strong>
        </div>
        <div class="hud__prompt">${interactionPrompt(snapshot)}</div>
      </section>
      <section class="hud__panel hud__panel--right">
        <div class="hud__banner hud__banner--${banner.tone}">${banner.text}</div>
        <label class="hud__meter-label" for="suspicion-meter">Suspicion</label>
        <div id="suspicion-meter" class="hud__meter">
          <div class="hud__meter-fill" style="width: ${Math.round(maxSuspicion * 100)}%"></div>
        </div>
      </section>
    `;
  }

  showMenu(onStart: () => void): void {
    this.root.innerHTML = `
      <section class="menu-card">
        <p class="hud__eyebrow">Adaptive Prison Break</p>
        <h1>Prison Wing Vertical Slice</h1>
        <p>Slip through patrols, steal the key, and escape before suspicion turns into capture.</p>
        <button class="primary-action" type="button">Begin Run</button>
      </section>
    `;
    this.root.querySelector("button")?.addEventListener("click", onStart);
  }

  showBlockingMenu(message: string, onRetry: () => void): void {
    this.root.innerHTML = `
      <section class="menu-card">
        <p class="hud__eyebrow">Service Required</p>
        <h1>Connection Blocked</h1>
        <p>${escapeHtml(message)}</p>
        <button class="primary-action" type="button">Retry</button>
      </section>
    `;
    this.root.querySelector("button")?.addEventListener("click", onRetry);
  }

  showLoading(message: string): void {
    this.root.innerHTML = `
      <section class="menu-card">
        <p class="hud__eyebrow">Please Wait</p>
        <h1>${escapeHtml(message)}</h1>
        <p>The local service is preparing the adaptive run loop.</p>
      </section>
    `;
  }

  showPaused(): void {
    this.root.innerHTML = `
      <section class="menu-card">
        <p class="hud__eyebrow">Game Paused</p>
        <h1>Game Paused</h1>
        <p>Press Esc again to resume.</p>
      </section>
    `;
  }

  showReportLoading(outcome: RunOutcome): void {
    this.root.innerHTML = `
      <section class="menu-card report-card">
        <p class="hud__eyebrow">Run ${outcome === "escape" ? "Escaped" : "Captured"}</p>
        <h1>Generating Intelligence Report</h1>
        <p>Submitting run events to SQLite and waiting for Codex to select a validated security response.</p>
      </section>
    `;
  }

  showReport(response: CompleteRunResponse, onBeginNextRun: () => void): void {
    const habit = response.report.summary.mostUsedCorridor
      ? `Most-used corridor: ${response.report.summary.mostUsedCorridor}`
      : response.report.summary.favoriteHidingSpot
        ? `Favorite hiding spot: ${response.report.summary.favoriteHidingSpot}`
        : "No dominant habit detected yet";
    const trend = `${Math.round(response.report.summary.successfulEscapes)} escape(s), ${Math.round(response.report.summary.detections)} detection event(s), sprint ratio ${Math.round(response.report.summary.sprintRatio * 100)}%`;
    this.root.innerHTML = `
      <section class="menu-card report-card">
        <p class="hud__eyebrow">Intelligence Report</p>
        <h1>${response.outcome === "escape" ? "Escape Logged" : "Capture Logged"}</h1>
        <p>${escapeHtml(response.report.rationale)}</p>
        <div class="report-card__section">
          <strong>Learned habit</strong>
          <span>${escapeHtml(habit)}</span>
        </div>
        <div class="report-card__section">
          <strong>Security adaptation</strong>
          <span>${escapeHtml(response.report.adaptation.action)} (${escapeHtml(response.report.adaptation.target)}) level ${response.report.adaptation.level}</span>
        </div>
        <div class="report-card__section">
          <strong>Recent trend</strong>
          <span>${escapeHtml(trend)}</span>
        </div>
        <button class="primary-action" type="button">Begin Next Run</button>
      </section>
    `;
    this.root.querySelector("button")?.addEventListener("click", onBeginNextRun);
  }

  showReportError(error: BlockingError["error"], onRetry: () => void): void {
    this.root.innerHTML = `
      <section class="menu-card report-card">
        <p class="hud__eyebrow">Report Blocked</p>
        <h1>Retry Required</h1>
        <p>${escapeHtml(error.message)}</p>
        <div class="report-card__section">
          <strong>Error code</strong>
          <span>${escapeHtml(error.code)}</span>
        </div>
        <button class="primary-action" type="button">Retry</button>
      </section>
    `;
    this.root.querySelector("button")?.addEventListener("click", onRetry);
  }
}
