import {
  BlockingErrorSchema,
  CompleteRunResponseSchema,
  ReadinessSchema,
  StartRunResponseSchema,
  type BlockingError,
  type CompleteRunResponse,
  type Readiness,
  type RunEvent,
  type RunOutcome,
  type StartRunResponse,
} from "../../../shared/contracts";

export type TransportResponse = {
  status: number;
  body: unknown;
};

export type ApiTransport = {
  request(path: string, init?: { method?: string; body?: unknown }): Promise<TransportResponse>;
};

export type CompleteRunInput = {
  runId: number;
  outcome: RunOutcome;
  durationMs: number;
  events: RunEvent[];
  idempotencyKey?: string;
};

export type GameApiClientOptions = {
  baseUrl?: string;
  transport?: ApiTransport;
  idempotencyKeyFactory?: () => string;
  requestTimeoutMs?: number;
};

export class BlockingApiError extends Error {
  readonly blockingError: BlockingError["error"];

  constructor(blockingError: BlockingError["error"]) {
    super(blockingError.message);
    this.name = "BlockingApiError";
    this.blockingError = blockingError;
  }
}

class FetchTransport implements ApiTransport {
  constructor(private readonly baseUrl: string) {}

  async request(path: string, init: { method?: string; body?: unknown } = {}): Promise<TransportResponse> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: init.body ? { "content-type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(
          `Service returned non-JSON response from ${path}. Is the API service running on ${this.baseUrl}?`,
        );
      }
    }
    return { status: response.status, body };
  }
}

function defaultIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `completion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createIdempotencyKey(): string {
  return defaultIdempotencyKey();
}

function parseBlockingError(status: number, body: unknown): BlockingError["error"] | null {
  const parsed = BlockingErrorSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data.error;
  }
  if (status >= 400) {
    return {
      code: `http_${status}`,
      message: `Service returned HTTP ${status}.`,
      retryable: status >= 500,
    };
  }
  return null;
}

function invalidResponseError(context: string): BlockingError["error"] {
  return {
    code: "invalid_response",
    message: `Service returned an invalid ${context} response.`,
    retryable: true,
  };
}

function transportError(context: string, error: unknown): BlockingError["error"] {
  return {
    code: "service_unreachable",
    message: error instanceof Error ? `${context} failed: ${error.message}` : `${context} failed.`,
    retryable: true,
  };
}

export class GameApiClient {
  private readonly transport: ApiTransport;
  private readonly idempotencyKeyFactory: () => string;
  private readonly requestTimeoutMs: number;

  constructor(options: GameApiClientOptions = {}) {
    this.transport = options.transport ?? new FetchTransport(options.baseUrl ?? "http://127.0.0.1:3001");
    this.idempotencyKeyFactory = options.idempotencyKeyFactory ?? defaultIdempotencyKey;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8000;
  }

  async ready(): Promise<Readiness> {
    const response = await this.request("Readiness check", "/api/ready");
    const blocking = parseBlockingError(response.status, response.body);
    if (blocking) {
      throw new BlockingApiError(blocking);
    }
    const parsed = ReadinessSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new BlockingApiError(invalidResponseError("readiness"));
    }
    if (!parsed.data.ready) {
      throw new BlockingApiError({
        code: "service_not_ready",
        message: "Service is not ready. Check SQLite and Codex CLI availability.",
        retryable: true,
      });
    }
    return parsed.data;
  }

  async startRun(): Promise<StartRunResponse> {
    const response = await this.request("Run start", "/api/runs", { method: "POST", body: {} });
    const blocking = parseBlockingError(response.status, response.body);
    if (blocking) {
      throw new BlockingApiError(blocking);
    }
    const parsed = StartRunResponseSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new BlockingApiError(invalidResponseError("start-run"));
    }
    return parsed.data;
  }

  async completeRun(input: CompleteRunInput): Promise<CompleteRunResponse> {
    const response = await this.request("Run completion", `/api/runs/${input.runId}/complete`, {
      method: "POST",
      body: {
        outcome: input.outcome,
        durationMs: input.durationMs,
        idempotencyKey: input.idempotencyKey ?? this.idempotencyKeyFactory(),
        events: input.events,
      },
    });
    const blocking = parseBlockingError(response.status, response.body);
    if (blocking) {
      throw new BlockingApiError(blocking);
    }
    const parsed = CompleteRunResponseSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new BlockingApiError(invalidResponseError("completion"));
    }
    return parsed.data;
  }

  private async request(
    context: string,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<TransportResponse> {
    try {
      return await withTimeout(this.transport.request(path, init), this.requestTimeoutMs, context);
    } catch (error) {
      throw new BlockingApiError(transportError(context, error));
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${context} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
