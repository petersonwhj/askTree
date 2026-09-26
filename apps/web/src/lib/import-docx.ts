/** Convert a .docx file to Markdown using mammoth (docx → HTML) and turndown (HTML → md). */
export async function docxToMarkdown(file: File): Promise<string> {
  const [{ default: mammoth }, { default: TurndownService }, { gfm }] = await Promise.all([
    import("mammoth"),
    import("turndown"),
    import("turndown-plugin-gfm"),
  ]);

  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  turndown.use(gfm);
  // Mammoth wraps every table cell's text in a <p>, which would otherwise inject
  // blank lines into the GFM pipe table. Flatten paragraphs that sit in a cell.
  turndown.addRule("cellParagraph", {
    filter: (node) =>
      node.nodeName === "P" &&
      ["TD", "TH"].includes(node.parentNode?.nodeName ?? ""),
    replacement: (content) => content,
  });

  const markdown = turndown.turndown(html).trim();
  if (!markdown) throw new Error(`No readable text found in "${file.name}".`);
  return markdown;
}
