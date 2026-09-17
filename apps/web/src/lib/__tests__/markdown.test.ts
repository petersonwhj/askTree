import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../markdown";

function parse(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("renderMarkdown — math delimiters", () => {
  it("renders inline math written with $...$", () => {
    const root = parse(renderMarkdown("see $ax^2+b=0$ here"));
    expect(root.querySelectorAll(".katex").length).toBe(1);
  });

  it("renders display math written with $$...$$", () => {
    const root = parse(renderMarkdown("before\n\n$$\nax^2+b=0\n$$\n\nafter"));
    expect(root.querySelectorAll(".katex-display").length).toBe(1);
  });

  it("renders inline math written with \\(...\\)", () => {
    const root = parse(renderMarkdown("see \\(ax^2+b=0\\) here"));
    expect(root.querySelectorAll(".katex").length).toBe(1);
  });

  it("renders display math written with \\[...\\]", () => {
    const root = parse(renderMarkdown("before\n\n\\[\nax^2+b=0\n\\]\n\nafter"));
    expect(root.querySelectorAll(".katex-display").length).toBe(1);
  });

  it.each(["\n", "\r\n"])("renders the user's consecutive display formulas with %j line endings", (newline) => {
    const source = String.raw`### 1. 先看 \(x_1\) 和 \(x_2\) 是什么
它们是一元二次方程
\[
ax^2+bx+c=0
\]
的两个根。

### 3. 看第一个韦达式子
\[
x_1+x_2
\]
交换后变成：
\[
x_2+x_1
\]
因为加法有交换律：
\[
x_2+x_1=x_1+x_2
\]
所以结果没变。`.replace(/\n/g, newline);
    const root = parse(renderMarkdown(source));
    const formulas = Array.from(root.querySelectorAll(".katex-display annotation"), (node) => node.textContent?.trim());
    expect(formulas).toEqual(["ax^2+bx+c=0", "x_1+x_2", "x_2+x_1", "x_2+x_1=x_1+x_2"]);
    expect(root.querySelectorAll(".katex")).toHaveLength(6);
    expect(root.querySelector(".katex-error")).toBeNull();
    expect(root.textContent).toContain("的两个根。");
    expect(root.textContent).toContain("所以结果没变。");
  });

  it("renders a LaTeX environment wrapped in $$...$$", () => {
    const src = "before\n\n$$\n\\begin{align}\nx &= 1 \\\\\ny &= 2\n\\end{align}\n$$\n\nafter";
    const root = parse(renderMarkdown(src));
    expect(root.querySelectorAll(".katex-display").length).toBe(1);
  });
});

describe("renderMarkdown — delimiters must not misfire", () => {
  it("leaves math-like text inside a code fence alone", () => {
    const root = parse(renderMarkdown("text\n\n```\n\\[ not math \\]\n```\n\nend"));
    expect(root.querySelectorAll(".katex").length).toBe(0);
    expect(root.textContent).toContain("\\[ not math \\]");
  });

  it("leaves lone dollar amounts alone", () => {
    const root = parse(renderMarkdown("It costs $5 and $10 total."));
    expect(root.querySelectorAll(".katex").length).toBe(0);
  });
});
