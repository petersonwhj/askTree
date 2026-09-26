import { describe, it, expect } from "vitest";
import { fileToAskImage } from "../image";

describe("fileToAskImage", () => {
  it("reads a file into base64 without the data: prefix", async () => {
    const file = new File(["abc"], "x.png", { type: "image/png" });
    const image = await fileToAskImage(file);
    expect(image.mediaType).toBe("image/png");
    expect(image.data).toBe("YWJj");
    expect(image.data).not.toContain("data:");
  });

  it("defaults an unknown media type to png", async () => {
    const file = new File(["abc"], "x", { type: "" });
    expect((await fileToAskImage(file)).mediaType).toBe("image/png");
  });
});
