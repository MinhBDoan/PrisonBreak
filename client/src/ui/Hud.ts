import { prisonMap } from "../game/map";
import type { SimulationSnapshot } from "../game/types";

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
}
