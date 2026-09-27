import { IndexedDBStorageAdapter } from "@asktree/core";

const APP_PAGE = "index.html";

type PendingClip =
  | { kind: "markdown"; title: string; markdown: string }
  | { kind: "pdf"; title: string; assetId: string }
  | { kind: "error"; message: string };

function isPdf(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

/** Store one clip and open a tab pointed at it, so rapid clicks cannot collide. */
async function stash(clip: PendingClip): Promise<string> {
  const id = crypto.randomUUID();
  const stored = await chrome.storage.session.get(["clips"]);
  const clips = (stored.clips as Record<string, PendingClip> | undefined) ?? {};
  clips[id] = clip;
  await chrome.storage.session.set({ clips });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`${APP_PAGE}?clip=${id}`) });
  return id;
}

export async function clipActiveTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url) return;
  try {
    if (isPdf(tab.url)) {
      const response = await fetch(tab.url); // activeTab grants this origin
      const bytes = await response.arrayBuffer();
      const adapter = new IndexedDBStorageAdapter();
      const assetId = crypto.randomUUID();
      await adapter.writeAsset(assetId, new Blob([bytes], { type: "application/pdf" }));
      const name = decodeURIComponent(new URL(tab.url).pathname.split("/").pop() || "PDF");
      await stash({ kind: "pdf", title: tab.title || name, assetId });
      return;
    }

    const target = { tabId: tab.id };
    // Fails first on pages content scripts cannot touch (chrome://, the Web Store).
    await chrome.scripting.executeScript({ target, files: ["content.js"] });
    const injection = await chrome.scripting.executeScript({
      target,
      func: () => (globalThis as { __asktreeClipResult?: unknown }).__asktreeClipResult,
    });
    const result = injection[0]?.result as
      | { error?: true; title?: string; markdown?: string }
      | undefined;
    if (!result || result.error || !result.markdown) {
      await stash({ kind: "error", message: "Could not read this page's content." });
      return;
    }
    await stash({
      kind: "markdown",
      title: result.title ?? tab.title ?? "Untitled",
      markdown: result.markdown,
    });
  } catch (e) {
    await stash({ kind: "error", message: `Could not clip this page: ${(e as Error).message}` });
  }
}

chrome.action.onClicked.addListener((tab) => {
  void clipActiveTab(tab);
});

// Exposed so the end-to-end test can invoke the same handler the action does.
(globalThis as { __asktreeClipActiveTab?: unknown }).__asktreeClipActiveTab = clipActiveTab;
