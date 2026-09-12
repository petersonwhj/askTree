import { describe, it, expect, vi, afterEach } from "vitest";
import { saveTextFile } from "../save-file";

const opts = {
  suggestedName: "Q1.md",
  description: "Markdown",
  mimeType: "text/markdown",
  extensions: [".md"],
};

describe("saveTextFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it("writes through the file picker when available", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: showSaveFilePicker,
    });

    await saveTextFile("hello", opts);

    expect(showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: "Q1.md",
      types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
    });
    expect(write).toHaveBeenCalledWith("hello");
    expect(close).toHaveBeenCalled();
  });

  it("falls back to a blob download when the picker is unavailable", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    let downloadedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download;
    });

    await saveTextFile("hello", opts);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloadedName).toBe("Q1.md");
  });

  it("does not download when the user cancels the picker", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: vi.fn().mockRejectedValue(abort),
    });
    const createObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });

    await saveTextFile("hello", opts);

    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
