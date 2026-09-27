import type { TreeJSON, ForestIndex } from "./types";
import type { StorageAdapter } from "./storage-adapter";

const DB_NAME = "asktree";
const DB_VERSION = 2;
const FOREST_KEY = "forest_meta";
const TREE_PREFIX = "tree:";
const CONTENT_STORE = "node_contents";
const META_STORE = "meta";
const ASSET_STORE = "assets";

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
        if (!db.objectStoreNames.contains(ASSET_STORE)) {
          db.createObjectStore(ASSET_STORE);
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

  async readForestIndex(): Promise<ForestIndex | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).get(FOREST_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async writeForestIndex(index: ForestIndex): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put(index, FOREST_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async readTreeMeta(treeId: string): Promise<TreeJSON | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).get(TREE_PREFIX + treeId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async writeTreeMeta(treeId: string, json: TreeJSON): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put(json, TREE_PREFIX + treeId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteTreeMeta(treeId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).delete(TREE_PREFIX + treeId);
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

  async readAsset(id: string): Promise<Blob | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, "readonly");
      const req = tx.objectStore(ASSET_STORE).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async writeAsset(id: string, data: Blob): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, "readwrite");
      tx.objectStore(ASSET_STORE).put(data, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteAsset(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, "readwrite");
      tx.objectStore(ASSET_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CONTENT_STORE, META_STORE, ASSET_STORE], "readwrite");
      tx.objectStore(CONTENT_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.objectStore(ASSET_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
