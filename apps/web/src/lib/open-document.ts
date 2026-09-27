import type { DocumentKind } from "@asktree/core";
import { docxToMarkdown } from "./import-docx";

export type OpenDocument = (
  content: string,
  title: string,
  kind?: DocumentKind,
  asset?: Blob,
) => Promise<void>;

const DOCX = /\.docx$/i;
const DOC = /\.doc$/i;
const PDF = /\.pdf$/i;
const MARKDOWN = /\.(md|markdown|txt)$/i;

export function documentTitle(fileName: string): string {
  return fileName.replace(/\.(md|markdown|txt|docx|pdf)$/i, "");
}

export async function openDocumentFile(file: File, create: OpenDocument): Promise<void> {
  const title = documentTitle(file.name) || "Untitled";

  if (PDF.test(file.name)) {
    // A File is already a Blob: store it as-is instead of reading 100+ MB into
    // an ArrayBuffer (which also exceeds Chrome's per-value IndexedDB limit).
    await create("", title, "pdf", file);
    return;
  }
  if (DOCX.test(file.name)) {
    await create(await docxToMarkdown(file), title, "docx");
    return;
  }
  if (DOC.test(file.name)) {
    throw new Error("Legacy .doc files aren't supported. Save it as .docx and try again.");
  }
  if (MARKDOWN.test(file.name) || file.type.startsWith("text/")) {
    await create(await file.text(), title, "markdown");
    return;
  }
  throw new Error(
    `Unsupported file "${file.name}". Open a .md, .markdown, .txt or .docx file.`,
  );
}
