import { describe, it, expect } from "vitest";
import { pdfFetchProblem } from "../url";

describe("pdfFetchProblem", () => {
  it("tells the reader to download a local file, then open it", () => {
    const reason = pdfFetchProblem("file:///D:/books/%E4%B9%A6.pdf");
    expect(reason).toContain("Download");
    expect(reason).toContain("📂");
  });

  it("allows http(s)", () => {
    expect(pdfFetchProblem("https://example.com/book.pdf")).toBeNull();
    expect(pdfFetchProblem("http://localhost:5173/x.pdf")).toBeNull();
  });

  it("tells the reader to download for other schemes", () => {
    const reason = pdfFetchProblem("blob:https://example.com/abc");
    expect(reason).toContain("Download");
    expect(reason).toContain("📂");
  });
});
