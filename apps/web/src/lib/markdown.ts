import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
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
  .use(texmath, {
    engine: katex,
    delimiters: ["dollars", "brackets"],
  });

for (const [index, rule] of texmath.mergeDelimiters(["dollars", "brackets"]).block.entries()) {
  const parseMathBlock = texmath.block(rule);
  md.block.ruler.before("paragraph", `math_paragraph_${index}`, (state, startLine, endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    return parseMathBlock(state, startLine, endLine, silent);
  }, { alt: ["paragraph"] });
}

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
