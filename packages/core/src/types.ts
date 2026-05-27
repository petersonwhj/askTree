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
}

export interface PromptConfig {
  maxDepth: number;
  contextRadius: number[];
  template: string;
}

export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  maxDepth: 3,
  contextRadius: [200, 100, 50],
  template: `System: 你是一个帮助用户理解文章内容的学习助手。请基于提供的文章上下文，针对用户的问题给出清晰、结构化的解释。使用通俗易懂的语言，逐步深入。

User:
我正在学习以下文章，请基于上下文回答我的问题：

{ancestors}

---
{surrounding_text}
---

我对文中「{selected_text}」有疑问：

{user_question}`,
};
