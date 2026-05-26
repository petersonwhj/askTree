import { useTree } from "../hooks/useTree";
import type { Node } from "@asktree/core";

export function TreeSidebar() {
  const { store, activePath, navigateTo } = useTree();
  const currentId = activePath[activePath.length - 1]?.id;

  const renderNode = (node: Node, depth: number): React.ReactNode => {
    const isActive = node.id === currentId;
    const statusColors = { resolved: "#3fb950", question: "#e2b714" } as const;

    return (
      <div key={node.id}>
        <div
          className={`tree-node ${isActive ? "active" : ""}`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => navigateTo(node.id)}
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

  const root = store.getRoot?.();
  if (!root) return null;

  return (
    <aside className="tree-sidebar">
      <h3>Tree Map</h3>
      {renderNode(root, 0)}
    </aside>
  );
}
