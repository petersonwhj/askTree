import type { ChromeLike } from "./chrome-like";

export type PendingClip =
  | { kind: "markdown"; title: string; markdown: string }
  | { kind: "pdf"; title: string; assetId: string }
  | { kind: "error"; message: string };

export function clipIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("clip");
}

/** Read and clear the pending clip with this id. */
export async function takePendingClip(id: string, chrome: ChromeLike): Promise<PendingClip | null> {
  const store = chrome.storage!.session;
  const stored = await store.get(["clips"]);
  const clips = (stored.clips as Record<string, PendingClip> | undefined) ?? {};
  const clip = clips[id] ?? null;
  if (clip) {
    delete clips[id];
    await store.set({ clips });
  }
  return clip;
}
