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
  template: `System: You are a study assistant. A learner is reading an article and drilling into it with follow-up questions. Answer the question using the context below. Focus on the highlighted term — marked with «» in the passage — and explain it as it is used there; treat the earlier trail only as background for how the learner arrived, not as the subject. Be clear and concise, define terms in plain language, and build the explanation up step by step. If the context is not enough to answer confidently, say what is specifically missing rather than guessing. Reply in the same language as the question.

User:
I am studying the article "{root_title}".

--------- How I reached this question ---------
Each step is a question I drilled into, from the original article down to now:

{path_summary}

--------- Background — earlier passages (oldest first) ---------
Context from the steps above, given only to show how I got here — it is not the subject of my question:

{ancestors}

--------- The passage I am reading now ---------
My highlight is wrapped in «».

{surrounding_text}

--------- My question ---------
Within that passage I highlighted "{selected_text}".

{user_question}`,
};
