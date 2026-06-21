import { describe, it, expect } from "vitest";
import { buildGleanPayload, extractGleanAnswer } from "@asktree/core/llm/glean";

describe("buildGleanPayload", () => {
  it("should combine system and user into a single user message", () => {
    const payload = buildGleanPayload("System instruction", "User question");
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].role).toBe("user");
    expect(payload.messages[0].content).toBe("System instruction\n\nUser question");
  });

  it("should handle empty system", () => {
    const payload = buildGleanPayload("", "Just user");
    expect(payload.messages[0].content).toBe("\n\nJust user");
  });
});

describe("extractGleanAnswer", () => {
  it("should extract text from CONTENT-type messages", () => {
    const json = {
      messages: [
        { messageType: "UPDATE", fragments: [{ text: "**Searching:**" }, { text: "what is AI" }] },
        { messageType: "CONTENT", fragments: [{ text: "Here is the answer." }] },
      ],
    };
    const result = extractGleanAnswer(json);
    // Should include the research trail and the answer
    expect(result).toContain("Searched:");
    expect(result).toContain("what is AI");
    expect(result).toContain("Here is the answer.");
  });

  it("should de-duplicate research trail queries", () => {
    const json = {
      messages: [
        { messageType: "UPDATE", fragments: [{ text: "**Searching:**" }, { text: "AI basics" }] },
        { messageType: "UPDATE", fragments: [{ text: "**Searching:**" }, { text: "AI basics" }] },
        { messageType: "CONTENT", fragments: [{ text: "Answer" }] },
      ],
    };
    const result = extractGleanAnswer(json);
    // "AI basics" should appear only once in the trail
    const firstIdx = result.indexOf("AI basics");
    const lastIdx = result.lastIndexOf("AI basics");
    expect(firstIdx).toBe(lastIdx);
  });

  it("should exclude generic labels from research trail", () => {
    const json = {
      messages: [
        { messageType: "UPDATE", fragments: [{ text: "**Searching:**" }, { text: "Searching" }] },
        { messageType: "UPDATE", fragments: [{ text: "**Searching:**" }, { text: "Reading" }] },
        { messageType: "CONTENT", fragments: [{ text: "Answer" }] },
      ],
    };
    const result = extractGleanAnswer(json);
    // Generic labels should be excluded; no trail should be shown
    expect(result).not.toContain("Searched:");
    expect(result).toBe("Answer");
  });

  it("should skip UPDATE messages (not SEARCH_ACTION)", () => {
    // Verifies we use messageType === "UPDATE" not "SEARCH_ACTION"
    const json = {
      messages: [
        { messageType: "SEARCH_ACTION", fragments: [{ text: "Would be wrong" }] },
        { messageType: "CONTENT", fragments: [{ text: "Correct answer" }] },
      ],
    };
    const result = extractGleanAnswer(json);
    expect(result).not.toContain("Searched:");
    expect(result).toBe("Correct answer");
  });

  it("should extract query from fragments[1] not fragments[0]", () => {
    const json = {
      messages: [
        {
          messageType: "UPDATE",
          fragments: [
            { text: "**Searching:**" },  // fragments[0] = label, ignored
            { text: "real query here" },  // fragments[1] = actual query
          ],
        },
        { messageType: "CONTENT", fragments: [{ text: "Answer" }] },
      ],
    };
    const result = extractGleanAnswer(json);
    expect(result).toContain("real query here");
    expect(result).not.toContain("Searching:");
  });

  it("should combine multiple CONTENT messages", () => {
    const json = {
      messages: [
        { messageType: "CONTENT", fragments: [{ text: "Part 1" }] },
        { messageType: "CONTENT", fragments: [{ text: "Part 2" }] },
      ],
    };
    expect(extractGleanAnswer(json)).toBe("Part 1\nPart 2");
  });

  it("should fall back to messages without messageType", () => {
    const json = {
      messages: [
        { messageType: "UPDATE", fragments: [{ text: "Searching:" }, { text: "AI" }] },
        { fragments: [{ text: "Fallback answer" }] },
      ],
    };
    // No CONTENT messages, falls back to messages without messageType
    expect(extractGleanAnswer(json)).toContain("Fallback answer");
  });

  it("should return empty string for empty messages", () => {
    expect(extractGleanAnswer({ messages: [] })).toBe("");
    expect(extractGleanAnswer({})).toBe("");
    expect(extractGleanAnswer(null)).toBe("");
  });

  it("should format research trail as markdown blockquote with inline-code chips", () => {
    const json = {
      messages: [
        { messageType: "UPDATE", fragments: [{ text: "**Searching:**" }, { text: "term A" }] },
        { messageType: "UPDATE", fragments: [{ text: "**Searching:**" }, { text: "term B" }] },
        { messageType: "CONTENT", fragments: [{ text: "Synthesized answer." }] },
      ],
    };
    const result = extractGleanAnswer(json);
    expect(result).toContain("> **Searched:**");
    expect(result).toContain("`term A`");
    expect(result).toContain("`term B`");
    expect(result).toContain("---");
    expect(result).toContain("Synthesized answer.");
  });
});
