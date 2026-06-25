import Phaser from "phaser";
import "./styles.css";
import { BlockingApiError, GameApiClient } from "./api/GameApiClient";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { ReportScene } from "./scenes/ReportScene";
import { Hud } from "./ui/Hud";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  pixelArt: true,
  scene: [BootScene, MenuScene, GameScene, ReportScene],
});

setTimeout(() => {
  const hudRoot = document.getElementById("hud");
  if (!hudRoot || hudRoot.innerHTML.trim().length > 0) {
    return;
  }

  const hud = new Hud(hudRoot);
  const api = new GameApiClient();
  hud.showMenu(async () => {
    hud.showLoading("Checking Service");
    try {
      await api.ready();
      const start = await api.startRun();
      game.scene.start("game", start);
    } catch (error) {
      const blockingError =
        error instanceof BlockingApiError
          ? error.blockingError
          : {
              code: "start_failed",
              message: error instanceof Error ? error.message : "Could not start the run.",
              retryable: true,
            };
      hud.showBlockingMenu(blockingError.message, () => {
        hudRoot.innerHTML = "";
      });
    }
  });
}, 500);
