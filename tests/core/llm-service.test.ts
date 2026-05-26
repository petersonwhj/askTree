import { describe, it, expect } from "vitest";
import { LLMService } from "@asktree/core";

describe("LLMService", () => {
  it("should throw if not configured", async () => {
    const service = new LLMService();
    await expect(service.ask({ question: "test", contextSlices: [] })).rejects.toThrow("LLM not configured");
  });

  it("should store configuration", () => {
    const service = new LLMService();
    service.configure({ endpoint: "http://localhost:11434", model: "llama3" }, "ollama");
    expect(service.getConfig()?.model).toBe("llama3");
  });
});
