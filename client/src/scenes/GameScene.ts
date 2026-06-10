import Phaser from "phaser";
import { GameSimulation } from "../game/GameSimulation";
import type { SimulationInput } from "../game/types";
import { GameRenderer } from "../render/GameRenderer";
import { Hud } from "../ui/Hud";

type KeySet = {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  shift: Phaser.Input.Keyboard.Key;
  interact: Phaser.Input.Keyboard.Key;
};

export class GameScene extends Phaser.Scene {
  private simulation!: GameSimulation;
  private viewRenderer!: GameRenderer;
  private hud!: Hud;
  private keys!: KeySet;
  private lastEventCount = 0;
  private completionShown = false;

  constructor() {
    super("game");
  }

  create(): void {
    const keyboard = this.input.keyboard;
    const hudRoot = document.getElementById("hud");
    if (!keyboard || !hudRoot) {
      throw new Error("Keyboard or HUD root unavailable");
    }

    this.cameras.main.setBackgroundColor("#081018");
    this.simulation = new GameSimulation();
    this.viewRenderer = new GameRenderer();
    this.hud = new Hud(hudRoot);
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      shift: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      interact: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
    };

    this.viewRenderer.mount(this);
    const snapshot = this.simulation.getSnapshot();
    this.viewRenderer.render(this, snapshot);
    this.viewRenderer.followCamera(this, snapshot);
    this.hud.update(snapshot);
  }

  update(): void {
    if (!this.simulation) {
      return;
    }

    const snapshotBefore = this.simulation.getSnapshot();
    if (!snapshotBefore.completed) {
      this.simulation.step(this.readInput());
    }

    this.emitNewNoiseRipples();
    const snapshot = this.simulation.getSnapshot();
    this.viewRenderer.render(this, snapshot);
    this.viewRenderer.followCamera(this, snapshot);
    this.hud.update(snapshot);

    if (snapshot.completed && !this.completionShown) {
      this.completionShown = true;
      this.time.delayedCall(1600, () => this.scene.start("menu"));
    }
  }

  private readInput(): SimulationInput {
    const direction = {
      x: Number(this.keys.right.isDown) - Number(this.keys.left.isDown),
      y: Number(this.keys.down.isDown) - Number(this.keys.up.isDown),
    };
    return {
      direction,
      sprint: this.keys.shift.isDown,
      interact: Phaser.Input.Keyboard.JustDown(this.keys.interact),
    };
  }

  private emitNewNoiseRipples(): void {
    const events = this.simulation.getEvents();
    for (const event of events.slice(this.lastEventCount)) {
      if (event.type !== "noise") {
        continue;
      }
      const radius = typeof event.payload.radius === "number" ? event.payload.radius : 1.5;
      this.viewRenderer.spawnNoiseRipple(this, event.position, radius);
    }
    this.lastEventCount = events.length;
  }
}
