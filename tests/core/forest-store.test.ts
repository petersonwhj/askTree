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
