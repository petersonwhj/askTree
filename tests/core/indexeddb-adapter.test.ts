import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import type { ForestIndex } from "@asktree/core";
import { IndexedDBStorageAdapter } from "@asktree/core";

// Each test gets a pristine in-memory database, so a test can open v1 and then
// exercise the adapter's v2 upgrade.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("IndexedDBStorageAdapter", () => {
  it("should write and read node content", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("n1", "# Hello World");
    expect(await adapter.readNodeContent("n1")).toBe("# Hello World");
  });

  it("should write and read the forest index", async () => {
    const adapter = new IndexedDBStorageAdapter();
    const index: ForestIndex = { version: 1, activeTreeId: "t1", trees: ["t1"] };
    await adapter.writeForestIndex(index);
    expect(await adapter.readForestIndex()).toEqual(index);
  });

  it("should write, read and delete per-tree meta", async () => {
    const adapter = new IndexedDBStorageAdapter();
    const json = { version: 1, rootNodeId: "r", nodes: {}, createdAt: 0, updatedAt: 0 };
    await adapter.writeTreeMeta("t1", json);
    expect((await adapter.readTreeMeta("t1"))?.rootNodeId).toBe("r");
    expect(await adapter.readTreeMeta("t2")).toBeNull();
    await adapter.deleteTreeMeta("t1");
    expect(await adapter.readTreeMeta("t1")).toBeNull();
  });

  it("should delete node content", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("n1", "data");
    await adapter.deleteNodeContent("n1");
    await expect(adapter.readNodeContent("n1")).rejects.toThrow();
  });

  it("should list node ids", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("a", "a");
    await adapter.writeNodeContent("b", "b");
    const ids = await adapter.listNodeIds();
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("should write, read and delete an asset", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeAsset("asset-1", new Blob([new Uint8Array([9, 8, 7])]));
    // fake-indexeddb cannot structured-clone a Blob, so only presence is asserted here;
    // the in-memory adapter test covers the bytes.
    expect(await adapter.readAsset("asset-1")).not.toBeNull();
    await adapter.deleteAsset("asset-1");
    expect(await adapter.readAsset("asset-1")).toBeNull();
  });

  it("adds the assets store without dropping existing data", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("asktree", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("node_contents")) db.createObjectStore("node_contents");
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("node_contents", "readwrite");
        tx.objectStore("node_contents").put("old content", "n1");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const adapter = new IndexedDBStorageAdapter();
    expect(await adapter.readNodeContent("n1")).toBe("old content");
    await adapter.writeAsset("a1", new Blob([new Uint8Array([1])]));
    expect(await adapter.readAsset("a1")).not.toBeNull();
  });

  it("should clear all data", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("a", "a");
    await adapter.writeForestIndex({ version: 1, activeTreeId: null, trees: [] });
    await adapter.clear();
    expect(await adapter.listNodeIds()).toHaveLength(0);
    expect(await adapter.readForestIndex()).toBeNull();
  });
});
