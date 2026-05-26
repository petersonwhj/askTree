import MarkdownIt from "markdown-it";
import mk from "markdown-it-katex";
import DOMPurify from "dompurify";

const md = new MarkdownIt({ html: false, breaks: true, linkify: true })
  .use(mk);

export function renderMarkdown(content: string): string {
  try {
    const raw = md.render(content);
    return DOMPurify.sanitize(raw, {
      ADD_TAGS: ["math", "semantics", "annotation", "mrow", "mi", "mo", "mn", "msup", "mfrac", "msqrt", "mover", "munder", "mtable", "mtr", "mtd", "mstyle", "mspace", "mpadded", "mphantom", "menclose"],
      ADD_ATTR: ["xmlns", "encoding", "data-line", "linethickness"],
    });
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
