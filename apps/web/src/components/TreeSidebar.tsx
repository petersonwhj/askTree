import { useCallback, useState } from "react";
import { useTree } from "../hooks/useTree";
import { ConfirmModal } from "./ConfirmModal";
import { saveTextFile } from "../lib/save-file";
import { sanitizeFilename } from "../lib/filename";
import type { Node } from "@asktree/core";

export function TreeSidebar({ style }: { style?: React.CSSProperties }) {
  const {
    store, trees, activeTreeId, setActiveTree, activePath,
    focusNode, removeNode, renameDocument, exportDocument, deleteDocument,
  } = useTree();
  const currentId = activePath[activePath.length - 1]?.id;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const statusColors = { resolved: "#3fb950", question: "#e2b714" } as const;

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const startRename = useCallback((id: string, title: string) => {
    setRenamingId(id);
    setRenameDraft(title);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameDraft.trim()) renameDocument(renamingId, renameDraft.trim());
    setRenamingId(null);
  }, [renamingId, renameDraft, renameDocument]);

  const handleExport = useCallback(async (id: string, title: string) => {
    const bundle = await exportDocument(id);
    if (!bundle) return;
    await saveTextFile(JSON.stringify(bundle, null, 2), {
      suggestedName: `${sanitizeFilename(title)}.json`,
      description: "JSON",
      mimeType: "application/json",
      extensions: [".json"],
    });
  }, [exportDocument]);

  const handleDeleteNode = useCallback((node: Node, rootId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.id === rootId) {
      setConfirmDeleteId(rootId);
      return;
    }
    if (!window.confirm(`Delete "${node.title.slice(0, 40)}" and all its sub-nodes?`)) return;
    removeNode(node.id);
  }, [removeNode]);

  const renderNode = (node: Node, rootId: string, depth: number): React.ReactNode => (
    <div key={node.id}>
      <div
        className={`tree-node ${node.id === currentId ? "active" : ""}`}
        style={{ paddingLeft: `${20 + depth * 12}px` }}
        onClick={() => focusNode(node.id)}
        onContextMenu={(e) => handleDeleteNode(node, rootId, e)}
      >
        <span className="status-dot" style={{ backgroundColor: statusColors[node.status] }} />
        <span title={node.title}>{node.title}</span>
      </div>
      {node.children.map((edge) => {
        const child = store?.getNode(edge.targetNodeId);
        return child ? renderNode(child, rootId, depth + 1) : null;
      })}
    </div>
  );

  if (trees.length === 0) return null;

  const confirmTitle = trees.find((t) => t.id === confirmDeleteId)?.title ?? "";

  return (
    <aside className="tree-sidebar" style={style}>
      <div className="forest-header">
        <h3>Documents</h3>
        <button aria-label="New document" title="New document" onClick={() => setActiveTree(null)}>＋</button>
      </div>

      {trees.map((tree) => {
        const isActive = tree.id === activeTreeId;
        const isCollapsed = collapsed.has(tree.id);
        const activeStore = isActive ? store : null;
        const root = activeStore ? (() => { try { return activeStore.getRoot(); } catch { return null; } })() : null;

        return (
          <div key={tree.id} className="forest-doc">
            <div
              data-testid={`doc-row-${tree.id}`}
              className={`doc-row ${isActive ? "active" : ""}`}
              onClick={() => setActiveTree(tree.id)}
            >
              <button
                className="doc-chevron"
                aria-label={`Toggle ${tree.title}`}
                onClick={(e) => { e.stopPropagation(); toggle(tree.id); }}
              >
                {isCollapsed ? "▸" : "▾"}
              </button>

              {renamingId === tree.id ? (
                <input
                  autoFocus
                  className="doc-rename-input"
                  value={renameDraft}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <span className="doc-title" title={tree.title}>{tree.title}</span>
              )}

              <span className="doc-actions">
                <button aria-label={`Rename ${tree.title}`} title="Rename" onClick={(e) => { e.stopPropagation(); startRename(tree.id, tree.title); }}>✎</button>
                <button aria-label={`Export ${tree.title}`} title="Export" onClick={(e) => { e.stopPropagation(); void handleExport(tree.id, tree.title); }}>⭳</button>
                <button aria-label={`Delete ${tree.title}`} title="Delete" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(tree.id); }}>🗑</button>
              </span>
            </div>

            {!isCollapsed && isActive && root && (
              <div className="forest-tree">
                {root.children.map((edge) => {
                  const child = store?.getNode(edge.targetNodeId);
                  return child ? renderNode(child, tree.id, 0) : null;
                })}
              </div>
            )}
          </div>
        );
      })}

      {confirmDeleteId && (
        <ConfirmModal
          title="Delete this document?"
          message={`"${confirmTitle}" and all of its questions will be deleted. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { void deleteDocument(confirmDeleteId); setConfirmDeleteId(null); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </aside>
  );
}
