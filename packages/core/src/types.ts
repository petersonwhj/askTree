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
  /** Per-node reading progress as a normalized scroll fraction (0–1). */
  readingPositions?: Record<string, number>;
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
  /** True for the genuine article root (may be added even when depth-truncated). */
  isRoot?: boolean;
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
  /** Template for the "help me ask" suggested-questions feature. */
  suggestTemplate?: string;
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

export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  maxDepth: 3,
  contextRadius: [200, 100, 50],
  template: `System: You are a study assistant. A learner is reading an article and drilling into it with follow-up questions. Answer the question using the context below. Focus on the highlighted term — marked with «» in the passage — and answer user's question regarding the highlighted term; treat the earlier trail only as background for how the learner arrived, not as the subject. Be clear and concise, define terms in plain language, and build the explanation up step by step. Write every formula in LaTeX between dollar signs: $$...$$ for display math and $...$ for inline math. Always wrap display environments such as \\begin{align}...\\end{align} in $$...$$ as well. If the context is not enough to answer confidently, say what is specifically missing rather than guessing. Reply in the same language as the question.

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
  suggestTemplate: SUGGEST_TEMPLATE,
};
