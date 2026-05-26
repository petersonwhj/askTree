import { useState, useRef, useEffect } from "react";
import { useTree } from "../hooks/useTree";
import { MarkdownPane } from "./MarkdownPane";
import { QuestionInputBar } from "./QuestionInputBar";
import { collectContext, renderPrompt } from "@asktree/core";

export function DualPanel() {
  const {
    store, llm, activePath, selectedText, setSelectedText,
    addChildNode, promptConfig, createRootTree,
  } = useTree();

  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newArticleRef = useRef<HTMLTextAreaElement>(null);
  const [newTitle, setNewTitle] = useState("");

  const currentNode = activePath[activePath.length - 1];
  const [currentNodeContent, setCurrentNodeContent] = useState<string | null>(null);

  useEffect(() => {
    if (currentNode) {
      store.getContent(currentNode.id).then(setCurrentNodeContent).catch(() => setCurrentNodeContent(""));
    } else {
      setCurrentNodeContent(null);
    }
  }, [currentNode, store]);

  if (!currentNode) {
    return (
      <div className="dual-panel">
        <div className="empty-state">
          <h2>Welcome to AskTree</h2>
          <p>Paste or type a Markdown article to start learning.</p>
          <input
            type="text" placeholder="Article title..." value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="empty-state-input"
          />
          <textarea
            ref={newArticleRef}
            placeholder="# Your Markdown article here..."
            className="empty-state-textarea"
          />
          <button onClick={async () => {
            const content = newArticleRef.current?.value;
            if (!content) return;
            await createRootTree(content, newTitle || "Untitled");
          }}>Start Learning</button>
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
          <select
            value={currentNode.status}
            onChange={(e) => { store.updateStatus(currentNode.id, e.target.value as "resolved" | "question"); }}
            className="status-select"
          >
            <option value="question">question</option>
            <option value="resolved">resolved</option>
          </select>
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
