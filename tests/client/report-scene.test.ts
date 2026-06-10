import { describe, expect, it } from "vitest";
import { createNextRunStarter } from "../../client/src/scenes/ReportSceneFlow";
import type { StartRunResponse } from "../../shared/contracts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("ReportScene", () => {
  it("starts the next run only once while the start request is in flight", async () => {
    const start = deferred<StartRunResponse>();
    const startedScenes: StartRunResponse[] = [];
    const loadingMessages: string[] = [];
    let startCalls = 0;

    const beginNextRun = createNextRunStarter({
      hasCompletionResponse: () => true,
      showLoading(message: string) {
        loadingMessages.push(message);
      },
      showReportError() {
        throw new Error("Unexpected retry UI");
      },
      startScene(_key: string, data: StartRunResponse) {
        startedScenes.push(data);
      },
      api: {
        async startRun() {
          startCalls += 1;
          return start.promise;
        },
      },
    });

    const first = beginNextRun();
    const second = beginNextRun();

    expect(startCalls).toBe(1);
    expect(loadingMessages).toEqual(["Starting Next Run"]);

    const nextRun = { runId: 2, config: { adaptations: [] } };
    start.resolve(nextRun);
    await Promise.all([first, second]);

    expect(startedScenes).toEqual([nextRun]);
  });
});
