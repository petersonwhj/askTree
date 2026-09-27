import { useEffect } from "react";
import { IndexedDBStorageAdapter } from "@asktree/core";
import { useTree } from "../hooks/useTree";
import { getChrome } from "./chrome-like";
import { clipIdFromSearch, takePendingClip } from "./pending-clip";

/** Consumes a pending clip when the app is opened by the extension. No-op in the web app. */
export function ClipBridge() {
  const { createDocument, setLoadNotice } = useTree();

  useEffect(() => {
    const chrome = getChrome();
    if (!chrome) return;
    const id = clipIdFromSearch(window.location.search);
    if (!id) return;

    void (async () => {
      const clip = await takePendingClip(id, chrome);
      if (!clip) return;
      if (clip.kind === "markdown") {
        await createDocument(clip.markdown, clip.title);
      } else if (clip.kind === "pdf") {
        const adapter = new IndexedDBStorageAdapter();
        const blob = await adapter.readAsset(clip.assetId);
        if (blob) {
          await createDocument("", clip.title, "pdf", blob);
          await adapter.deleteAsset(clip.assetId).catch(() => {});
        } else {
          setLoadNotice("The clipped PDF could not be read.");
        }
      } else {
        setLoadNotice(clip.message);
      }
    })();
  }, [createDocument, setLoadNotice]);

  return null;
}
