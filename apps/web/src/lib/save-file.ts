export interface SaveFileOptions {
  suggestedName: string;
  description: string;
  mimeType: string;
  extensions: string[];
}

/**
 * Save text to disk. Prefers the File System Access API (a real "save as"
 * dialog where the user chooses the location). Falls back to a normal
 * browser download when the API is unavailable. A user-cancelled dialog
 * (AbortError) is a no-op.
 */
export async function saveTextFile(contents: string, opts: SaveFileOptions): Promise<void> {
  await saveFile(contents, opts);
}

/** Save binary contents (e.g. a zip) with the same picker-or-download behaviour. */
export async function saveBlob(blob: Blob, opts: SaveFileOptions): Promise<void> {
  await saveFile(blob, opts);
}

async function saveFile(data: string | Blob, opts: SaveFileOptions): Promise<void> {
  const { suggestedName, description, mimeType, extensions } = opts;
  const picker = (window as unknown as {
    showSaveFilePicker?: (options: unknown) => Promise<{
      createWritable: () => Promise<{
        write: (data: string | Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  }).showSaveFilePicker;

  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description, accept: { [mimeType]: extensions } }],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
      // Fall through to the classic download on any other picker error.
    }
  }

  const blob = typeof data === "string" ? new Blob([data], { type: mimeType }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}
