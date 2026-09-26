import { describe, it, expect, vi, beforeEach } from "vitest";
import { LLMService } from "@asktree/core";

const images = [{ mediaType: "image/png", data: "QUJD" }];
const slices = [{ nodeTitle: "t", selectedText: "sel", surrounding: "text", depth: 0 }];

function stubFetch(json: unknown) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(json), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function body(fn: ReturnType<typeof stubFetch>) {
  return JSON.parse(String(fn.mock.calls[0][1]?.body));
}

describe("image transport", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("OpenAI-compatible sends an image_url data URL", async () => {
    const fn = stubFetch({ choices: [{ message: { content: "ok" } }] });
    const llm = new LLMService();
    llm.configure({ endpoint: "https://api.test", model: "m", apiKey: "k" }, "openai");
    await llm.ask({ question: "q", contextSlices: slices, system: "s", user: "u", images });

    const content = body(fn).messages[1].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "text", text: "u" });
    expect(content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,QUJD" },
    });
  });

  it("Anthropic sends an image block", async () => {
    const fn = stubFetch({ content: [{ text: "ok" }] });
    const llm = new LLMService();
    llm.configure({ endpoint: "https://api.test", model: "m", apiKey: "k" }, "anthropic");
    await llm.ask({ question: "q", contextSlices: slices, system: "s", user: "u", images });

    const content = body(fn).messages[0].content;
    expect(content[0]).toEqual({ type: "text", text: "u" });
    expect(content[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "QUJD" },
    });
  });

  it("Ollama sends an images array", async () => {
    const fn = stubFetch({ response: "ok" });
    const llm = new LLMService();
    llm.configure({ endpoint: "https://api.test", model: "m" }, "ollama");
    await llm.ask({ question: "q", contextSlices: slices, system: "s", user: "u", images });

    expect(body(fn).images).toEqual(["QUJD"]);
  });

  it("sends a plain string when there are no images", async () => {
    const fn = stubFetch({ choices: [{ message: { content: "ok" } }] });
    const llm = new LLMService();
    llm.configure({ endpoint: "https://api.test", model: "m", apiKey: "k" }, "openai");
    await llm.ask({ question: "q", contextSlices: slices, system: "s", user: "u" });

    expect(body(fn).messages[1].content).toBe("u");
    expect(body(fn).images).toBeUndefined();
  });
});
