import { BlockingApiError, type GameApiClient } from "../api/GameApiClient";
import type { BlockingError, StartRunResponse } from "../../../shared/contracts";

export type NextRunStarterOptions = {
  api: Pick<GameApiClient, "startRun">;
  hasCompletionResponse: () => boolean;
  showLoading: (message: string) => void;
  showReportError: (error: BlockingError["error"], onRetry: () => void) => void;
  startScene: (key: string, data: StartRunResponse) => void;
};

export function createNextRunStarter(options: NextRunStarterOptions): () => Promise<void> {
  let startingNextRun = false;

  return async function beginNextRun(): Promise<void> {
    if (!options.hasCompletionResponse() || startingNextRun) {
      return;
    }
    startingNextRun = true;
    options.showLoading("Starting Next Run");
    try {
      const start = await options.api.startRun();
      options.startScene("game", start);
    } catch (error) {
      startingNextRun = false;
      const blockingError =
        error instanceof BlockingApiError
          ? error.blockingError
          : {
              code: "start_failed",
              message: error instanceof Error ? error.message : "Could not start the next run.",
              retryable: true,
            };
      options.showReportError(blockingError, () => {
        void beginNextRun();
      });
    }
  };
}
