import { describe, it, expect, beforeEach } from "vitest";
import { TreeStore, InMemoryStorageAdapter } from "@asktree/core";

describe("TreeStore", () => {
  let adapter: InMemoryStorageAdapter;
  let store: TreeStore;

  beforeEach(() => {
    adapter = new InMemoryStorageAdapter();
    store = new TreeStore(adapter);
  });

  describe("createTree", () => {
    it("should create a root node and persist content", async () => {
      const root = await store.createTree("# Hello\n\nWorld", "Root Article");
      expect(root.type).toBe("article");
      expect(root.parentId).toBeNull();
      expect(await store.getContent(root.id)).toBe("# Hello\n\nWorld");
    });

    it("should throw if tree already exists", async () => {
      await store.createTree("content", "title");
      await expect(store.createTree("more", "another")).rejects.toThrow("Tree already exists");
    });
  });

  describe("getNode", () => {
    it("should return a node by id", async () => {
      const root = await store.createTree("content", "Root");
      expect(store.getNode(root.id)).toBeDefined();
    });

    it("should return undefined for unknown id", () => {
      expect(store.getNode("nonexistent")).toBeUndefined();
    });
  });

  describe("getRoot", () => {
    it("should return the root", async () => {
      const root = await store.createTree("content", "Root");
      expect(store.getRoot().id).toBe(root.id);
    });

    it("should throw if no tree", () => {
      expect(() => store.getRoot()).toThrow("No tree exists");
    });
  });

  describe("addChild", () => {
    it("should add a child node with an edge", async () => {
      const root = await store.createTree("# Math", "Math Article");
      const child = await store.addChild(root.id, {
        selectedText: "group", startPos: 10, endPos: 15, question: "What is a group?",
      }, "A group is a set with an operation...");

      expect(child.type).toBe("answer");
      expect(child.parentId).toBe(root.id);

      const rootRefreshed = store.getNode(root.id)!;
      expect(rootRefreshed.children).toHaveLength(1);
      expect(rootRefreshed.children[0].selectedText).toBe("group");
      expect(await store.getContent(child.id)).toBe("A group is a set with an operation...");
    });

    it("should throw if parent does not exist", async () => {
      await store.createTree("content", "Root");
      await expect(store.addChild("fakeid", {
        selectedText: "x", startPos: 0, endPos: 1, question: "q",
      }, "answer")).rejects.toThrow("Parent node not found");
    });
  });

  describe("getPath", () => {
    it("should return the path from root to grandchild", async () => {
      const root = await store.createTree("# Title", "Root");
      const child = await store.addChild(root.id, {
        selectedText: "x", startPos: 0, endPos: 1, question: "q?",
      }, "Answer 1");
      const grandchild = await store.addChild(child.id, {
        selectedText: "y", startPos: 0, endPos: 1, question: "q2?",
      }, "Answer 2");

      const path = store.getPath(grandchild.id);
      expect(path).toHaveLength(3);
      expect(path[0].id).toBe(root.id);
      expect(path[1].id).toBe(child.id);
      expect(path[2].id).toBe(grandchild.id);
    });
  });

  describe("updateStatus", () => {
    it("should update node status", async () => {
      const root = await store.createTree("c", "Root");
      store.updateStatus(root.id, "resolved");
      expect(store.getNode(root.id)!.status).toBe("resolved");
    });
  });

  describe("removeNode", () => {
    it("should cascade delete a subtree", async () => {
      const root = await store.createTree("r", "Root");
      const child = await store.addChild(root.id, { selectedText: "a", startPos: 0, endPos: 1, question: "q1" }, "c");
      const grandchild = await store.addChild(child.id, { selectedText: "b", startPos: 0, endPos: 1, question: "q2" }, "gc");
      await store.removeNode(child.id);
      expect(store.getNode(child.id)).toBeUndefined();
      expect(store.getNode(grandchild.id)).toBeUndefined();
      expect(store.getNode(root.id)!.children).toHaveLength(0);
    });

    it("should throw when removing root", async () => {
      const root = await store.createTree("c", "Root");
      await expect(store.removeNode(root.id)).rejects.toThrow("Cannot remove root node");
    });

    it("should delete content from storage", async () => {
      const root = await store.createTree("r", "Root");
      const child = await store.addChild(root.id, { selectedText: "x", startPos: 0, endPos: 1, question: "q" }, "md");
      await store.removeNode(child.id);
      await expect(store.getContent(child.id)).rejects.toThrow();
    });
  });

  describe("deserialize", () => {
    it("should restore a tree from JSON", async () => {
      const root = await store.createTree("r", "Root");
      const child = await store.addChild(root.id, { selectedText: "x", startPos: 0, endPos: 1, question: "q?" }, "child");
      const json = store.serialize();
      const adapter2 = new InMemoryStorageAdapter();
      const store2 = await TreeStore.deserialize(json, adapter2);
      expect(store2.getRoot().title).toBe("Root");
      expect(store2.getNode(child.id)!.title).toBe("q?");
    });
  });

  describe("export / import", () => {
    it("should export and import a bundle", async () => {
      const root = await store.createTree("root md", "Root");
      const child = await store.addChild(root.id, { selectedText: "x", startPos: 0, endPos: 1, question: "q?" }, "child md");
      const bundle = await store.exportBundle();
      expect(bundle.version).toBe(1);
      expect(bundle.contents[root.id]).toBe("root md");

      const adapter2 = new InMemoryStorageAdapter();
      const store2 = await TreeStore.importBundle(bundle, adapter2);
      expect(store2.getRoot().title).toBe("Root");
      expect(store2.getAllNodes()).toHaveLength(2);
      expect(await store2.getContent(child.id)).toBe("child md");
    });
  });
});
