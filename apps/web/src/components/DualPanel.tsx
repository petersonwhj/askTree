import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTree } from "../hooks/useTree";
import { MarkdownPane } from "./MarkdownPane";
import { QuestionInputBar, type AskTarget } from "./QuestionInputBar";
import { PromptDebugModal } from "./PromptDebugModal";
import { saveTextFile } from "../lib/save-file";
import { sanitizeFilename } from "../lib/filename";
import {
  collectContext,
  renderPrompt,
  SUGGEST_TEMPLATE,
  parseSuggestedQuestions,
} from "@asktree/core";
import type { Node, TreeStore } from "@asktree/core";

/** Passages already asked about: spans from the node's surviving child edges. */
function exploredSpans(
  store: TreeStore,
  node: Node | undefined,
): Array<{ start: number; end: number; text: string }> {
  if (!node) return [];
  const edges = store.getNode(node.id)?.children ?? node.children;
  return edges
    .filter((e) => e.startPos >= 0 && e.endPos > e.startPos)
    .map((e) => ({ start: e.startPos, end: e.endPos, text: e.selectedText }));
}

function copyMarkdown(content: string | null) {
  if (content == null) return;
  navigator.clipboard.writeText(content).catch(() => {});
}

function downloadMarkdown(content: string | null, title: string) {
  if (content == null) return;
  void saveTextFile(content, {
    suggestedName: `${sanitizeFilename(title)}.md`,
    description: "Markdown",
    mimeType: "text/markdown",
    extensions: [".md"],
  });
}

function MarkdownActions({ content, title }: { content: string | null; title: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (content == null) return;
    copyMarkdown(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <>
      <button
        className={`panel-icon-btn${copied ? " copied" : ""}`}
        aria-label={copied ? "Copied" : "Copy markdown"}
        title={copied ? "Copied!" : "Copy markdown"}
        onClick={handleCopy}
        disabled={content == null}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10h.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <button
        className="panel-icon-btn"
        aria-label="Download markdown"
        title="Download .md"
        onClick={() => downloadMarkdown(content, title)}
        disabled={content == null}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2v7m0 0 2.5-2.5M8 9 5.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 11.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}

export function DualPanel({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const {
    store, llm, activePath, selectedText, setSelectedText,
    addChildNode, updateStatus, promptConfig, createRootTree, navigateTo, focusNode, navigateUp,
    showExplored, treeVersion,
  } = useTree();

  const [error, setError] = useState<string | null>(null);
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  const [splitRatio, setSplitRatio] = useState(50);
  const newArticleRef = useRef<HTMLTextAreaElement>(null);
  const emptyFileRef = useRef<HTMLInputElement>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [debugNodeId, setDebugNodeId] = useState<string | null>(null);
  const [debugSuggestion, setDebugSuggestion] = useState(false);
  const [freeAskTarget, setFreeAskTarget] = useState<AskTarget>("right");

  const currentNode = activePath[activePath.length - 1];
  const parentNode = activePath.length >= 2 ? activePath[activePath.length - 2] : currentNode;
  const [parentContent, setParentContent] = useState<string | null>(null);
  const [childContent, setChildContent] = useState<string | null>(null);

  useEffect(() => {
    if (parentNode) {
      store.getContent(parentNode.id).then(setParentContent).catch(() => setParentContent(""));
    } else {
      setParentContent(null);
    }
  }, [parentNode, store]);

  useEffect(() => {
    if (currentNode && currentNode.id !== parentNode?.id) {
      store.getContent(currentNode.id).then(setChildContent).catch(() => setChildContent(""));
    } else {
      setChildContent(null);
    }
  }, [currentNode, parentNode, store]);

  // Raw markdown slice for display (badge + placeholder).
  // selectedText.text is DOM text (for highlight); offsets point into the raw
  // markdown of the node the selection came from — which may be the left (parent)
  // or right (current) panel. Slice that node's content so the offsets line up.
  const displayRawText = useMemo(() => {
    if (!selectedText || !currentNode || !parentNode) return null;
    const sourceContent =
      selectedText.nodeId === parentNode.id
        ? parentContent
        : selectedText.nodeId === currentNode.id
          ? childContent
          : null;
    if (!sourceContent) return null;
    const { start, end } = selectedText;
    if (start < 0 || end <= start || start >= sourceContent.length) return null;
    return sourceContent.slice(start, Math.min(end, sourceContent.length));
  }, [selectedText, parentContent, childContent, parentNode, currentNode]);

  const selectionSide: "left" | "right" | null =
    selectedText && currentNode && parentNode
      ? selectedText.nodeId === parentNode.id
        ? "left"
        : selectedText.nodeId === currentNode.id
          ? "right"
          : null
      : null;

  // Context that the "help me ask" feature (generation and its debug view) uses.
  const suggestionTargetId =
    selectedText?.nodeId ??
    (freeAskTarget === "left" ? parentNode?.id : currentNode?.id) ??
    "";
  const suggestionSelection = selectedText
    ? { start: selectedText.start, end: selectedText.end, text: selectedText.text }
    : null;

  // The passage in the left pane that the right (current) node was asked about.
  const parentHighlight = useMemo(() => {
    if (!currentNode || !parentNode || currentNode.id === parentNode.id) return null;
    // Read from the store so the quote reflects the current edges (fresh after
    // navigation or deletion), not a stale activePath snapshot.
    const edges = store.getNode(parentNode.id)?.children ?? parentNode.children;
    const edge = edges.find((e) => e.targetNodeId === currentNode.id);
    return edge && edge.startPos >= 0 && edge.endPos > edge.startPos
      ? { start: edge.startPos, end: edge.endPos, text: edge.selectedText }
      : null;
    // treeVersion: recompute after deletions so the quote/marks stay current.
  }, [parentNode, currentNode, store, treeVersion]);

  const parentExplored = useMemo(
    () => (showExplored ? exploredSpans(store, parentNode) : []),
    [showExplored, store, parentNode, treeVersion],
  );
  const childExplored = useMemo(
    () => (showExplored ? exploredSpans(store, currentNode) : []),
    [showExplored, store, currentNode, treeVersion],
  );

  const handleDividerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startRatio = splitRatio;
    const container = (e.target as HTMLElement).parentElement;
    const containerWidth = container?.clientWidth || window.innerWidth;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newRatio = Math.min(80, Math.max(20, startRatio + (dx / containerWidth) * 100));
      setSplitRatio(newRatio);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [splitRatio]);

  if (!currentNode) {
    const handleStart = async () => {
      const content = newArticleRef.current?.value || newContent;
      if (!content) return;
      await createRootTree(content, newTitle || "Untitled");
      setNewContent("");
      setNewTitle("");
    };

    const handleOpenFile = async (file: File) => {
      try {
        const text = await file.text();
        const title = file.name.replace(/\.(md|markdown|txt)$/i, "");
        await createRootTree(text, title || "Untitled");
      } catch (err) {
        setError("Failed to read file: " + (err as Error).message);
      }
    };

    return (
      <div className="dual-panel">
        <div
          className={`empty-state ${isDragOver ? "drag-over" : ""}`}
          onDrop={async (e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) {
              try {
                const text = await file.text();
                const title = file.name.replace(/\.(md|markdown|txt)$/i, "");
                await createRootTree(text, title);
              } catch (err) {
                setError("Failed to read file: " + (err as Error).message);
              }
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
        >
          <h2>Welcome to AskTree</h2>
          <p>Open a Markdown file, paste an article, or drop a file here to start learning.</p>

          <input
            type="text" placeholder="Article title..." value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="empty-state-input"
          />
          <textarea
            ref={newArticleRef}
            placeholder="# Your Markdown article here..."
            className="empty-state-textarea"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="empty-state-actions">
            <button onClick={handleStart}>Start Learning</button>
            <button
              className="secondary"
              onClick={() => emptyFileRef.current?.click()}
              type="button"
            >
              📂 Open Markdown File
            </button>
          </div>
          <input
            ref={emptyFileRef}
            type="file"
            accept=".md,.markdown,.txt"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleOpenFile(file);
              e.target.value = "";
            }}
          />

          {error && (
            <div className="error-banner">
              Error: {error}
              <button onClick={() => setError(null)} className="error-dismiss">Dismiss</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleSendQuestion = async (question: string) => {
    setError(null);
    const questionedNodeId =
      selectedText?.nodeId ||
      (freeAskTarget === "left" ? parentNode.id : currentNode.id);
    const askedText = selectedText?.text || "";
    const askedStart = selectedText?.start || 0;
    const askedEnd = selectedText?.end || 0;
    // Capture raw markdown slice for display before clearing selectedText
    const askedRawText = displayRawText || askedText;
    setSelectedText(null);

    // Appendix 2: don't hard-truncate when $ is present (avoids unbalanced delimiter)
    // Appendix 4: put selection on its own paragraph so $$ $$ display math parses
    const selectionPara = askedRawText
      ? askedRawText.includes("$")
        ? askedRawText
        : askedRawText.slice(0, 500)
      : "";
    const placeholder = `> **Question:** ${question}\n\n` +
      (selectionPara
        ? `**About this selection:**\n\n${selectionPara}\n\n`
        : "") +
      `⏳ Analyzing...`;

    let childNode: Node;
    try {
      childNode = await store.addChild(questionedNodeId, {
        selectedText: askedText,
        startPos: askedStart,
        endPos: askedEnd,
        question,
      }, placeholder);
    } catch (e) {
      setError("Failed to create node: " + (e as Error).message);
      return;
    }

    const childId = childNode.id;
    setLoadingNodes((prev) => new Set(prev).add(childId));
    navigateTo(childId);

    (async () => {
      try {
        const slices = await collectContext(
          questionedNodeId,
          askedText ? { start: askedStart, end: askedEnd, text: askedText } : null,
          store,
          promptConfig,
        );
        const rendered = renderPrompt(slices, question, promptConfig.template);
        const answer = await llm.ask({
          question,
          contextSlices: slices,
          system: rendered.system,
          user: rendered.user,
        });
        await store.updateContent(childId, answer);
        setChildContent(answer);
      } catch (e) {
        const errMsg = `**Error:** ${(e as Error).message}\n\n> ${question}`;
        await store.updateContent(childId, errMsg);
        setChildContent(errMsg);
        setError((e as Error).message);
      } finally {
        setLoadingNodes((prev) => {
          const next = new Set(prev);
          next.delete(childId);
          return next;
        });
      }
    })();
  };

  const handleTextSelected = (text: string, start: number, end: number, nodeId: string) => {
    setSelectedText({ text, start, end, nodeId });
  };

  // "Help me ask": propose questions about the current passage (or selection).
  const requestSuggestions = async (): Promise<string[]> => {
    if (!llm.getConfig?.()) {
      throw new Error("LLM not configured. Open Settings to choose a provider.");
    }
    const slices = await collectContext(
      suggestionTargetId,
      suggestionSelection,
      store,
      promptConfig,
    );
    const rendered = renderPrompt(slices, "", promptConfig.suggestTemplate || SUGGEST_TEMPLATE);
    const raw = await llm.ask({
      question: "",
      contextSlices: slices,
      system: rendered.system,
      user: rendered.user,
    });
    return parseSuggestedQuestions(raw);
  };

  return (
    <>
    <div className="dual-panel">
      <div className="panel" style={{ width: `${splitRatio}%`, flex: "none" }}>
        <div className="panel-header">
          <span className="node-type">
            {parentNode.parentId ? (
              <button
                onClick={() => setDebugNodeId(parentNode.id)}
                className="prompt-debug-btn"
                aria-label="Show prompt debug"
                title="Show prompt debug"
              >
                ?
              </button>
            ) : (
              parentNode.type === "article" ? "📖" : "❓"
            )}{" "}
            <span className="panel-title" title={parentNode.title}>{parentNode.title}</span>
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {(activePath.length > 1 || parentNode.parentId) && (
              <button
                onClick={() => {
                  if (activePath.length > 1) {
                    navigateUp();
                  } else {
                    // Navigate via getPath to resolve full ancestor path
                    // so current node is preserved in the right panel
                    navigateTo(currentNode.id);
                  }
                }}
                className="shift-btn"
                title="Shift left → right"
              >
                →
              </button>
            )}
            <MarkdownActions content={parentContent} title={parentNode.title} />
            <select
              value={parentNode.status}
              onChange={(e) => { updateStatus(parentNode.id, e.target.value as "resolved" | "question"); }}
              className="status-select"
            >
              <option value="question">question</option>
              <option value="resolved">resolved</option>
            </select>
          </div>
        </div>
        {parentContent !== null && (
          <MarkdownPane
            content={parentContent}
            highlight={parentHighlight}
            onTextSelected={(text, start, end) => handleTextSelected(text, start, end, parentNode.id)}
            initialScrollFraction={store.getReadingPosition(parentNode.id)}
            onScrollFractionChange={(f) => store.setReadingPosition(parentNode.id, f)}
            explored={parentExplored}
            scrollToHighlight={!!parentHighlight}
          />
        )}
      </div>

      <div className="panel-divider" onMouseDown={handleDividerDown} />

      {/* Right: child / answer */}
      <div className="panel" style={{ width: `${100 - splitRatio}%`, flex: "none" }}>
        {childContent !== null ? (
          <>
            <div className="panel-header">
              <span className="node-type">
                <button
                  onClick={() => setDebugNodeId(currentNode.id)}
                  className="prompt-debug-btn"
                  aria-label="Show prompt debug"
                  title="Show prompt debug"
                >
                  ?
                </button>{" "}
                <span className="panel-title" title={currentNode.title}>{currentNode.title}</span>
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <MarkdownActions content={childContent} title={currentNode.title} />
                <button
                  onClick={() => navigateUp()}
                  className="close-panel-btn"
                  title="Close answer"
                >
                  ✕
                </button>
                <select
                  value={currentNode.status}
                  onChange={(e) => { updateStatus(currentNode.id, e.target.value as "resolved" | "question"); }}
                  className="status-select"
                >
                  <option value="question">question</option>
                  <option value="resolved">resolved</option>
                </select>
              </div>
            </div>
            <MarkdownPane
              content={childContent}
              onTextSelected={(text, start, end) => handleTextSelected(text, start, end, currentNode.id)}
              initialScrollFraction={store.getReadingPosition(currentNode.id)}
              onScrollFractionChange={(f) => store.setReadingPosition(currentNode.id, f)}
              explored={childExplored}
            />
          </>
        ) : (
          <div className="empty-state" style={{ flex: 1 }}>
            <p>Select text in the article and click the floating button to ask a question.</p>
            <p style={{ fontSize: 12, color: "#484f58" }}>Or use the input bar below for free-form questions.</p>
          </div>
        )}

        {error && (
          <div className="error-banner">
            Error: {error}
            <button onClick={() => setError(null)} className="error-dismiss">Dismiss</button>
          </div>
        )}

        <QuestionInputBar
          contextText={selectedText?.text || null}
          rawText={displayRawText}
          onSend={handleSendQuestion}
          isLoading={false}
          freeAskTarget={freeAskTarget}
          onFreeAskTargetChange={setFreeAskTarget}
          showFreeAskTarget={activePath.length > 1}
          contextSide={selectionSide}
          onRequestSuggestions={requestSuggestions}
          onOpenSettings={onOpenSettings}
          onDebugSuggestions={() => setDebugSuggestion(true)}
        />
      </div>
    </div>
    {debugNodeId && <PromptDebugModal nodeId={debugNodeId} onClose={() => setDebugNodeId(null)} />}
    {debugSuggestion && (
      <PromptDebugModal
        nodeId={currentNode.id}
        mode="suggestion"
        targetId={suggestionTargetId}
        selection={suggestionSelection}
        onClose={() => setDebugSuggestion(false)}
      />
    )}
    </>
  );
}
