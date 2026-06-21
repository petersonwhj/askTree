import { describe, it, expect } from "vitest";
import { renderPrompt } from "@asktree/core";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";

describe("renderPrompt", () => {
  it("should render the default template", () => {
    const result = renderPrompt(
      [
        { nodeTitle: "Current", selectedText: "abc", surrounding: "The quick brown abc fox jumps", depth: 0 },
        { nodeTitle: "Parent", selectedText: "math", surrounding: "Math is fundamental", depth: 1 },
        { nodeTitle: "Root", selectedText: "", surrounding: "Full article text", depth: 2 },
      ],
      "What is abc?",
      DEFAULT_PROMPT_CONFIG.template
    );
    // English study-assistant system prompt
    expect(result.system).toContain("study assistant");
    expect(result.user).toContain("quick brown abc fox jumps");
    expect(result.user).toContain("What is abc?");
    // path_summary should be root → current (reverse of slice order)
    expect(result.user).toContain("Root → Parent → Current");
  });

  it("should handle empty selectedText", () => {
    const result = renderPrompt(
      [{ nodeTitle: "Article", selectedText: "", surrounding: "Some article text here", depth: 0 }],
      "Tell me more",
      DEFAULT_PROMPT_CONFIG.template
    );
    expect(result.user).toContain("Some article text here");
    expect(result.user).toContain("Tell me more");
  });

  it("should order path_summary root-first", () => {
    const result = renderPrompt(
      [
        { nodeTitle: "Leaf", selectedText: "x", surrounding: "leaf content", depth: 0 },
        { nodeTitle: "Middle", selectedText: "y", surrounding: "middle content", depth: 1 },
        { nodeTitle: "Root", selectedText: "", surrounding: "root content", depth: 2 },
      ],
      "What is x?",
      DEFAULT_PROMPT_CONFIG.template
    );
    // Slices are leaf-first, path_summary should be root → leaf
    expect(result.user).toContain("Root → Middle → Leaf");
    expect(result.user).not.toContain("Leaf → Middle → Root");
  });

  it("should use English fallback for empty ancestors", () => {
    const result = renderPrompt(
      [{ nodeTitle: "Article", selectedText: "xyz", surrounding: "text around xyz", depth: 0 }],
      "Explain",
      DEFAULT_PROMPT_CONFIG.template
    );
    expect(result.user).toContain("(no broader context available)");
  });
});
