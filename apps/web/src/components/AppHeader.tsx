import { useRef, useCallback } from "react";
import { arrayBufferToBase64, base64ToArrayBuffer } from "@asktree/core";
import { useTree } from "../hooks/useTree";
import { saveTextFile, saveBlob } from "../lib/save-file";
import { sanitizeFilename } from "../lib/filename";
import { openDocumentFile } from "../lib/open-document";
import { bundleToZip, zipToBundle, isZip } from "../lib/zip";
import { chooseExportFormat } from "../lib/export-format";

interface Props { onSettings: () => void; onToggleSidebar: () => void; }

export function AppHeader({ onSettings, onToggleSidebar }: Props) {
  const { activeTreeId, trees, createDocument, importDocument, exportDocument, setLoadNotice } = useTree();
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    const input = importRef.current;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isZip(bytes)) {
        const { bundle, assets } = await zipToBundle(bytes);
        for (const [id, buffer] of Object.entries(assets)) {
          const entry = bundle.assets?.[id];
          if (entry) entry.data = arrayBufferToBase64(buffer);
        }
        await importDocument(bundle);
      } else {
        await importDocument(JSON.parse(new TextDecoder().decode(bytes)));
      }
      input.value = "";
    } catch (e) { alert("Import failed: " + (e as Error).message); }
  };

  const handleExport = async () => {
    if (!activeTreeId) return;
    const bundle = await exportDocument(activeTreeId);
    if (!bundle) return;
    const title = trees.find((t) => t.id === activeTreeId)?.title ?? "asktree-tree";
    const kind = bundle.tree.kind ?? "markdown";
    const assetBytes = Object.values(bundle.assets ?? {}).reduce(
      (n, entry) => n + Math.floor(((entry.data?.length ?? 0) * 3) / 4),
      0,
    );

    if (chooseExportFormat(kind, assetBytes) === "zip") {
      const raw: Record<string, ArrayBuffer> = {};
      const zipBundle = { ...bundle, assets: { ...(bundle.assets ?? {}) } };
      for (const [id, entry] of Object.entries(zipBundle.assets)) {
        if (!entry.data) continue;
        raw[id] = base64ToArrayBuffer(entry.data);
        zipBundle.assets[id] = { mediaType: entry.mediaType, file: `assets/${id}` };
      }
      const zipBytes = bundleToZip(zipBundle, raw);
      await saveBlob(new Blob([zipBytes as unknown as BlobPart], { type: "application/zip" }), {
        suggestedName: `${sanitizeFilename(title)}.zip`,
        description: "Zip",
        mimeType: "application/zip",
        extensions: [".zip"],
      });
      alert("This document is large, so it was exported as a .zip.");
      return;
    }

    await saveTextFile(JSON.stringify(bundle, null, 2), {
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
      setLoadNotice((e as Error).message);
    }
  }, [createDocument, setLoadNotice]);

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
        <input ref={importRef} type="file" accept=".json,.zip" style={{ display: "none" }} onChange={handleImport} />
        <button onClick={onSettings}>Settings</button>
      </div>
    </header>
  );
}
