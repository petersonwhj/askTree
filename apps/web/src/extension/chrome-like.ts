export interface ChromeLike {
  runtime?: { id?: string };
  storage?: {
    session: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
}

/** The extension APIs, or null when the app runs as a normal web page. */
export function getChrome(): ChromeLike | null {
  const maybe = (globalThis as { chrome?: ChromeLike }).chrome;
  return maybe?.runtime?.id && maybe.storage ? maybe : null;
}
