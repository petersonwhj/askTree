import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { IndexedDBStorageAdapter } from "../indexeddb-adapter";

describe("IndexedDBStorageAdapter", () => {
  it("should write and read node content", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("n1", "# Hello World");
    expect(await adapter.readNodeContent("n1")).toBe("# Hello World");
  });

  it("should write and read tree meta", async () => {
    const adapter = new IndexedDBStorageAdapter();
    const json = { version: 1, rootNodeId: "r", nodes: {}, createdAt: 0, updatedAt: 0 };
    await adapter.writeTreeMeta(json);
    expect((await adapter.readTreeMeta())?.rootNodeId).toBe("r");
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

  it("should clear all data", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("a", "a");
    await adapter.writeTreeMeta({ version: 1, rootNodeId: "r", nodes: {}, createdAt: 0, updatedAt: 0 });
    await adapter.clear();
    expect(await adapter.listNodeIds()).toHaveLength(0);
    expect(await adapter.readTreeMeta()).toBeNull();
  });
});
