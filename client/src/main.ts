import Phaser from "phaser";

class EmptyScene extends Phaser.Scene {
  constructor() {
    super("empty");
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  scene: EmptyScene,
});
