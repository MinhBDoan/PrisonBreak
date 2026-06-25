import Phaser from "phaser";
import { createIdempotencyKey } from "../api/GameApiClient";
import { GameSimulation } from "../game/GameSimulation";
import type { SimulationInput, Vector } from "../game/types";
import { clampThrowTarget, GameRenderer, renderScale } from "../render/GameRenderer";
import { Hud } from "../ui/Hud";
import type { StartRunResponse } from "../../../shared/contracts";

const minPebbleThrowRange = 1;
const maxPebbleThrowRange = 4;
const pebbleChargeMs = 1000;

type KeySet = {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  shift: Phaser.Input.Keyboard.Key;
  interact: Phaser.Input.Keyboard.Key;
  pause: Phaser.Input.Keyboard.Key;
};

export class GameScene extends Phaser.Scene {
  private simulation!: GameSimulation;
  private viewRenderer!: GameRenderer;
  private hud!: Hud;
  private keys!: KeySet;
  private readonly heldKeys = new Set<string>();
  private readonly handleDomKeyDown = (event: KeyboardEvent): void => {
    this.heldKeys.add(event.code || event.key);
  };
  private readonly handleDomKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code || event.key);
  };
  private lastEventCount = 0;
  private completionShown = false;
  private paused = false;
  private pendingThrowTarget: Vector | null = null;
  private aimingPebble = false;
  private pebbleAimStartedAtMs = 0;
  private runData: StartRunResponse = {
    runId: 0,
    config: { adaptations: [] },
  };

  constructor() {
    super("game");
  }

  create(data: StartRunResponse): void {
    const keyboard = this.input.keyboard;
    const hudRoot = document.getElementById("hud");
    if (!keyboard || !hudRoot) {
      throw new Error("Keyboard or HUD root unavailable");
    }

    this.runData = data;
    this.lastEventCount = 0;
    this.completionShown = false;
    this.paused = false;
    this.pendingThrowTarget = null;
    this.aimingPebble = false;
    this.pebbleAimStartedAtMs = 0;
    this.cameras.main.setBackgroundColor("#081018");
    this.simulation = new GameSimulation({ nextRunConfig: data.config });
    this.viewRenderer = new GameRenderer();
    this.hud = new Hud(hudRoot);
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      shift: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      interact: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      pause: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    };
    this.heldKeys.clear();
    window.addEventListener("keydown", this.handleDomKeyDown);
    window.addEventListener("keyup", this.handleDomKeyUp);
    document.addEventListener("keydown", this.handleDomKeyDown);
    document.addEventListener("keyup", this.handleDomKeyUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.handleDomKeyDown);
      window.removeEventListener("keyup", this.handleDomKeyUp);
      document.removeEventListener("keydown", this.handleDomKeyDown);
      document.removeEventListener("keyup", this.handleDomKeyUp);
      this.input.off("pointerdown", this.beginPebbleAim, this);
      this.input.off("pointerup", this.releasePebbleAim, this);
      this.heldKeys.clear();
    });
    this.focusCanvas();
    this.input.on("pointerdown", this.beginPebbleAim, this);
    this.input.on("pointerup", this.releasePebbleAim, this);

    this.viewRenderer.mount(this);
    const snapshot = this.simulation.getSnapshot();
    this.viewRenderer.render(this, snapshot);
    this.updatePebbleAim(snapshot);
    this.viewRenderer.followCamera(this, snapshot);
    this.hud.update(snapshot);
  }

  update(): void {
    if (!this.simulation) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.pause)) {
      this.paused = !this.paused;
      if (this.paused) {
        this.hud.showPaused();
        return;
      }
    }

    if (this.paused) {
      return;
    }

    const snapshotBefore = this.simulation.getSnapshot();
    const input = this.readInput();
    if (!snapshotBefore.completed) {
      this.simulation.step(input);
    }

    this.emitNewNoiseRipples();
    const snapshot = this.simulation.getSnapshot();
    this.viewRenderer.render(this, snapshot);
    this.updatePebbleAim(snapshot);
    this.viewRenderer.followCamera(this, snapshot);
    this.hud.update(snapshot);

    if (snapshot.completed && !this.completionShown) {
      this.completionShown = true;
      const completed = snapshot.completed;
      this.time.delayedCall(900, () =>
        this.scene.start("report", {
          runId: this.runData.runId,
          outcome: completed.outcome,
          durationMs: completed.durationMs,
          events: this.simulation.getEvents(),
          idempotencyKey: createIdempotencyKey(),
        }),
      );
    }
  }

  private readInput(): SimulationInput {
    const right = this.keys.right.isDown || this.isHeld("KeyD", "d", "D");
    const left = this.keys.left.isDown || this.isHeld("KeyA", "a", "A");
    const down = this.keys.down.isDown || this.isHeld("KeyS", "s", "S");
    const up = this.keys.up.isDown || this.isHeld("KeyW", "w", "W");
    const direction = {
      x: Number(right) - Number(left),
      y: Number(down) - Number(up),
    };
    return {
      direction,
      sprint: this.keys.shift.isDown || this.isHeld("ShiftLeft", "ShiftRight", "Shift"),
      interact: Phaser.Input.Keyboard.JustDown(this.keys.interact),
      throwTarget: this.consumeThrowTarget(),
    };
  }

  private beginPebbleAim(pointer: Phaser.Input.Pointer): void {
    const snapshot = this.simulation.getSnapshot();
    if (this.paused || this.completionShown || snapshot.completed || snapshot.player.pebbles <= 0 || pointer.leftButtonDown() === false) {
      return;
    }
    this.aimingPebble = true;
    this.pebbleAimStartedAtMs = this.time.now;
  }

  private releasePebbleAim(pointer: Phaser.Input.Pointer): void {
    if (!this.aimingPebble) {
      return;
    }
    const snapshot = this.simulation.getSnapshot();
    const target = this.pointerWorld(pointer);
    this.pendingThrowTarget = clampThrowTarget(snapshot.player.position, target, this.currentPebbleThrowRange());
    this.aimingPebble = false;
    this.pebbleAimStartedAtMs = 0;
    this.viewRenderer.hidePebbleAim();
  }

  private consumeThrowTarget(): Vector | null {
    const target = this.pendingThrowTarget;
    this.pendingThrowTarget = null;
    return target;
  }

  private updatePebbleAim(snapshot: ReturnType<GameSimulation["getSnapshot"]>): void {
    if (!this.aimingPebble || snapshot.player.pebbles <= 0 || snapshot.completed) {
      this.viewRenderer.hidePebbleAim();
      return;
    }
    this.viewRenderer.showPebbleAim(
      this,
      snapshot.player.position,
      this.pointerWorld(this.input.activePointer),
      this.currentPebbleThrowRange(),
    );
  }

  private currentPebbleThrowRange(): number {
    if (!this.aimingPebble) {
      return minPebbleThrowRange;
    }
    const progress = Math.max(0, Math.min(1, (this.time.now - this.pebbleAimStartedAtMs) / pebbleChargeMs));
    return minPebbleThrowRange + (maxPebbleThrowRange - minPebbleThrowRange) * progress;
  }

  private pointerWorld(pointer: Phaser.Input.Pointer): Vector {
    return {
      x: pointer.worldX / renderScale,
      y: pointer.worldY / renderScale,
    };
  }

  private isHeld(...codes: string[]): boolean {
    return codes.some((code) => this.heldKeys.has(code));
  }

  private focusCanvas(): void {
    const canvas = this.game.canvas;
    canvas.tabIndex = 0;
    canvas.focus();
  }

  private emitNewNoiseRipples(): void {
    const events = this.simulation.getEvents();
    for (const event of events.slice(this.lastEventCount)) {
      if (event.type === "pebble_throw" && typeof event.payload.landing === "object" && event.payload.landing) {
        this.viewRenderer.spawnPebbleThrow(this, event.position, event.payload.landing as Vector, () => undefined);
        continue;
      }
      if (event.type !== "noise") {
        continue;
      }
      const radius = typeof event.payload.radius === "number" ? event.payload.radius : 1.5;
      this.viewRenderer.spawnNoiseRipple(this, event.position, radius);
    }
    this.lastEventCount = events.length;
  }
}
