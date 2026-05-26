import MarkdownIt from "markdown-it";
import mk from "markdown-it-katex";
import DOMPurify from "dompurify";

const md = new MarkdownIt({ html: false, breaks: true, linkify: true })
  .use(mk);

export function renderMarkdown(content: string): string {
  try {
    const raw = md.render(content);
    return raw;
  } catch {
    return `<pre>${escapeHtml(content)}</pre>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
