import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.image("bandages", "assets/bandages.png");
    this.load.image("cell-bars-panel", "assets/cell-bars-panel.png");
    this.load.image("cell-door-closed", "assets/cell-door-closed.png");
    this.load.image("cell-door-half-open", "assets/cell-door-half-open.png");
    this.load.image("cell-door-open", "assets/cell-door-open.png");
    this.load.image("cell-floor-cracked-a", "assets/cell-floor-cracked-a.png");
    this.load.image("cell-floor-cracked-b", "assets/cell-floor-cracked-b.png");
    this.load.image("cell-floor-stained", "assets/cell-floor-stained.png");
    this.load.image("cell-grime-decal", "assets/cell-grime-decal.png");
    this.load.image("cell-wall-panel-a", "assets/cell-wall-panel-a.png");
    this.load.image("cell-wall-panel-b", "assets/cell-wall-panel-b.png");
    this.load.image("cot-side", "assets/cot-side.png");
    this.load.image("pebble", "assets/pebble.png");
    this.load.image("pistol", "assets/pistol.png");
    this.load.image("player-raccoon-down", "assets/player-raccoon-down.png");
    this.load.image("player-raccoon-down-knife", "assets/player-raccoon-down-knife.png");
    this.load.image("player-raccoon-down-walk", "assets/player-raccoon-down-walk.png");
    this.load.image("player-raccoon-left", "assets/player-raccoon-left.png");
    this.load.image("player-raccoon-left-knife", "assets/player-raccoon-left-knife.png");
    this.load.image("player-raccoon-left-walk", "assets/player-raccoon-left-walk.png");
    this.load.image("player-raccoon-orange", "assets/player-raccoon-orange.png");
    this.load.image("player-raccoon-right", "assets/player-raccoon-right.png");
    this.load.image("player-raccoon-right-knife", "assets/player-raccoon-right-knife.png");
    this.load.image("player-raccoon-right-walk", "assets/player-raccoon-right-walk.png");
    this.load.image("player-raccoon-up", "assets/player-raccoon-up.png");
    this.load.image("player-raccoon-up-knife", "assets/player-raccoon-up-knife.png");
    this.load.image("player-raccoon-up-walk", "assets/player-raccoon-up-walk.png");
    this.load.image("toilet-side", "assets/toilet-side.png");
  }

  create(): void {
    this.scene.start("menu");
  }
}
