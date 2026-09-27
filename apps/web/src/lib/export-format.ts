import type { DocumentKind } from "@asktree/core";

/** Documents whose asset exceeds this are exported as a zip instead of inline JSON. */
export const EXPORT_INLINE_LIMIT = 10 * 1024 * 1024;

export function chooseExportFormat(kind: DocumentKind, assetBytes: number): "json" | "zip" {
  return kind === "pdf" && assetBytes > EXPORT_INLINE_LIMIT ? "zip" : "json";
}
