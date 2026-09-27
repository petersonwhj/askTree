import { describe, it, expect } from "vitest";
import { formatClip } from "../clip";

const DATE = new Date("2026-09-27T12:00:00Z");

describe("formatClip", () => {
  it("adds a title and a source header", () => {
    const clip = formatClip("My Page", "https://example.com/post", "Hello body.", DATE);
    expect(clip).not.toBeNull();
    expect(clip!.title).toBe("My Page");
    expect(clip!.markdown).toBe(
      "# My Page\n\n> Source: https://example.com/post — 2026-09-27\n\nHello body.",
    );
  });

  it("falls back to the host when there is no title", () => {
    const clip = formatClip("", "https://example.com/post", "Body.", DATE);
    expect(clip!.title).toBe("example.com");
  });

  it("returns null for an empty body", () => {
    expect(formatClip("T", "https://example.com", "   \n  ", DATE)).toBeNull();
  });
});
