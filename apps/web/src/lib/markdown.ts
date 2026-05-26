import MarkdownIt from "markdown-it";
import mk from "markdown-it-katex";
import DOMPurify from "dompurify";

const MATHML_TAGS = [
  "math", "semantics", "annotation", "mrow", "mi", "mo", "mn", "ms", "mtext",
  "msup", "msub", "msubsup", "mmultiscripts", "mprescripts", "none",
  "mfrac", "msqrt", "mroot", "mover", "munder", "munderover",
  "mtable", "mtr", "mtd", "mstyle", "mspace", "mpadded",
  "mphantom", "menclose", "mfenced", "merror",
];

const MATHML_ATTRS = [
  "xmlns", "encoding", "data-line", "linethickness", "mathvariant",
  "displaystyle", "scriptlevel", "stretchy", "lspace", "rspace",
  "maxsize", "minsize", "symmetric", "accent", "movablelimits",
  "separators", "open", "close", "depth", "height", "width",
  "rowspan", "columnspan", "columnalign", "rowalign",
  "framespacing", "columnlines", "rowlines", "frame", "notation",
  "bevelled", "numalign", "denomalign",
];

const md = new MarkdownIt({ html: false, breaks: true, linkify: true })
  .use(mk);

export function renderMarkdown(content: string): string {
  try {
    const raw = md.render(content);
    return DOMPurify.sanitize(raw, {
      ADD_TAGS: MATHML_TAGS,
      ADD_ATTR: MATHML_ATTRS,
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
