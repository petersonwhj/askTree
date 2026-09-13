import { describe, it, expect, vi, afterEach } from "vitest";
import { LLMService } from "@asktree/core";

describe("LLMService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should throw if not configured", async () => {
    const service = new LLMService();
    await expect(service.ask({ question: "test", contextSlices: [] })).rejects.toThrow("LLM not configured");
  });

  it("should store configuration", () => {
    const service = new LLMService();
    service.configure({ endpoint: "http://localhost:11434", model: "llama3" }, "ollama");
    expect(service.getConfig()?.model).toBe("llama3");
  });

  function okResponse(content: string) {
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  }
  function errorResponse(status: number, body = "{}") {
    const resp = {
      ok: false,
      status,
      statusText: "",
      clone() {
        return resp;
      },
      text: async () => body,
      json: async () => JSON.parse(body),
    };
    return resp;
  }

  it("retries a retryable failure, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(okResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const service = new LLMService();
    service.configure({ endpoint: "https://x", model: "m" }, "openai");

    await expect(
      service.ask({ question: "q", contextSlices: [], system: "s", user: "u" }),
    ).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401, '{"error":{"message":"bad"}}'));
    vi.stubGlobal("fetch", fetchMock);

    const service = new LLMService();
    service.configure({ endpoint: "https://x", model: "m" }, "openai");

    await expect(
      service.ask({ question: "q", contextSlices: [], system: "s", user: "u" }),
    ).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a parse error (no retry) for a malformed successful body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const service = new LLMService();
    service.configure({ endpoint: "https://x", model: "m" }, "openai");

    await expect(
      service.ask({ question: "q", contextSlices: [], system: "s", user: "u" }),
    ).rejects.toThrow(/unexpected response/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the prepared system/user text unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const service = new LLMService();
    service.configure({ endpoint: "https://x", model: "m" }, "openai");
    await service.ask({ question: "q", contextSlices: [], system: "SYS", user: "USER" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ]);
  });

  it("requests thinking mode from the OpenAI-compatible provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hi" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new LLMService();
    service.configure(
      { endpoint: "https://api.deepseek.com", apiKey: "k", model: "deepseek-flash" },
      "openai",
    );
    await service.ask({ question: "q", contextSlices: [], system: "s", user: "u" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("deepseek-flash");
    expect(body.thinking).toEqual({ type: "enabled" });
  });
});
