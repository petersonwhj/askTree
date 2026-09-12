import { DEFAULT_PROMPT_CONFIG, type PromptConfig, type ContextSlice } from "./types";
import type { TreeStore } from "./tree-store";

function cutSurrounding(content: string, startPos: number, endPos: number, radius: number): string {
  let left = Math.max(0, startPos - radius);
  let right = Math.min(content.length, endPos + radius);

  // Snap left edge to the next word boundary (space) to avoid mid-word cuts
  if (left > 0) {
    const spaceAfter = content.indexOf(" ", left);
    if (spaceAfter !== -1 && spaceAfter < startPos) left = spaceAfter + 1;
  }

  // Snap right edge to the previous word boundary
  if (right < content.length) {
    const spaceBefore = content.lastIndexOf(" ", right);
    if (spaceBefore > endPos) right = spaceBefore;
  }

  const before = content.slice(left, startPos);
  const selected = "«" + content.slice(startPos, endPos) + "»";
  const after = content.slice(endPos, right);

  const prefix = left > 0 ? "…" : "";
  const suffix = right < content.length ? "…" : "";

  return prefix + before + selected + after + suffix;
}

export interface SelectionInfo {
  start: number;
  end: number;
  text: string;
}

export async function collectContext(
  nodeId: string,
  selection: SelectionInfo | null,
  store: TreeStore,
  config: PromptConfig = DEFAULT_PROMPT_CONFIG
): Promise<ContextSlice[]> {
  const slices: ContextSlice[] = [];
  const path = store.getPath(nodeId);

  for (let i = path.length - 1; i >= 0 && slices.length <= config.maxDepth; i--) {
    const depth = path.length - 1 - i;
    const radius = config.contextRadius[depth] ?? config.contextRadius[config.contextRadius.length - 1];
    const node = path[i];
    const content = await store.getContent(node.id);

    let selectedText = "";
    let startPos = 0;
    let endPos = 0;

    if (depth === 0 && selection) {
      // Use the user's exact selection offsets for the focused node
      selectedText = selection.text;
      startPos = selection.start;
      endPos = selection.end;
    } else if (depth > 0) {
      // For ancestors: find edge from this ancestor → its child in the path,
      // whose stored positions correctly index this ancestor's own content
      // (not the parent → this node edge, which indexes the parent's content)
      const childInPath = path[i + 1];
      const edge = node.children.find((e) => e.targetNodeId === childInPath.id);
      if (edge?.selectedText) {
        selectedText = edge.selectedText;
        startPos = edge.startPos;
        endPos = edge.endPos;
      }
    }

    let surrounding: string;
    if (selectedText) {
      surrounding = cutSurrounding(content, startPos, endPos, radius);
    } else if (depth === 0) {
      // Free ask (no selection): load the full focused passage as context.
      surrounding = content;
    } else {
      surrounding = content.slice(0, radius * 2);
    }

    slices.push({ nodeTitle: node.title, selectedText, surrounding, depth });
  }

  return slices;
}

/**
 * Prompt used by the "help me ask" feature: turn the focused passage (or the
 * highlighted selection) into a few questions that surface its hard points.
 */
export const SUGGEST_TEMPLATE = `System: You are a study assistant. A learner is reading the passage below but is stuck and cannot formulate a question. Identify what is hardest to understand and propose exactly 3 short, specific questions that would genuinely help the learner understand it. Output only the 3 questions, one per line, with no numbering, bullets, or extra commentary. Reply in the same language as the passage.

User:
The learner is focused on "{selected_text}".

---
{surrounding_text}
---

{ancestors}`;

/** Pull up to `max` questions out of a model reply, tolerating list/quote noise. */
export function parseSuggestedQuestions(text: string, max = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawLine of (text || "").split(/\r?\n/)) {
    let line = rawLine.trim().replace(/^(?:[-*•]|\d+\s*[.)、:：])\s*/, "").trim();
    line = line.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
    if (!line || line.length > 300 || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

export function renderPrompt(
  slices: ContextSlice[],
  question: string,
  template: string
): { system: string; user: string } {
  const directSlice = slices.find((s) => s.depth === 0) ?? slices[0];
  const ancestors = slices
    .filter((s) => s.depth > 0)
    .sort((a, b) => b.depth - a.depth)
    .map((s) => `[${s.nodeTitle}]\n${s.surrounding}`)
    .join("\n\n");

  const selectedText = directSlice?.selectedText || "";
  let base = template;
  if (!selectedText) {
    // Free ask: templates frame the question around a highlighted passage. With
    // no selection that clause only confuses the model, so drop those lines.
    base = base
      .split(/\r?\n/)
      .filter((line) => !line.includes("{selected_text}"))
      .join("\n");
  }

  let text = base
    .replaceAll("{selected_text}", selectedText || "this section")
    .replaceAll("{surrounding_text}", directSlice?.surrounding || "")
    .replaceAll("{ancestors}", ancestors || "(no broader context available)")
    .replaceAll("{user_question}", question)
    .replaceAll("{root_title}", slices[slices.length - 1]?.nodeTitle || "")
    .replaceAll("{full_article}", "")
    // slices are leaf-first (depth 0 → maxDepth); reverse so path reads root → current
    .replaceAll("{path_summary}",
      slices.length <= 1
        ? "I'm reading this article for the first time."
        : "My reading trail: " + [...slices].reverse().map((s) => s.nodeTitle).join(" → "));

  const parts = text.split("User:");
  const system = parts[0]?.replace(/^System:\s*/, "").trim() || "";
  const user = parts[1]?.trim() || text;
  return { system, user };
}
