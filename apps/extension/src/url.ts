/**
 * A user-facing reason the extension cannot fetch a PDF at this URL, or null
 * when it can. The extension fetches with `fetch`, which only supports
 * http(s) — notably it cannot read `file://`, so a non-http PDF must be
 * downloaded and opened with the app's own file picker instead.
 */
const DOWNLOAD_HINT = "Download the PDF, then open it in AskTree with the 📂 button.";

export function pdfFetchProblem(url: string): string | null {
  let scheme: string;
  try {
    scheme = new URL(url).protocol;
  } catch {
    return "This address could not be understood.";
  }
  if (scheme === "file:") {
    return `This is a local file, which the extension cannot load directly. ${DOWNLOAD_HINT}`;
  }
  if (scheme !== "http:" && scheme !== "https:") {
    return `This PDF cannot be loaded directly from its address (${scheme}). ${DOWNLOAD_HINT}`;
  }
  return null;
}
