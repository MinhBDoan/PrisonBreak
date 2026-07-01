import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.image("bandages", "assets/bandages.png");
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
