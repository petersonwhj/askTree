export interface ChromeLike {
  runtime?: {
    id?: string;
    onMessage?: {
      addListener(listener: (message: unknown) => void): void;
      removeListener(listener: (message: unknown) => void): void;
    };
  };
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
