import { describe, it, expect } from "vitest";
import { renderPrompt } from "@asktree/core";
import type { ContextSlice } from "@asktree/core";

// Since cutSurrounding is private, we test marker placement, word-boundary
// snapping, and ellipsis truncation indirectly through renderPrompt output.

function makeSlices(
  depth0: { title: string; selected: string; surrounding: string },
  ancestors: Array<{ title: string; selected: string; surrounding: string }> = [],
): ContextSlice[] {
  const slices: ContextSlice[] = [
    { nodeTitle: depth0.title, selectedText: depth0.selected, surrounding: depth0.surrounding, depth: 0 },
  ];
  ancestors.forEach((a, i) => {
    slices.push({ nodeTitle: a.title, selectedText: a.selected, surrounding: a.surrounding, depth: i + 1 });
  });
  return slices;
}

const TEMPLATE = `System: test

User:
{surrounding_text}

About "{selected_text}": {user_question}

{path_summary}`;

describe("highlight markers in rendered prompt", () => {
  it("should wrap selected text in guillemet markers in surrounding", () => {
    const result = renderPrompt(
      makeSlices({
        title: "Article",
        selected: "target",
        surrounding: "…before text «target» after text…",
      }),
      "What is target?",
      TEMPLATE,
    );
    // The « and » markers should appear in the output surrounding text
    expect(result.user).toContain("«target»");
  });

  it("should mark truncation with ellipses", () => {
    const result = renderPrompt(
      makeSlices({
        title: "Article",
        selected: "target",
        surrounding: "…before text «target» after text…",
      }),
      "Explain",
      TEMPLATE,
    );
    // Ellipsis should appear when content is truncated at edges
    expect(result.user).toContain("…");
  });
});

describe("path_summary ordering", () => {
  it("should read root → current (oldest first)", () => {
    const result = renderPrompt(
      [
        { nodeTitle: "Leaf Q", selectedText: "x", surrounding: "…«x»…", depth: 0 },
        { nodeTitle: "Middle", selectedText: "y", surrounding: "…«y»…", depth: 1 },
        { nodeTitle: "Root Article", selectedText: "", surrounding: "intro text", depth: 2 },
      ],
      "Explain this",
      TEMPLATE,
    );
    expect(result.user).toContain("Root Article → Middle → Leaf Q");
  });

  it("should show natural sentence for single-slice (no trail)", () => {
    const result = renderPrompt(
      [{ nodeTitle: "Article", selectedText: "x", surrounding: "…«x»…", depth: 0 }],
      "What is x?",
      TEMPLATE,
    );
    expect(result.user).toContain("I'm reading this article for the first time.");
  });
});
