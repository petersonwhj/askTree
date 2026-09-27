import { IndexedDBStorageAdapter } from "@asktree/core";
import { pdfFetchProblem } from "./url";

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

async function writeClip(id: string, clip: PendingClip): Promise<void> {
  const stored = await chrome.storage.session.get(["clips"]);
  const clips = (stored.clips as Record<string, PendingClip> | undefined) ?? {};
  clips[id] = clip;
  await chrome.storage.session.set({ clips });
}

/** Store one clip and open a tab pointed at it, so rapid clicks cannot collide. */
async function stash(clip: PendingClip): Promise<string> {
  const id = crypto.randomUUID();
  await writeClip(id, clip);
  await chrome.tabs.create({ url: chrome.runtime.getURL(`${APP_PAGE}?clip=${id}`) });
  return id;
}

/**
 * The open AskTree app tab, if any. Found via getContexts because reading
 * tab.url needs the "tabs" permission, which we deliberately do not request.
 */
async function findAppTab(): Promise<{ tabId: number; windowId: number } | undefined> {
  if (typeof chrome.runtime.getContexts !== "function") return undefined;
  const appUrl = chrome.runtime.getURL(APP_PAGE);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["TAB" as chrome.runtime.ContextType],
  });
  const context = contexts.find((c) => c.documentUrl?.startsWith(appUrl));
  if (!context || context.tabId < 0) return undefined;
  return { tabId: context.tabId, windowId: context.windowId };
}

/**
 * Bring the AskTree tab forward and show a notice there, opening it only when
 * none is open. Reusing the tab keeps a failed clip from piling up blank tabs.
 */
async function showNotice(message: string): Promise<void> {
  const existing = await findAppTab();
  if (!existing) {
    await stash({ kind: "error", message });
    return;
  }
  await chrome.tabs.update(existing.tabId, { active: true });
  if (existing.windowId >= 0) {
    await chrome.windows.update(existing.windowId, { focused: true });
  }
  try {
    await chrome.tabs.sendMessage(existing.tabId, { type: "asktree-notice", message });
    return;
  } catch {
    // The tab was still loading and not listening yet — reload it with the clip.
  }
  const id = crypto.randomUUID();
  await writeClip(id, { kind: "error", message });
  await chrome.tabs.update(existing.tabId, {
    url: chrome.runtime.getURL(`${APP_PAGE}?clip=${id}`),
  });
}

export async function clipActiveTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url) return;
  try {
    if (isPdf(tab.url)) {
      const problem = pdfFetchProblem(tab.url);
      if (problem) {
        await showNotice(problem);
        return;
      }
      const response = await fetch(tab.url); // activeTab grants this origin
      if (!response.ok) {
        await showNotice(`Could not fetch this PDF (HTTP ${response.status}).`);
        return;
      }
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
      await showNotice("Could not read this page's content.");
      return;
    }
    await stash({
      kind: "markdown",
      title: result.title ?? tab.title ?? "Untitled",
      markdown: result.markdown,
    });
  } catch (e) {
    const detail = (e as Error).message;
    const hint = /failed to fetch/i.test(detail)
      ? " Download the file, then open it in AskTree with the 📂 button."
      : "";
    await showNotice(`Could not clip this page: ${detail}.${hint}`);
  }
}

chrome.action.onClicked.addListener((tab) => {
  void clipActiveTab(tab);
});

// Exposed so the end-to-end test can invoke the same handler the action does.
(globalThis as { __asktreeClipActiveTab?: unknown }).__asktreeClipActiveTab = clipActiveTab;
