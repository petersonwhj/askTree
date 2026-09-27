import { useEffect } from "react";
import { IndexedDBStorageAdapter } from "@asktree/core";
import { useTree } from "../hooks/useTree";
import { getChrome } from "./chrome-like";
import { clipIdFromSearch, takePendingClip } from "./pending-clip";

/** Consumes a pending clip when the app is opened by the extension. No-op in the web app. */
export function ClipBridge() {
  const { createDocument, setLoadNotice, isLoading } = useTree();
  useNoticeListener(setLoadNotice);

  useEffect(() => {
    const chrome = getChrome();
    if (!chrome || isLoading) return; // wait until the forest has loaded
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
  }, [createDocument, setLoadNotice, isLoading]);

  return null;
}

/** Shows a notice the extension pushes into an already-open app tab. */
export function useNoticeListener(setLoadNotice: (message: string) => void) {
  useEffect(() => {
    const chrome = getChrome();
    const onMessage = chrome?.runtime?.onMessage;
    if (!onMessage) return;
    const listener = (message: unknown) => {
      const notice = message as { type?: string; message?: string } | undefined;
      if (notice?.type === "asktree-notice" && typeof notice.message === "string") {
        setLoadNotice(notice.message);
      }
    };
    onMessage.addListener(listener);
    return () => onMessage.removeListener(listener);
  }, [setLoadNotice]);
}
