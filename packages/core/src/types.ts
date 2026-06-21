export interface Edge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  selectedText: string;
  startPos: number;
  endPos: number;
  question: string;
}

export interface Node {
  id: string;
  title: string;
  type: "article" | "answer";
  status: "resolved" | "question";
  parentId: string | null;
  children: Edge[];
  createdAt: number;
}

export interface TreeJSON {
  version: number;
  rootNodeId: string;
  nodes: Record<string, Node>;
  createdAt: number;
  updatedAt: number;
}

export interface ExportBundle {
  version: 1;
  tree: TreeJSON;
  contents: Record<string, string>;
}

export interface LLMConfig {
  endpoint: string;
  apiKey?: string;
  authHeader?: string;
  model: string;
}

export interface ContextSlice {
  nodeTitle: string;
  selectedText: string;
  surrounding: string;
  depth: number;
}

export interface AskOptions {
  question: string;
  contextSlices: ContextSlice[];
  template?: string;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
  /** Rendered system prompt — when supplied, clients use this instead of ad-hoc build */
  system?: string;
  /** Rendered user prompt — when supplied, clients use this instead of ad-hoc build */
  user?: string;
}

export interface PromptConfig {
  maxDepth: number;
  contextRadius: number[];
  template: string;
}

export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  maxDepth: 3,
  contextRadius: [200, 100, 50],
  template: `System: You are a focused study assistant helping a learner understand an article. Answer using only the provided context. When the context is insufficient to answer confidently, say so rather than guessing. Use clear, structured explanations and reply in the same language as the user's question. The highlighted text is enclosed in «guillemet markers» to help you locate it precisely within the surrounding passage.

User:
I'm studying **{root_title}**. {path_summary}

{ancestors}

---
{surrounding_text}
---

About the highlighted part "{selected_text}":

{user_question}`,
};
