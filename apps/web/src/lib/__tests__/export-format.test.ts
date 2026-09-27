import { describe, it, expect } from "vitest";
import { chooseExportFormat, EXPORT_INLINE_LIMIT } from "../export-format";

describe("chooseExportFormat", () => {
  it("inlines small pdfs and zips large ones", () => {
    expect(chooseExportFormat("pdf", 1024)).toBe("json");
    expect(chooseExportFormat("pdf", EXPORT_INLINE_LIMIT + 1)).toBe("zip");
    expect(chooseExportFormat("markdown", 10 ** 9)).toBe("json");
  });
});
