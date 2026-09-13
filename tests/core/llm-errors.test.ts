import { describe, it, expect } from "vitest";
import {
  LLMError,
  llmErrorFromResponse,
  llmErrorFromFetch,
  llmParseError,
} from "@asktree/core";

function makeResponse(status: number, body: string): Response {
  const resp = {
    status,
    statusText: "",
    clone() {
      return resp;
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
  return resp as unknown as Response;
}

describe("llmErrorFromResponse", () => {
  it("classifies auth failures as non-retryable and keeps the provider message", async () => {
    const err = await llmErrorFromResponse(
      makeResponse(401, '{"error":{"message":"invalid api key"}}'),
    );
    expect(err).toBeInstanceOf(LLMError);
    expect(err.kind).toBe("auth");
    expect(err.status).toBe(401);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("invalid api key");
  });

  it("marks rate limits and server errors as retryable", async () => {
    expect((await llmErrorFromResponse(makeResponse(429, "{}"))).retryable).toBe(true);
    expect((await llmErrorFromResponse(makeResponse(503, "{}"))).retryable).toBe(true);
  });

  it("does not leak an HTML error body", async () => {
    const err = await llmErrorFromResponse(makeResponse(500, "<html>boom</html>"));
    expect(err.kind).toBe("server");
    expect(err.message).not.toContain("boom");
    expect(err.message).not.toContain("<html>");
  });
});

describe("llmErrorFromFetch", () => {
  it("maps AbortError to a non-retryable cancellation", () => {
    const err = llmErrorFromFetch(Object.assign(new Error("x"), { name: "AbortError" }));
    expect(err.kind).toBe("aborted");
    expect(err.retryable).toBe(false);
  });

  it("maps other failures to a retryable network error", () => {
    const err = llmErrorFromFetch(new TypeError("failed to fetch"));
    expect(err.kind).toBe("network");
    expect(err.retryable).toBe(true);
  });
});

describe("llmParseError", () => {
  it("is not retryable", () => {
    expect(llmParseError("API").retryable).toBe(false);
  });
});
