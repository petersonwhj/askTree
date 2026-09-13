import { useRef, useState, useCallback } from "react";
import { useTree } from "../hooks/useTree";
import { ConfirmModal } from "./ConfirmModal";
import { saveTextFile } from "../lib/save-file";
import { sanitizeFilename } from "../lib/filename";

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
    let rootTitle = "asktree-tree";
    try { rootTitle = store.getRoot().title; } catch {}
    await saveTextFile(json, {
      suggestedName: `${sanitizeFilename(rootTitle)}.json`,
      description: "JSON",
      mimeType: "application/json",
      extensions: [".json"],
    });
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
          <h1 className="app-brand">
            <svg
              className="app-brand-icon"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M12 11.4 L6.9 15.6 M12 11.4 L17.1 15.6" stroke="#58a6ff" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M12 2 L9.4 7.3 L14.6 7.3 Z" fill="#58a6ff" />
              <circle cx="12" cy="8.9" r="3.3" fill="#58a6ff" />
              <circle cx="6.4" cy="17.6" r="2.6" fill="#58a6ff" />
              <circle cx="17.6" cy="17.6" r="2.6" fill="#79c0ff" />
            </svg>
            <span className="app-brand-text">
              <span className="app-brand-ask">Ask</span><span className="app-brand-tree">Tree</span>
            </span>
          </h1>
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
        <button onClick={handleExport} disabled={!hasTree} title="Export the whole tree as JSON">Export Tree</button>
        <button onClick={() => importRef.current?.click()} title="Import a tree (JSON)">Import Tree</button>
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
