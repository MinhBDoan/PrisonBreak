import Phaser from "phaser";
import { Hud } from "../ui/Hud";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create(): void {
    const hudRoot = document.getElementById("hud");
    if (!hudRoot) {
      throw new Error("HUD root not found");
    }

    new Hud(hudRoot).showMenu(() => {
      this.scene.start("game");
    });
  }
}
