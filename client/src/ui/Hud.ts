import { prisonMap } from "../game/map";
import type { SimulationSnapshot } from "../game/types";
import type { BlockingError, CompleteRunResponse, RunOutcome } from "../../../shared/contracts";
import { weapons } from "../game/weapons";

export type HudBanner = {
  text: string;
  tone: "neutral" | "warn" | "danger" | "success";
};

export type HudModel = {
  objective: string;
  keyLabel: string;
  pebbleCount: number;
  healthLabel: string;
  healthPercent: number;
  meleeLabel: string;
  gunLabel: string;
  ammoLabel: string;
  reloadLabel: string;
  healingItemsLabel: string;
  alertLabel: string;
  alertTone: HudBanner["tone"];
  suspicionPercent: number;
  prompt: string;
  banner: HudBanner;
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
  const nearPebble = snapshot.pebbles.some(
    (pebble) => !pebble.collected && distance(pebble.position, snapshot.player.position) < 0.75,
  );
  if (nearPebble) {
    return "Press E to pick up pebble";
  }
  if (distance(prisonMap.exit.position, snapshot.player.position) < 0.9) {
    return snapshot.objectives.hasKey ? "Press E to unlock exit" : "Find the key before using the exit";
  }
  if (snapshot.player.pebbles > 0) {
    return "Hold left mouse to charge throw, release to throw";
  }
  return "WASD move | Shift sprint | E interact";
}

function bannerFor(snapshot: SimulationSnapshot): HudBanner {
  if (snapshot.completed?.outcome === "escape") {
    return { text: "Escaped", tone: "success" };
  }
  if (snapshot.completed?.outcome === "death") {
    return { text: "Dead", tone: "danger" };
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

function formatAlertLevel(level: string): string {
  return level
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function alertTone(level: string): HudBanner["tone"] {
  if (level === "alert" || level === "armed_response" || level === "lockdown_pressure") {
    return "danger";
  }
  if (level === "suspicious") {
    return "warn";
  }
  return "neutral";
}

export function createHudModel(snapshot: SimulationSnapshot): HudModel {
  const health = snapshot.player.health ?? { entityId: "player", hp: 100, maxHp: 100, isDown: false };
  const weaponState = snapshot.player.weapons;
  const gunId = weaponState?.primaryGunId ?? weaponState?.sidearmId ?? null;
  const gun = gunId ? weapons[gunId] : null;
  const loadedAmmo = gun ? (weaponState?.ammoByWeapon[gun.id] ?? 0) : 0;
  const reserveAmmo = gun ? (weaponState?.reserveAmmoByType[gun.ammoType] ?? 0) : 0;
  const reloadLabel = weaponState?.reload
    ? `Reloading ${Math.ceil(weaponState.reload.remainingMs / 1000)}s`
    : "Ready";
  const maxSuspicion = Math.max(0, ...snapshot.guards.map((guard) => guard.suspicion));
  const alert = snapshot.alert ?? { level: "calm", pressure: 0, armedResponseTriggered: false };

  return {
    objective: snapshot.objectives.hasKey ? "Reach the locked exit" : "Find the security key",
    keyLabel: snapshot.objectives.hasKey ? "secured" : "missing",
    pebbleCount: snapshot.player.pebbles,
    healthLabel: `${Math.ceil(health.hp)} / ${Math.ceil(health.maxHp)}`,
    healthPercent: Math.round((health.hp / Math.max(1, health.maxHp)) * 100),
    meleeLabel: weapons[weaponState?.meleeWeaponId ?? "fists"].label,
    gunLabel: gun?.label ?? "No gun",
    ammoLabel: gun ? `${loadedAmmo} / ${reserveAmmo}` : "-",
    reloadLabel,
    healingItemsLabel: String(weaponState?.healingItems ?? 0),
    alertLabel: formatAlertLevel(alert.level),
    alertTone: alertTone(alert.level),
    suspicionPercent: Math.round(maxSuspicion * 100),
    prompt: interactionPrompt(snapshot),
    banner: bannerFor(snapshot),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapePercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export class Hud {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add("hud");
  }

  update(snapshot: SimulationSnapshot): void {
    const model = createHudModel(snapshot);
    const healthPercent = escapePercent(model.healthPercent);
    const suspicionPercent = escapePercent(model.suspicionPercent);

    this.root.innerHTML = `
      <section class="hud__panel">
        <div class="hud__eyebrow">Objective</div>
        <div class="hud__objective">${escapeHtml(model.objective)}</div>
        <div class="hud__row">
          <span>Key</span>
          <strong>${escapeHtml(model.keyLabel)}</strong>
        </div>
        <div class="hud__row">
          <span>Pebbles</span>
          <strong>${model.pebbleCount}</strong>
        </div>
        <div class="hud__prompt">${escapeHtml(model.prompt)}</div>
      </section>
      <section class="hud__panel hud__panel--right">
        <div class="hud__banner hud__banner--${model.banner.tone}">${escapeHtml(model.banner.text)}</div>
        <div class="hud__row hud__row--compact">
          <span>Health</span>
          <strong>${escapeHtml(model.healthLabel)}</strong>
        </div>
        <div class="hud__meter hud__meter--health">
          <div class="hud__meter-fill hud__meter-fill--health" style="width: ${healthPercent}%"></div>
        </div>
        <div class="hud__row hud__row--compact">
          <span>Melee</span>
          <strong>${escapeHtml(model.meleeLabel)}</strong>
        </div>
        <div class="hud__row hud__row--compact">
          <span>Gun</span>
          <strong>${escapeHtml(model.gunLabel)}</strong>
        </div>
        <div class="hud__row hud__row--compact">
          <span>Ammo</span>
          <strong>${escapeHtml(model.ammoLabel)}</strong>
        </div>
        <div class="hud__row hud__row--compact">
          <span>Reload</span>
          <strong>${escapeHtml(model.reloadLabel)}</strong>
        </div>
        <div class="hud__row hud__row--compact">
          <span>Heals</span>
          <strong>${escapeHtml(model.healingItemsLabel)}</strong>
        </div>
        <div class="hud__banner hud__banner--${model.alertTone} hud__banner--small">${escapeHtml(model.alertLabel)}</div>
        <label class="hud__meter-label" for="suspicion-meter">Suspicion</label>
        <div id="suspicion-meter" class="hud__meter">
          <div class="hud__meter-fill" style="width: ${suspicionPercent}%"></div>
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
    const outcomeLabel = outcome === "escape" ? "Escaped" : outcome === "death" ? "Death" : "Captured";
    this.root.innerHTML = `
      <section class="menu-card report-card">
        <p class="hud__eyebrow">Run ${outcomeLabel}</p>
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
        <h1>${response.outcome === "escape" ? "Escape Logged" : response.outcome === "death" ? "Death Logged" : "Capture Logged"}</h1>
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
