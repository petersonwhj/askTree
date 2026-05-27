import { useState, Component } from "react";
import { TreeProvider, useTree } from "./hooks/useTree";
import { AppHeader } from "./components/AppHeader";
import { TreeSidebar } from "./components/TreeSidebar";
import { BreadcrumbBar } from "./components/BreadcrumbBar";
import { DualPanel } from "./components/DualPanel";
import { SettingsModal } from "./components/SettingsModal";
import "./App.css";

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "#f85149", fontFamily: "monospace" }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 16 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#8b949e", marginTop: 8, maxHeight: 300, overflow: "auto" }}>{this.state.error.stack}</pre>
          <button
            style={{ marginTop: 16, padding: "6px 16px", background: "#21262d", border: "1px solid #30363d", borderRadius: 6, color: "#c9d1d9", cursor: "pointer" }}
            onClick={() => this.setState({ error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { isLoading } = useTree();
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(220);

  const handleSidebarDividerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(400, Math.max(120, startW + (ev.clientX - startX)));
      setSidebarWidth(w);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#8b949e" }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="app">
      <AppHeader onSettings={() => setShowSettings(true)} onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <div className="app-body">
        {sidebarOpen && (
          <>
            <TreeSidebar style={{ width: sidebarWidth, flex: "none" }} />
            <div className="sidebar-divider" onMouseDown={handleSidebarDividerDown} />
          </>
        )}
        <div className="app-main">
          <BreadcrumbBar />
          <DualPanel />
        </div>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <TreeProvider>
        <AppContent />
      </TreeProvider>
    </ErrorBoundary>
  );
}
