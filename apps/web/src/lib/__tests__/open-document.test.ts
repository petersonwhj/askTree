import { describe, it, expect, vi } from "vitest";
import { openDocumentFile } from "../open-document";

vi.mock("../import-docx", () => ({
  docxToMarkdown: vi.fn(async () => "# Converted"),
}));

function markdownFile(name: string, text: string): File {
  const file = new File([text], name, { type: "text/markdown" });
  // jsdom's Blob has no text(); supply it.
  Object.defineProperty(file, "text", { value: async () => text });
  return file;
}

describe("openDocumentFile", () => {
  it("converts a .docx and records kind docx", async () => {
    const create = vi.fn();
    await openDocumentFile(new File(["x"], "My Article.docx"), create);
    expect(create).toHaveBeenCalledWith("# Converted", "My Article", "docx");
  });

  it("reads markdown files as kind markdown", async () => {
    const create = vi.fn();
    await openDocumentFile(markdownFile("notes.md", "# Notes"), create);
    expect(create).toHaveBeenCalledWith("# Notes", "notes", "markdown");
  });

  it("rejects legacy .doc files", async () => {
    await expect(
      openDocumentFile(new File(["x"], "old.doc"), vi.fn()),
    ).rejects.toThrow("Legacy .doc files aren't supported. Save it as .docx and try again.");
  });

  it("rejects unsupported files by name", async () => {
    await expect(
      openDocumentFile(new File(["x"], "photo.png"), vi.fn()),
    ).rejects.toThrow('Unsupported file "photo.png"');
  });
});
