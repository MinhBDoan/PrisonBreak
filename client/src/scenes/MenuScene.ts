import Phaser from "phaser";
import { BlockingApiError, GameApiClient } from "../api/GameApiClient";
import { Hud } from "../ui/Hud";

export class MenuScene extends Phaser.Scene {
  private hud!: Hud;
  private api!: GameApiClient;
  private starting = false;

  constructor() {
    super("menu");
  }

  create(): void {
    const hudRoot = document.getElementById("hud");
    if (!hudRoot) {
      throw new Error("HUD root not found");
    }

    this.hud = new Hud(hudRoot);
    this.api = new GameApiClient();
    this.hud.showMenu(() => {
      void this.beginRun();
    });
  }

  private async beginRun(): Promise<void> {
    if (this.starting) {
      return;
    }
    this.starting = true;
    this.hud.showLoading("Checking Service");
    try {
      await this.api.ready();
      const start = await this.api.startRun();
      this.scene.start("game", start);
    } catch (error) {
      const blockingError =
        error instanceof BlockingApiError
          ? error.blockingError
          : {
              code: "start_failed",
              message: error instanceof Error ? error.message : "Could not start the run.",
              retryable: true,
            };
      this.hud.showBlockingMenu(blockingError.message, () => {
        void this.beginRun();
      });
    } finally {
      this.starting = false;
    }
  }
}
