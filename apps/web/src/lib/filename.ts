/** Turn a node/article title into a safe file name base. */
export function sanitizeFilename(name: string): string {
  const cleaned = (name || "untitled")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[-\s]+|[-\s]+$/g, "");
  return cleaned || "untitled";
}
