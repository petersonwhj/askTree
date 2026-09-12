import { describe, it, expect } from "vitest";
import { sanitizeFilename } from "../filename";

describe("sanitizeFilename", () => {
  it("replaces illegal characters and trims edge separators", () => {
    expect(sanitizeFilename('为什么配置和分词器"必须一起下"?')).toBe(
      "为什么配置和分词器-必须一起下",
    );
  });

  it("falls back to a default when empty", () => {
    expect(sanitizeFilename("")).toBe("untitled");
  });
});
