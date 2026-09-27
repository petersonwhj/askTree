import { describe, it, expect } from "vitest";
import { pdfFetchProblem } from "../url";

describe("pdfFetchProblem", () => {
  it("explains that local files cannot be fetched for a file: URL", () => {
    const reason = pdfFetchProblem("file:///D:/books/%E4%B9%A6.pdf");
    expect(reason).toContain("local file");
    expect(reason).toContain("📂");
  });

  it("allows http(s)", () => {
    expect(pdfFetchProblem("https://example.com/book.pdf")).toBeNull();
    expect(pdfFetchProblem("http://localhost:5173/x.pdf")).toBeNull();
  });

  it("rejects other schemes", () => {
    expect(pdfFetchProblem("chrome://settings")).toContain("cannot be read");
  });
});
