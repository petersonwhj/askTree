import { describe, it, expect } from "vitest";
import { renderPrompt } from "@asktree/core";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";

describe("renderPrompt", () => {
  it("should render the default template", () => {
    const result = renderPrompt(
      [
        { nodeTitle: "Root", selectedText: "abc", surrounding: "The quick brown abc fox jumps", depth: 0 },
        { nodeTitle: "Parent", selectedText: "math", surrounding: "Math is fundamental", depth: 1 },
      ],
      "What is abc?",
      DEFAULT_PROMPT_CONFIG.template
    );
    expect(result.system).toContain("学习助手");
    expect(result.user).toContain("quick brown abc fox jumps");
    expect(result.user).toContain("What is abc?");
  });

  it("should handle empty selectedText", () => {
    const result = renderPrompt(
      [{ nodeTitle: "Root", selectedText: "", surrounding: "Some article text here", depth: 0 }],
      "Tell me more",
      DEFAULT_PROMPT_CONFIG.template
    );
    expect(result.user).toContain("Some article text here");
    expect(result.user).toContain("Tell me more");
  });
});
