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

    slices.push({ nodeTitle: node.title, selectedText, surrounding, depth, isRoot: i === 0 });
  }

  // The trail is walked UP from the focused node and may stop before the real
  // root. Always anchor it with the genuine root so it is never represented by
  // a depth-truncated ancestor.
  if (path.length > 0 && !slices.some((s) => s.isRoot)) {
    const root = path[0];
    const radius = config.contextRadius[config.contextRadius.length - 1];
    const content = await store.getContent(root.id);
    slices.push({
      nodeTitle: root.title,
      selectedText: "",
      surrounding: content.slice(0, radius * 2),
      depth: path.length - 1,
      isRoot: true,
    });
  }

  return slices;
}

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

  // slices are leaf-first (depth 0 → maxDepth); reverse so the trail reads root → current.
  const pathSummary = [...slices]
    .reverse()
    .map((s, i) => `${i + 1}. ${s.nodeTitle}`)
    .join("\n");

  let text = template
    .replaceAll("{selected_text}", directSlice?.selectedText || "this section")
    .replaceAll("{surrounding_text}", directSlice?.surrounding || "")
    .replaceAll(
      "{ancestors}",
      ancestors || "(This is my first question on this article — no earlier trail yet.)",
    )
    .replaceAll("{user_question}", question)
    .replaceAll(
      "{root_title}",
      slices.find((s) => s.isRoot)?.nodeTitle ?? slices[slices.length - 1]?.nodeTitle ?? "",
    )
    .replaceAll("{full_article}", "")
    .replaceAll("{path_summary}", pathSummary);

  // Split on the FIRST "User:" only. Using split() would also cut at any
  // "User:" that appears inside the article/selection text, truncating the prompt.
  const delim = text.indexOf("User:");
  if (delim === -1) {
    return { system: text.replace(/^System:\s*/, "").trim(), user: text.trim() };
  }
  const system = text.slice(0, delim).replace(/^System:\s*/, "").trim();
  const user = text.slice(delim + "User:".length).trim();
  return { system, user };
}
