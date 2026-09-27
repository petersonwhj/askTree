/**
 * A user-facing reason the extension cannot fetch a PDF at this URL, or null
 * when it can. The extension fetches with `fetch`, which only supports
 * http(s) — notably it cannot read `file://`, so a local PDF must be opened
 * with the app's own file picker instead.
 */
export function pdfFetchProblem(url: string): string | null {
  let scheme: string;
  try {
    scheme = new URL(url).protocol;
  } catch {
    return "This address could not be understood.";
  }
  if (scheme === "file:") {
    return "This PDF is a local file, which an extension cannot read. Open it in AskTree with the 📂 button instead.";
  }
  if (scheme !== "http:" && scheme !== "https:") {
    return `This PDF's address (${scheme}) cannot be read by the extension.`;
  }
  return null;
}
