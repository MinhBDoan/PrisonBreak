import Phaser from "phaser";
import "./styles.css";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { ReportScene } from "./scenes/ReportScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  pixelArt: true,
  scene: [BootScene, MenuScene, GameScene, ReportScene],
});
