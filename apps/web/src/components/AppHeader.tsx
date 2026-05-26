import { useRef } from "react";
import { useTree } from "../hooks/useTree";

interface Props { onSettings: () => void; onToggleSidebar: () => void; }

export function AppHeader({ onSettings, onToggleSidebar }: Props) {
  const { importBundle, exportBundle } = useTree();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    const input = fileRef.current;
    if (!input?.files?.[0]) return;
    try {
      const text = await input.files[0].text();
      await importBundle(JSON.parse(text));
    } catch (e) { alert("Import failed: " + (e as Error).message); }
  };

  const handleExport = async () => {
    const bundle = await exportBundle();
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "asktree-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <header className="app-header">
      <button onClick={onToggleSidebar}>☰</button>
      <h1>AskTree</h1>
      <button onClick={handleExport}>Export</button>
      <button onClick={() => fileRef.current?.click()}>Import</button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
      <button onClick={onSettings}>Settings</button>
    </header>
  );
}
