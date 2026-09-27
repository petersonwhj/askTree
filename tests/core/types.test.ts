import { describe, it, expect } from "vitest";
import type { Node, Edge, TreeJSON } from "@asktree/core";
import { InMemoryStorageAdapter } from "@asktree/core";

describe("types", () => {
  it("stores, reads and deletes assets", async () => {
    const a = new InMemoryStorageAdapter();
    await a.writeAsset("asset-1", new Blob([new Uint8Array([1, 2, 3])]));
    expect((await a.readAsset("asset-1"))?.size).toBe(3);
    await a.deleteAsset("asset-1");
    expect(await a.readAsset("asset-1")).toBeNull();
  });

  it("should construct a valid Node", () => {
    const node: Node = {
      id: "n1", title: "Root", type: "article", status: "question",
      parentId: null, children: [], createdAt: Date.now(),
    };
    expect(node.type).toBe("article");
  });

  it("should construct a valid Edge", () => {
    const edge: Edge = {
      id: "e1", sourceNodeId: "n1", targetNodeId: "n2",
      selectedText: "abc", startPos: 12, endPos: 15, question: "What is abc?",
    };
    expect(edge.selectedText).toBe("abc");
  });
});

describe("InMemoryStorageAdapter", () => {
  it("should read/write content", async () => {
    const a = new InMemoryStorageAdapter();
    await a.writeNodeContent("n1", "# Hello");
    expect(await a.readNodeContent("n1")).toBe("# Hello");
  });

  it("should read/write meta", async () => {
    const a = new InMemoryStorageAdapter();
    const json: TreeJSON = { version: 1, rootNodeId: "r", nodes: {}, createdAt: 0, updatedAt: 0 };
    await a.writeTreeMeta("t1", json);
    expect((await a.readTreeMeta("t1"))?.rootNodeId).toBe("r");
  });

  it("should delete content", async () => {
    const a = new InMemoryStorageAdapter();
    await a.writeNodeContent("n1", "data");
    await a.deleteNodeContent("n1");
    await expect(a.readNodeContent("n1")).rejects.toThrow();
  });

  it("should list ids and clear", async () => {
    const a = new InMemoryStorageAdapter();
    await a.writeNodeContent("a", "a");
    await a.writeNodeContent("b", "b");
    expect(await a.listNodeIds()).toHaveLength(2);
    await a.clear();
    expect(await a.listNodeIds()).toHaveLength(0);
    expect(await a.readTreeMeta("t1")).toBeNull();
  });
});
