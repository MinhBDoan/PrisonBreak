import Phaser from "phaser";
import { BlockingApiError, GameApiClient } from "../api/GameApiClient";
import { createNextRunStarter } from "./ReportSceneFlow";
import { Hud } from "../ui/Hud";
import type { CompleteRunResponse, RunEvent, RunOutcome } from "../../../shared/contracts";

export type ReportSceneData = {
  runId: number;
  outcome: RunOutcome;
  durationMs: number;
  events: RunEvent[];
  idempotencyKey: string;
};

export class ReportScene extends Phaser.Scene {
  private hud!: Hud;
  private api!: GameApiClient;
  private completion: ReportSceneData | null = null;
  private response: CompleteRunResponse | null = null;
  private submitting = false;
  private beginNextRun!: () => Promise<void>;

  constructor() {
    super("report");
  }

  create(data: ReportSceneData): void {
    const hudRoot = document.getElementById("hud");
    if (!hudRoot) {
      throw new Error("HUD root not found");
    }
    this.hud = new Hud(hudRoot);
    this.api = new GameApiClient();
    this.completion = data;
    this.beginNextRun = createNextRunStarter({
      api: this.api,
      hasCompletionResponse: () => Boolean(this.response),
      showLoading: (message) => {
        this.hud.showLoading(message);
      },
      showReportError: (error, onRetry) => {
        this.hud.showReportError(error, onRetry);
      },
      startScene: (key, start) => {
        this.scene.start(key, start);
      },
    });
    void this.submitCompletion();
  }

  private async submitCompletion(): Promise<void> {
    if (!this.completion || this.submitting) {
      return;
    }
    this.submitting = true;
    this.hud.showReportLoading(this.completion.outcome);
    try {
      this.response = await this.api.completeRun(this.completion);
      this.hud.showReport(this.response, () => {
        void this.beginNextRun();
      });
    } catch (error) {
      const blockingError =
        error instanceof BlockingApiError
          ? error.blockingError
          : {
              code: "completion_failed",
              message: error instanceof Error ? error.message : "Completion failed.",
              retryable: true,
            };
      this.hud.showReportError(blockingError, () => {
        void this.submitCompletion();
      });
    } finally {
      this.submitting = false;
    }
  }
}
