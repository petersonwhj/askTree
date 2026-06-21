import { useTree } from "../hooks/useTree";

export function BreadcrumbBar() {
  const { activePath, navigateTo } = useTree();
  if (activePath.length === 0) return null;

  return (
    <div className="breadcrumb-bar">
      <span style={{ color: "#484f58", marginRight: 8 }}>Path:</span>
      {activePath.map((node, i) => (
        <span key={node.id}>
          {i > 0 && <span className="separator"> → </span>}
          <span
            className={`crumb ${i === activePath.length - 1 ? "active" : ""}`}
            onClick={() => navigateTo(node.id)}
            title={node.title}
          >
            {node.type === "article" ? "📖 " : "❓ "}
            {node.title}
          </span>
        </span>
      ))}
      <span style={{ marginLeft: "auto", color: "#484f58", fontSize: 11 }}>
        depth: {activePath.length - 1}
      </span>
    </div>
  );
}
