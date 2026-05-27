import { useState, useRef, useEffect, useCallback } from "react";
import { useTree } from "../hooks/useTree";
import { MarkdownPane } from "./MarkdownPane";
import { QuestionInputBar } from "./QuestionInputBar";
import { collectContext, renderPrompt } from "@asktree/core";
import type { Node } from "@asktree/core";

export function DualPanel() {
  const {
    store, llm, activePath, selectedText, setSelectedText,
    addChildNode, promptConfig, createRootTree, resetTree, navigateTo, focusNode, navigateUp,
  } = useTree();

  const [error, setError] = useState<string | null>(null);
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  const [splitRatio, setSplitRatio] = useState(50);
  const newArticleRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

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

  const handleFileLoad = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const title = file.name.replace(/\.(md|markdown|txt)$/i, "");
      if (currentNode) {
        await resetTree();
      }
      await createRootTree(text, title);
      setNewContent("");
      setNewTitle("");
    } catch (e) {
      setError("Failed to read file: " + (e as Error).message);
    }
  }, [createRootTree, resetTree, currentNode]);

  if (!currentNode) {
    const handleStart = async () => {
      const content = newArticleRef.current?.value || newContent;
      if (!content) return;
      await createRootTree(content, newTitle || "Untitled");
      setNewContent("");
      setNewTitle("");
    };

    return (
      <div className="dual-panel">
        <div
          className={`empty-state ${isDragOver ? "drag-over" : ""}`}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFileLoad(file);
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
        >
          <h2>Welcome to AskTree</h2>
          <p>Paste an article, load a file, or drag & drop a Markdown file to start learning.</p>

          <div className="empty-state-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileLoad(file);
              }}
            />
            <button onClick={() => fileInputRef.current?.click()}>Load .md File</button>
          </div>

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
          <button onClick={handleStart}>Start Learning</button>

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
    const questionedNodeId = selectedText?.nodeId || currentNode.id;
    const askedText = selectedText?.text || "";
    const askedStart = selectedText?.start || 0;
    const askedEnd = selectedText?.end || 0;
    setSelectedText(null);

    const placeholder = `> **Question:** ${question}\n\n` +
      (askedText ? `> About: "${askedText.slice(0, 80)}"\n\n` : "") +
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
        const slices = await collectContext(questionedNodeId, "", store, promptConfig);
        renderPrompt(slices, question, promptConfig.template);
        const answer = await llm.ask({ question, contextSlices: slices });
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

  return (
    <div className="dual-panel">
      <div className="panel" style={{ width: `${splitRatio}%`, flex: "none" }}>
        <div className="panel-header">
          <span className="node-type">
            {parentNode.type === "article" ? "📄" : "❓"} {parentNode.title.slice(0, 50)}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileLoad(file);
              }}
            />
            <button onClick={() => fileInputRef.current?.click()} className="load-file-btn">Load File</button>
            <select
              value={parentNode.status}
              onChange={(e) => { store.updateStatus(parentNode.id, e.target.value as "resolved" | "question"); }}
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
            highlight={
              currentNode.id !== parentNode.id
                ? (() => {
                    const edge = parentNode.children.find(e => e.targetNodeId === currentNode.id);
                    return edge && edge.startPos >= 0 ? { start: edge.startPos, end: edge.endPos } : null;
                  })()
                : null
            }
            onTextSelected={(text, start, end) => handleTextSelected(text, start, end, parentNode.id)}
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
                ❓ {currentNode.title.slice(0, 50)}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => navigateUp()}
                  className="close-panel-btn"
                  title="Close answer"
                >
                  ✕
                </button>
                <select
                  value={currentNode.status}
                  onChange={(e) => { store.updateStatus(currentNode.id, e.target.value as "resolved" | "question"); }}
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
          onSend={handleSendQuestion}
          isLoading={false}
        />
      </div>
    </div>
  );
}
