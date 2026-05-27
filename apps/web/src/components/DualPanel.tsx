import { useState, useRef, useEffect, useCallback } from "react";
import { useTree } from "../hooks/useTree";
import { MarkdownPane } from "./MarkdownPane";
import { QuestionInputBar } from "./QuestionInputBar";
import { collectContext, renderPrompt } from "@asktree/core";

export function DualPanel() {
  const {
    store, llm, activePath, selectedText, setSelectedText,
    addChildNode, promptConfig, createRootTree, resetTree,
  } = useTree();

  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newArticleRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const currentNode = activePath[activePath.length - 1];
  const [currentNodeContent, setCurrentNodeContent] = useState<string | null>(null);

  useEffect(() => {
    if (currentNode) {
      store.getContent(currentNode.id).then(setCurrentNodeContent).catch(() => setCurrentNodeContent(""));
    } else {
      setCurrentNodeContent(null);
    }
  }, [currentNode, store]);

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
    setIsAsking(true);
    try {
      const slices = await collectContext(currentNode.id, "", store, promptConfig);
      renderPrompt(slices, question, promptConfig.template);
      const answer = await llm.ask({ question, contextSlices: slices });

      await addChildNode(currentNode.id, {
        selectedText: selectedText?.text || "",
        startPos: selectedText?.start || 0,
        endPos: selectedText?.end || 0,
        question,
      }, answer);

      setSelectedText(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAsking(false);
    }
  };

  const handleTextSelected = (text: string, start: number, end: number) => {
    if (!currentNode) return;
    setSelectedText({ text, start, end, nodeId: currentNode.id });
  };

  return (
    <div className="dual-panel">
      <div className="panel">
        <div className="panel-header">
          <span className="node-type">
            {currentNode.type === "article" ? "📄" : "❓"} {currentNode.title.slice(0, 50)}
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
            <button
              onClick={() => fileInputRef.current?.click()}
              className="load-file-btn"
            >
              Load File
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
        {currentNodeContent !== null && (
          <MarkdownPane
            content={currentNodeContent}
            onTextSelected={handleTextSelected}
          />
        )}
      </div>

      <div className="panel">
        <div className="empty-state" style={{ flex: 1 }}>
          <p>Select text in the article and click the floating button to ask a question.</p>
          <p style={{ fontSize: 12, color: "#484f58" }}>Or use the input bar below for free-form questions.</p>
        </div>

        {error && (
          <div className="error-banner">
            Error: {error}
            <button onClick={() => setError(null)} className="error-dismiss">Dismiss</button>
          </div>
        )}

        <QuestionInputBar
          contextText={selectedText?.text || null}
          onSend={handleSendQuestion}
          isLoading={isAsking}
        />
      </div>
    </div>
  );
}
