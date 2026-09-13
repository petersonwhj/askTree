export type LLMErrorKind =
  | "setup"
  | "auth"
  | "rate_limit"
  | "server"
  | "provider"
  | "network"
  | "parse"
  | "aborted";

export interface LLMErrorOptions {
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class LLMError extends Error {
  readonly kind: LLMErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(kind: LLMErrorKind, message: string, opts: LLMErrorOptions = {}) {
    super(message);
    this.name = "LLMError";
    this.kind = kind;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

function kindForStatus(status: number): { kind: LLMErrorKind; retryable: boolean } {
  if (status === 401 || status === 403) return { kind: "auth", retryable: false };
  if (status === 408 || status === 409 || status === 429) {
    return { kind: "rate_limit", retryable: true };
  }
  if (status >= 500) return { kind: "server", retryable: true };
  return { kind: "provider", retryable: false };
}

/**
 * Best-effort provider message from an error body. Never returns raw HTML or
 * anything that could leak credentials/documents — just the provider's message
 * field when it is JSON. Returns "" when it cannot be read safely.
 */
async function messageFromBody(resp: Response): Promise<string> {
  try {
    const text = await resp.clone().text();
    if (!text) return "";
    try {
      const body = JSON.parse(text);
      const raw = body?.error?.message ?? body?.error ?? body?.message ?? body?.detail ?? "";
      return typeof raw === "string" ? raw : "";
    } catch {
      return ""; // e.g. an HTML error page — do not dump it
    }
  } catch {
    return "";
  }
}

function adviceFor(kind: LLMErrorKind): string {
  switch (kind) {
    case "auth":
      return " Check your API key and endpoint in Settings.";
    case "rate_limit":
      return " The provider is rate limiting; try again shortly.";
    case "server":
      return " The provider had a server error; try again shortly.";
    case "provider":
      return " Check the endpoint, model name, and request settings.";
    default:
      return "";
  }
}

/** Classify a non-OK HTTP response into a typed, non-secret error. */
export async function llmErrorFromResponse(resp: Response, label = "API"): Promise<LLMError> {
  const { kind, retryable } = kindForStatus(resp.status);
  const detail = await messageFromBody(resp);
  const status = `${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`;
  const message = `${label} error ${status}${detail ? `: ${detail}` : ""}.${adviceFor(kind)}`.trim();
  return new LLMError(kind, message, { status: resp.status, retryable });
}

/** Classify a thrown fetch failure (network/CORS or cancellation). */
export function llmErrorFromFetch(error: unknown, label = "API"): LLMError {
  const e = error as { name?: string; message?: string };
  if (e?.name === "AbortError") {
    return new LLMError("aborted", "Request cancelled.", { retryable: false, cause: error });
  }
  return new LLMError(
    "network",
    `${label} request failed (network/CORS?). Check the endpoint and your connection.`,
    { retryable: true, cause: error },
  );
}

/** A successful HTTP response whose body did not match the expected shape. */
export function llmParseError(label = "API", detail?: string): LLMError {
  return new LLMError(
    "parse",
    `${label} returned an unexpected response body${detail ? ` (${detail})` : ""}.`,
  );
}

export function llmSetupError(
  message = "LLM not configured. Open Settings to choose a provider.",
): LLMError {
  return new LLMError("setup", message);
}
