import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import type { ForestIndex } from "@asktree/core";
import { IndexedDBStorageAdapter } from "../indexeddb-adapter";

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

  it("should clear all data", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("a", "a");
    await adapter.writeForestIndex({ version: 1, activeTreeId: null, trees: [] });
    await adapter.clear();
    expect(await adapter.listNodeIds()).toHaveLength(0);
    expect(await adapter.readForestIndex()).toBeNull();
  });
});
