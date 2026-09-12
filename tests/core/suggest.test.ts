import { describe, it, expect } from "vitest";
import { parseSuggestedQuestions, renderPrompt, SUGGEST_TEMPLATE } from "@asktree/core";

describe("parseSuggestedQuestions", () => {
  it("strips numbering, bullets and quotes, dedupes, and caps at max", () => {
    const text = [
      "1. Why is hydration needed?",
      "- What breaks without it?",
      '* "How does it work?"',
      "Why is hydration needed?",
      "4) Another one?",
    ].join("\n");

    expect(parseSuggestedQuestions(text)).toEqual([
      "Why is hydration needed?",
      "What breaks without it?",
      "How does it work?",
    ]);
  });

  it("ignores blank lines and over-long lines", () => {
    const text = `\n\n${"x".repeat(400)}\nReal question?\n`;
    expect(parseSuggestedQuestions(text)).toEqual(["Real question?"]);
  });
});

describe("SUGGEST_TEMPLATE", () => {
  it("renders the focused passage with the highlighted selection", () => {
    const rendered = renderPrompt(
      [{ nodeTitle: "A", selectedText: "hydration", surrounding: "…«hydration» is key…", depth: 0 }],
      "",
      SUGGEST_TEMPLATE,
    );

    expect(rendered.user).toContain("«hydration»");
    expect(rendered.system.toLowerCase()).toContain("question");
  });
});
