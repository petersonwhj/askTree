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
        { messageType: "UPDATE", fragments: [{ text: "Searching..." }] },
        { messageType: "CONTENT", fragments: [{ text: "Here is the answer." }] },
      ],
    };
    expect(extractGleanAnswer(json)).toBe("Here is the answer.");
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
        { messageType: "UPDATE", fragments: [{ text: "Searching..." }] },
        { fragments: [{ text: "Fallback answer" }] },
      ],
    };
    // No CONTENT messages, falls back to messages without messageType
    expect(extractGleanAnswer(json)).toBe("Fallback answer");
  });

  it("should return empty string for empty messages", () => {
    expect(extractGleanAnswer({ messages: [] })).toBe("");
    expect(extractGleanAnswer({})).toBe("");
    expect(extractGleanAnswer(null)).toBe("");
  });

  it("should combine multiple fragments within a message", () => {
    const json = {
      messages: [
        {
          messageType: "CONTENT",
          fragments: [{ text: "First part. " }, { text: "Second part." }],
        },
      ],
    };
    expect(extractGleanAnswer(json)).toBe("First part. Second part.");
  });
});
