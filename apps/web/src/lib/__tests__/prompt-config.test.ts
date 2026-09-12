import { describe, it, expect } from "vitest";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";
import { migratePromptConfig } from "../prompt-config";

describe("migratePromptConfig", () => {
  it("replaces the legacy Chinese default template with the current default", () => {
    const result = migratePromptConfig({
      maxDepth: 2,
      contextRadius: [10, 5],
      template: "System: 你是一个帮助用户理解文章内容的学习助手。",
    });

    expect(result.template).toBe(DEFAULT_PROMPT_CONFIG.template);
    // Other fields are preserved.
    expect(result.maxDepth).toBe(2);
    expect(result.contextRadius).toEqual([10, 5]);
  });

  it("replaces the legacy English default template", () => {
    const result = migratePromptConfig({
      template: "System: You are a focused study assistant helping a learner.",
    });
    expect(result.template).toBe(DEFAULT_PROMPT_CONFIG.template);
  });

  it("keeps a user-customised template untouched", () => {
    const custom = "System: My own prompt.\n\nUser:\n{user_question}";
    const result = migratePromptConfig({ template: custom });
    expect(result.template).toBe(custom);
  });

  it("returns the defaults when nothing is saved", () => {
    expect(migratePromptConfig(null)).toEqual(DEFAULT_PROMPT_CONFIG);
  });
});
