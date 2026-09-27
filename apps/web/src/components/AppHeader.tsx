import { useRef, useCallback } from "react";
import { useTree } from "../hooks/useTree";
import { saveTextFile } from "../lib/save-file";
import { sanitizeFilename } from "../lib/filename";
import { openDocumentFile } from "../lib/open-document";

interface Props { onSettings: () => void; onToggleSidebar: () => void; }

export function AppHeader({ onSettings, onToggleSidebar }: Props) {
  const { activeTreeId, trees, createDocument, importDocument, exportDocument } = useTree();
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    const input = importRef.current;
    if (!input?.files?.[0]) return;
    try {
      const text = await input.files[0].text();
      await importDocument(JSON.parse(text));
      input.value = "";
    } catch (e) { alert("Import failed: " + (e as Error).message); }
  };

  const handleExport = async () => {
    if (!activeTreeId) return;
    const bundle = await exportDocument(activeTreeId);
    if (!bundle) return;
    const json = JSON.stringify(bundle, null, 2);
    const title = trees.find((t) => t.id === activeTreeId)?.title ?? "asktree-tree";
    await saveTextFile(json, {
      suggestedName: `${sanitizeFilename(title)}.json`,
      description: "JSON",
      mimeType: "application/json",
      extensions: [".json"],
    });
  };

  const handleLoadFile = useCallback(async (file: File) => {
    try {
      await openDocumentFile(file, createDocument);
    } catch (e) {
      alert("Failed to load file: " + (e as Error).message);
    }
  }, [createDocument]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void handleLoadFile(file);
    e.target.value = "";
  };

  return (
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
        <button onClick={() => fileRef.current?.click()} title="Open markdown file as a new document">📂</button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,.docx,.pdf"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        <button onClick={handleExport} disabled={activeTreeId === null} title="Export the active document as JSON">Export Tree</button>
        <button onClick={() => importRef.current?.click()} title="Import a document (JSON); appends to the forest">Import Tree</button>
        <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
        <button onClick={onSettings}>Settings</button>
      </div>
    </header>
  );
}
