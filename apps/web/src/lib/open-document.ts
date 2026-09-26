import type { DocumentKind } from "@asktree/core";
import { docxToMarkdown } from "./import-docx";

export type OpenDocument = (
  content: string,
  title: string,
  kind?: DocumentKind,
) => Promise<void>;

const DOCX = /\.docx$/i;
const DOC = /\.doc$/i;
const MARKDOWN = /\.(md|markdown|txt)$/i;

export function documentTitle(fileName: string): string {
  return fileName.replace(/\.(md|markdown|txt|docx)$/i, "");
}

export async function openDocumentFile(file: File, create: OpenDocument): Promise<void> {
  const title = documentTitle(file.name) || "Untitled";

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
