import { useState, useEffect } from "react";
import { useTree } from "../hooks/useTree";
import { collectContext, renderPrompt } from "@asktree/core";

interface Props {
  nodeId: string;
  onClose: () => void;
}

export function PromptDebugModal({ nodeId, onClose }: Props) {
  const { store, promptConfig } = useTree();
  const [question, setQuestion] = useState("");
  const [system, setSystem] = useState("");
  const [user, setUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const node = store.getNode(nodeId);
        if (!node) return;

        // The prompt that produced this node was built from the SOURCE node
        // (this node's parent) plus the edge's selection — not from this node's
        // own answer. Rebuild it the same way generation did.
        const parentId = node.parentId;
        const edge = parentId
          ? store.getNode(parentId)?.children.find((e) => e.targetNodeId === nodeId)
          : null;

        const selection = edge?.selectedText
          ? { start: edge.startPos, end: edge.endPos, text: edge.selectedText }
          : null;

        // Determine the question from the node's title (which is the question text)
        const q = edge?.question || node.title;
        setQuestion(q);

        const contextNodeId = parentId ?? nodeId;
        const slices = await collectContext(
          contextNodeId,
          selection,
          store,
          promptConfig,
        );
        const rendered = renderPrompt(slices, q, promptConfig.template);
        setSystem(rendered.system);
        setUser(rendered.user);
      } catch (e) {
        setSystem("Error: " + (e as Error).message);
        setUser("");
      }
      setLoading(false);
    })();
  }, [nodeId, store, promptConfig]);

  const copyPrompt = () => {
    const text = `SYSTEM\n${system}\n\nUSER\n${user}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const preStyle: React.CSSProperties = {
    background: "#0d1117", border: "1px solid #30363d", borderRadius: 6,
    padding: 12, fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap",
    overflow: "auto", color: "#c9d1d9", lineHeight: 1.5, margin: 0,
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div
        className="settings-modal prompt-debug-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 680, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Prompt Debug</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={copyPrompt}
              style={{
                fontSize: 12, background: "#21262d", border: "1px solid #30363d",
                borderRadius: 4, color: copied ? "#3fb950" : "#c9d1d9",
                cursor: "pointer", padding: "3px 12px",
              }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none", border: "1px solid #30363d", borderRadius: 4,
                color: "#8b949e", cursor: "pointer", fontSize: 16, padding: "2px 8px", lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div
          className="prompt-debug-question"
          style={{ fontSize: 12, color: "#8b949e", marginBottom: 16 }}
        >
          {question}
        </div>

        {loading ? (
          <p style={{ color: "#8b949e" }}>Rebuilding prompt...</p>
        ) : (
          <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div
                className="prompt-debug-label"
                style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: "#8b949e", marginBottom: 6 }}
              >
                SYSTEM
              </div>
              <pre className="prompt-debug-system" style={{ ...preStyle, maxHeight: 200 }}>
                {system || "(empty)"}
              </pre>
            </div>

            <div>
              <div
                className="prompt-debug-label"
                style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: "#8b949e", marginBottom: 6 }}
              >
                USER
              </div>
              <pre className="prompt-debug-user" style={{ ...preStyle, maxHeight: 300 }}>
                {user || "(empty)"}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
