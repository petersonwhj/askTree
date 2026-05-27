import { useCallback } from "react";
import { useTree } from "../hooks/useTree";
import type { Node } from "@asktree/core";

export function TreeSidebar({ style }: { style?: React.CSSProperties }) {
  const { store, activePath, focusNode, resetTree } = useTree();
  const currentId = activePath[activePath.length - 1]?.id;
  const root = (() => { try { return store.getRoot(); } catch { return null; } })();

  const handleDelete = useCallback((node: Node, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const isRoot = root?.id === node.id;
    const msg = isRoot
      ? "Delete the entire tree? This cannot be undone."
      : `Delete "${node.title.slice(0, 40)}" and all its sub-nodes?`;
    if (!window.confirm(msg)) return;

    if (isRoot) {
      resetTree();
    } else {
      store.removeNode(node.id).catch(() => {});
    }
  }, [root, resetTree, store]);

  const renderNode = (node: Node, depth: number): React.ReactNode => {
    const isActive = node.id === currentId;
    const statusColors = { resolved: "#3fb950", question: "#e2b714" } as const;

    return (
      <div key={node.id}>
        <div
          className={`tree-node ${isActive ? "active" : ""}`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => focusNode(node.id)}
          onContextMenu={(e) => handleDelete(node, e)}
        >
          <span className="status-dot" style={{ backgroundColor: statusColors[node.status] }} />
          {node.title.slice(0, 30)}
        </div>
        {node.children.map((edge) => {
          const child = store.getNode(edge.targetNodeId);
          return child ? renderNode(child, depth + 1) : null;
        })}
      </div>
    );
  };

  if (!root) return null;

  return (
    <aside className="tree-sidebar" style={style}>
      <h3>Tree Map</h3>
      {renderNode(root, 0)}
    </aside>
  );
}
