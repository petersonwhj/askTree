import { DEFAULT_PROMPT_CONFIG, type PromptConfig, type ContextSlice } from "./types";
import type { TreeStore } from "./tree-store";

function cutSurrounding(content: string, startPos: number, endPos: number, radius: number): string {
  const before = content.slice(Math.max(0, startPos - radius), startPos);
  const selected = content.slice(startPos, endPos);
  const after = content.slice(endPos, endPos + radius);
  return before + selected + after;
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

    const surrounding = selectedText
      ? cutSurrounding(content, startPos, endPos, radius)
      : content.slice(0, radius * 2);

    slices.push({ nodeTitle: node.title, selectedText, surrounding, depth });
  }

  return slices;
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

  let text = template
    .replaceAll("{selected_text}", directSlice?.selectedText || "this section")
    .replaceAll("{surrounding_text}", directSlice?.surrounding || "")
    .replaceAll("{ancestors}", ancestors || "（无更上层上下文）")
    .replaceAll("{user_question}", question)
    .replaceAll("{root_title}", slices[slices.length - 1]?.nodeTitle || "")
    .replaceAll("{full_article}", "")
    .replaceAll("{path_summary}", slices.map((s) => s.nodeTitle).join(" → "));

  const parts = text.split("User:");
  const system = parts[0]?.replace(/^System:\s*/, "").trim() || "";
  const user = parts[1]?.trim() || text;
  return { system, user };
}
