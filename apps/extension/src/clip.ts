import Defuddle from "defuddle";

export interface Clip {
  title: string;
  url: string;
  markdown: string;
}

/**
 * Wrap extracted Markdown as a document: a title, a source header and the body.
 * Pure, so it can be unit-tested; `clipDocument` feeds it Defuddle's output.
 * Returns null when there is nothing usable to clip.
 */
export function formatClip(title: string, url: string, body: string, date = new Date()): Clip | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // keep the raw url
  }
  const cleanTitle = (title || host).trim() || host;
  const day = date.toISOString().slice(0, 10);

  return {
    title: cleanTitle,
    url,
    markdown: `# ${cleanTitle}\n\n> Source: ${url} — ${day}\n\n${trimmed}`,
  };
}

/**
 * Turn a page into a document. Defuddle extracts the main content and emits
 * Markdown itself (and already falls back to the whole body when it finds no
 * article).
 *
 * jsdom cannot run this: Defuddle uses `:has()`, which its selector engine does
 * not support. It is exercised by the browser end-to-end test instead; the pure
 * `formatClip` above carries the unit coverage.
 */
export function clipDocument(doc: Document, url: string): Clip | null {
  const result = new Defuddle(doc, { url, markdown: true, separateMarkdown: true }).parse();
  return formatClip(result.title || doc.title, url, result.contentMarkdown ?? "");
}
