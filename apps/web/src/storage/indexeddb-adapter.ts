import type { StorageAdapter, TreeJSON } from "@asktree/core";

const DB_NAME = "asktree";
const DB_VERSION = 1;
const META_KEY = "tree_meta";
const CONTENT_STORE = "node_contents";
const META_STORE = "meta";

export class IndexedDBStorageAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CONTENT_STORE)) {
          db.createObjectStore(CONTENT_STORE);
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async readNodeContent(nodeId: string): Promise<string> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readonly");
      const req = tx.objectStore(CONTENT_STORE).get(nodeId);
      req.onsuccess = () => {
        if (req.result === undefined) reject(new Error(`Node content not found: ${nodeId}`));
        else resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async writeNodeContent(nodeId: string, content: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readwrite");
      tx.objectStore(CONTENT_STORE).put(content, nodeId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteNodeContent(nodeId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readwrite");
      tx.objectStore(CONTENT_STORE).delete(nodeId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async readTreeMeta(): Promise<TreeJSON | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).get(META_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async writeTreeMeta(json: TreeJSON): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put(json, META_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async listNodeIds(): Promise<string[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readonly");
      const req = tx.objectStore(CONTENT_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CONTENT_STORE, META_STORE], "readwrite");
      tx.objectStore(CONTENT_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
