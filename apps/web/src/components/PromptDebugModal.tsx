import { useState, useEffect } from "react";
import { useTree } from "../hooks/useTree";
import { collectContext, renderPrompt } from "@asktree/core";

interface Props {
  nodeId: string;
  onClose: () => void;
}

export function PromptDebugModal({ nodeId, onClose }: Props) {
  const { store, promptConfig } = useTree();
  const [system, setSystem] = useState("");
  const [user, setUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"system" | "user" | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const node = store.getNode(nodeId);
        if (!node) return;

        // Rebuild the prompt from the node's stored edge data
        const parentId = node.parentId;
        const edge = parentId
          ? store.getNode(parentId)?.children.find((e) => e.targetNodeId === nodeId)
          : null;

        const selection = edge?.selectedText
          ? { start: edge.startPos, end: edge.endPos, text: edge.selectedText }
          : null;

        // Determine the question from the node's title (which is the question text)
        const question = edge?.question || node.title;

        const slices = await collectContext(
          nodeId,
          selection,
          store,
          promptConfig,
        );
        const rendered = renderPrompt(slices, question, promptConfig.template);
        setSystem(rendered.system);
        setUser(rendered.user);
      } catch (e) {
        setSystem("Error: " + (e as Error).message);
        setUser("");
      }
      setLoading(false);
    })();
  }, [nodeId, store, promptConfig]);

  const copyToClipboard = (label: "system" | "user", text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxHeight: "85vh" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>
            Prompt Debug{" "}
            <span style={{ fontSize: 12, color: "#8b949e", fontWeight: "normal" }}>
              — exact prompt sent to LLM
            </span>
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "1px solid #30363d", borderRadius: 4,
              color: "#8b949e", cursor: "pointer", fontSize: 16, padding: "2px 8px", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p style={{ color: "#8b949e" }}>Rebuilding prompt...</p>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <label style={{ fontSize: 12, color: "#8b949e", margin: 0 }}>System</label>
                <button
                  onClick={() => copyToClipboard("system", system)}
                  style={{
                    fontSize: 11, background: "#21262d", border: "1px solid #30363d",
                    borderRadius: 4, color: copied === "system" ? "#3fb950" : "#8b949e",
                    cursor: "pointer", padding: "2px 8px",
                  }}
                >
                  {copied === "system" ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <pre style={{
                background: "#0d1117", border: "1px solid #30363d", borderRadius: 6,
                padding: 12, fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap",
                maxHeight: 200, overflow: "auto", color: "#c9d1d9", lineHeight: 1.5,
              }}>
                {system || "(empty)"}
              </pre>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <label style={{ fontSize: 12, color: "#8b949e", margin: 0 }}>User</label>
                <button
                  onClick={() => copyToClipboard("user", user)}
                  style={{
                    fontSize: 11, background: "#21262d", border: "1px solid #30363d",
                    borderRadius: 4, color: copied === "user" ? "#3fb950" : "#8b949e",
                    cursor: "pointer", padding: "2px 8px",
                  }}
                >
                  {copied === "user" ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <pre style={{
                background: "#0d1117", border: "1px solid #30363d", borderRadius: 6,
                padding: 12, fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap",
                maxHeight: 300, overflow: "auto", color: "#c9d1d9", lineHeight: 1.5,
              }}>
                {user || "(empty)"}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
