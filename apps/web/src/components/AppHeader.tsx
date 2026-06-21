import { useRef, useState, useCallback } from "react";
import { useTree } from "../hooks/useTree";
import { ConfirmModal } from "./ConfirmModal";

interface Props { onSettings: () => void; onToggleSidebar: () => void; }

export function AppHeader({ onSettings, onToggleSidebar }: Props) {
  const { importBundle, exportBundle, createRootTree, resetTree, store } = useTree();
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const hasTree = (() => { try { store.getRoot(); return true; } catch { return false; } })();

  const handleImport = async () => {
    const input = importRef.current;
    if (!input?.files?.[0]) return;
    try {
      const text = await input.files[0].text();
      await importBundle(JSON.parse(text));
    } catch (e) { alert("Import failed: " + (e as Error).message); }
  };

  const handleExport = async () => {
    const bundle = await exportBundle();
    if (!bundle) return;
    const json = JSON.stringify(bundle, null, 2);

    // Use File System Access API when available, fall back to blob download
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: "asktree-export.json",
          types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        return;
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return; // user cancelled
      }
    }
    // Fallback to classic download
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "asktree-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleLoadFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const title = file.name.replace(/\.(md|markdown|txt)$/i, "");
      if (hasTree) {
        await resetTree();
      }
      await createRootTree(text, title);
    } catch (e) {
      alert("Failed to load file: " + (e as Error).message);
    }
  }, [createRootTree, resetTree, hasTree]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (hasTree) {
      setConfirmAction({
        title: "Replace Current Tree?",
        message: `Loading "${file.name}" will replace the current tree. This cannot be undone.`,
        confirmLabel: "Replace",
        onConfirm: () => {
          setConfirmAction(null);
          handleLoadFile(file);
        },
      });
    } else {
      handleLoadFile(file);
    }
  };

  const handleReset = () => {
    setConfirmAction({
      title: "Sweep Away Current Tree?",
      message: "This will clear the entire tree and all content. This cannot be undone.",
      confirmLabel: "Sweep",
      onConfirm: () => {
        setConfirmAction(null);
        resetTree();
      },
    });
  };

  return (
    <>
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onToggleSidebar}>☰</button>
          <h1>AskTree</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={handleReset} disabled={!hasTree} title="Clear current tree">🧹</button>
          <button onClick={() => fileRef.current?.click()} title="Load markdown file">📂</button>
          <input
            ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        <button onClick={handleExport} disabled={!hasTree}>Export</button>
        <button onClick={() => importRef.current?.click()}>Import</button>
        <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
        <button onClick={onSettings}>Settings</button>
        </div>
      </header>
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
}
