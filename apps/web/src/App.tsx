import { useState } from "react";
import { TreeProvider, useTree } from "./hooks/useTree";
import { AppHeader } from "./components/AppHeader";
import { TreeSidebar } from "./components/TreeSidebar";
import { BreadcrumbBar } from "./components/BreadcrumbBar";
import { DualPanel } from "./components/DualPanel";
import { SettingsModal } from "./components/SettingsModal";
import "./App.css";

function AppContent() {
  const { isLoading } = useTree();
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
        {sidebarOpen && <TreeSidebar />}
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
    <TreeProvider>
      <AppContent />
    </TreeProvider>
  );
}
