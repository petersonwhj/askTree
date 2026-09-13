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

  it("keeps Unicode titles and strips every forbidden filename character", () => {
    expect(sanitizeFilename("精确度 fp32/fp16\\bf16 <配置>")).toBe(
      "精确度 fp32-fp16-bf16 -配置",
    );
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("falls back when the title is only forbidden characters", () => {
    expect(sanitizeFilename('///')).toBe("untitled");
  });
});
