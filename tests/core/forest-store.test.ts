import { describe, it, expect, beforeEach } from "vitest";
import { ForestStore, InMemoryStorageAdapter } from "@asktree/core";

describe("ForestStore", () => {
  let adapter: InMemoryStorageAdapter;
  let forest: ForestStore;

  beforeEach(async () => {
    adapter = new InMemoryStorageAdapter();
    forest = await ForestStore.load(adapter);
  });

  it("starts empty", () => {
    expect(forest.listTrees()).toEqual([]);
    expect(forest.getActiveTreeId()).toBeNull();
    expect(forest.getActiveTree()).toBeNull();
  });

  it("creates a document, activates it, and lists it", async () => {
    const root = await forest.createTree("# A", "Alpha");
    expect(forest.getActiveTreeId()).toBe(forest.listTrees()[0].id);
    expect(forest.getActiveTree()!.getRoot().id).toBe(root.id);
    expect(forest.listTrees()).toEqual([expect.objectContaining({ title: "Alpha" })]);
  });

  it("keeps two documents independent", async () => {
    await forest.createTree("a", "Alpha");
    const betaRoot = await forest.createTree("b", "Beta");
    const alphaId = forest.listTrees()[0].id;
    const betaId = forest.listTrees()[1].id;

    expect(forest.listTrees().map((t) => t.title)).toEqual(["Alpha", "Beta"]);
    expect(forest.getActiveTreeId()).toBe(betaId);
    expect(forest.getTree(betaId).getRoot().id).toBe(betaRoot.id);
    expect(forest.getTree(alphaId).getRoot().title).toBe("Alpha");
  });

  it("persists the active document across load", async () => {
    await forest.createTree("a", "Alpha");
    await forest.createTree("b", "Beta");
    await forest.setActiveTree(forest.listTrees()[0].id);

    const reloaded = await ForestStore.load(adapter);
    expect(reloaded.getActiveTreeId()).toBe(reloaded.listTrees()[0].id);
    expect(reloaded.listTrees().map((t) => t.title)).toEqual(["Alpha", "Beta"]);
  });

  it("renames a document", async () => {
    await forest.createTree("a", "Alpha");
    await forest.renameTree(forest.listTrees()[0].id, "Renamed");
    expect(forest.listTrees()[0].title).toBe("Renamed");

    const reloaded = await ForestStore.load(adapter);
    expect(reloaded.listTrees()[0].title).toBe("Renamed");
  });

  it("deletes a document with its node contents", async () => {
    const root = await forest.createTree("a", "Alpha");
    await forest.createTree("b", "Beta");
    const alphaId = forest.listTrees()[0].id;

    await forest.deleteTree(alphaId);

    expect(forest.listTrees().map((t) => t.title)).toEqual(["Beta"]);
    expect(forest.getActiveTreeId()).toBe(forest.listTrees()[0].id);
    await expect(adapter.readNodeContent(root.id)).rejects.toThrow();
    expect(await adapter.readTreeMeta(alphaId)).toBeNull();
  });

  it("returns to no active document after deleting the last one", async () => {
    await forest.createTree("a", "Alpha");
    await forest.deleteTree(forest.listTrees()[0].id);
    expect(forest.listTrees()).toEqual([]);
    expect(forest.getActiveTreeId()).toBeNull();
    expect(forest.getActiveTree()).toBeNull();
  });

  it("skips index entries whose tree data is missing", async () => {
    await forest.createTree("a", "Alpha");
    await adapter.writeForestIndex({ version: 1, activeTreeId: "ghost", trees: ["ghost"] });
    const reloaded = await ForestStore.load(adapter);
    expect(reloaded.listTrees()).toEqual([]);
    expect(reloaded.getActiveTree()).toBeNull();
  });
});

describe("ForestStore import / export", () => {
  it("imports a bundle as a new independent document with fresh ids", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    const root = await forest.createTree("root md", "Root");
    const child = await forest.getActiveTree()!.addChild(
      root.id,
      { selectedText: "x", startPos: 0, endPos: 1, question: "q?" },
      "child md",
    );
    const bundle = await forest.exportTree(forest.listTrees()[0].id);
    expect(bundle.contents[root.id]).toBe("root md");

    const newTreeId = await forest.importBundle(bundle);

    expect(forest.listTrees().map((t) => t.title)).toEqual(["Root", "Root"]);
    expect(forest.getActiveTreeId()).toBe(newTreeId);
    const imported = forest.getTree(newTreeId);
    const importedRoot = imported.getRoot();
    expect(importedRoot.id).not.toBe(root.id);
    const importedChild = imported.getNode(importedRoot.children[0].targetNodeId)!;
    expect(importedChild.id).not.toBe(child.id);
    expect(await imported.getContent(importedRoot.id)).toBe("root md");
    expect(await imported.getContent(importedChild.id)).toBe("child md");
  });

  it("keeps the original untouched and survives a reload", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("original", "Doc");
    const bundle = await forest.exportTree(forest.listTrees()[0].id);
    await forest.importBundle(bundle);

    const reloaded = await ForestStore.load(adapter);
    expect(reloaded.listTrees()).toHaveLength(2);
    const [a, b] = reloaded.listTrees().map((t) => t.id);
    expect(await reloaded.getTree(a).getContent(reloaded.getTree(a).getRoot().id)).toBe("original");
    expect(await reloaded.getTree(b).getContent(reloaded.getTree(b).getRoot().id)).toBe("original");
  });

  it("round-trips reading positions through import", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Doc");
    const source = forest.getActiveTree()!;
    source.setReadingPosition(source.getRoot().id, 0.5);
    const bundle = await forest.exportTree(forest.listTrees()[0].id);

    const newTreeId = await forest.importBundle(bundle);
    const importedRoot = forest.getTree(newTreeId).getRoot();
    expect(forest.getTree(newTreeId).getReadingPosition(importedRoot.id)).toBe(0.5);
  });

  it("rejects a malformed bundle without changing the forest", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Doc");

    await expect(
      forest.importBundle({
        version: 1,
        tree: { version: 1, rootNodeId: "missing", nodes: {}, createdAt: 0, updatedAt: 0 },
        contents: {},
      } as never),
    ).rejects.toThrow("Invalid tree bundle");
    expect(forest.listTrees()).toHaveLength(1);
  });
});

describe("ForestStore assets", () => {
  it("stores an asset with a new document and deletes it with the tree", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    const assetId = await forest
      .createTree("", "Paper", "pdf", new Uint8Array([5, 5]).buffer)
      .then(() => forest.getActiveTree()!.assetId!);
    expect(new Uint8Array((await adapter.readAsset(assetId))!)).toEqual(new Uint8Array([5, 5]));

    await forest.deleteTree(forest.listTrees()[0].id);
    expect(await adapter.readAsset(assetId)).toBeNull();
  });

  it("round-trips an asset through export and import with a new id", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("", "Paper", "pdf", new Uint8Array([7, 7, 7]).buffer);
    const oldId = forest.getActiveTree()!.assetId!;

    const bundle = await forest.exportTree(forest.listTrees()[0].id);
    expect(bundle.assets?.[oldId]?.data).toBeTruthy();

    const newTreeId = await forest.importBundle(bundle);
    const imported = forest.getTree(newTreeId);
    expect(imported.assetId).toBeTruthy();
    expect(imported.assetId).not.toBe(oldId);
    expect(new Uint8Array((await imported.getAsset())!)).toEqual(new Uint8Array([7, 7, 7]));
  });
});

describe("ForestStore kind", () => {
  it("defaults new documents to markdown", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Alpha");
    expect(forest.listTrees()[0].kind).toBe("markdown");
  });

  it("records a docx document", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Alpha", "docx");
    expect(forest.listTrees()[0].kind).toBe("docx");
    expect(forest.getActiveTree()!.kind).toBe("docx");
  });

  it("preserves kind through export and import", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Alpha", "docx");
    const bundle = await forest.exportTree(forest.listTrees()[0].id);
    expect(bundle.tree.kind).toBe("docx");

    const newId = await forest.importBundle(bundle);
    expect(forest.listTrees().find((t) => t.id === newId)?.kind).toBe("docx");
  });
});
