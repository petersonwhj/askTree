import type { Node, TreeJSON, ExportBundle, ForestIndex, TreeSummary, DocumentKind } from "./types";
import { base64ToArrayBuffer } from "./base64";
import type { StorageAdapter } from "./storage-adapter";
import { TreeStore } from "./tree-store";

export class ForestStore {
  private index: ForestIndex;
  private trees: Map<string, TreeStore> = new Map();

  private constructor(
    private adapter: StorageAdapter,
    index: ForestIndex,
  ) {
    this.index = index;
  }

  static async load(adapter: StorageAdapter): Promise<ForestStore> {
    const index =
      (await adapter.readForestIndex()) ?? { version: 1, activeTreeId: null, trees: [] };
    const forest = new ForestStore(adapter, index);
    for (const treeId of index.trees) {
      const json = await adapter.readTreeMeta(treeId);
      if (!json) continue; // dangling index entry — skip it
      forest.trees.set(treeId, await TreeStore.deserialize(json, adapter, treeId));
    }
    return forest;
  }

  listTrees(): TreeSummary[] {
    const summaries: TreeSummary[] = [];
    for (const id of this.index.trees) {
      const store = this.trees.get(id);
      if (!store) continue;
      try {
        summaries.push({
          id,
          title: store.getRoot().title,
          updatedAt: store.serialize().updatedAt,
          kind: store.kind,
        });
      } catch {
        // tree has no root — skip
      }
    }
    return summaries;
  }

  getActiveTreeId(): string | null {
    return this.index.activeTreeId;
  }

  getActiveTree(): TreeStore | null {
    const id = this.index.activeTreeId;
    return id ? this.trees.get(id) ?? null : null;
  }

  getTree(id: string): TreeStore {
    const store = this.trees.get(id);
    if (!store) throw new Error(`Tree not found: ${id}`);
    return store;
  }

  async setActiveTree(id: string | null): Promise<void> {
    if (id !== null && !this.trees.has(id)) throw new Error(`Tree not found: ${id}`);
    await this.persistIndex({ trees: this.index.trees, activeTreeId: id });
  }

  async createTree(
    content: string,
    title: string,
    kind: DocumentKind = "markdown",
    asset?: Blob,
  ): Promise<Node> {
    const treeId = crypto.randomUUID();
    const store = new TreeStore(this.adapter, treeId, kind);
    const root = await store.createTree(content, title);
    if (asset) await store.setAsset(asset);
    this.trees.set(treeId, store);
    await this.persistIndex({
      trees: [...this.index.trees, treeId],
      activeTreeId: treeId,
    });
    return root;
  }

  async renameTree(id: string, title: string): Promise<void> {
    await this.getTree(id).renameRoot(title);
  }

  async deleteTree(id: string): Promise<void> {
    const store = this.trees.get(id);
    if (!store) return;
    const assetId = store.assetId;
    if (assetId) await this.adapter.deleteAsset(assetId).catch(() => {});
    for (const node of store.getAllNodes()) {
      await this.adapter.deleteNodeContent(node.id).catch(() => {});
    }
    await this.adapter.deleteTreeMeta(id);
    this.trees.delete(id);
    const remaining = this.index.trees.filter((t) => t !== id);
    const activeTreeId =
      this.index.activeTreeId === id ? remaining[0] ?? null : this.index.activeTreeId;
    await this.persistIndex({ trees: remaining, activeTreeId });
  }

  async exportTree(id: string): Promise<ExportBundle> {
    return this.getTree(id).exportBundle();
  }

  async importBundle(bundle: ExportBundle): Promise<string> {
    const nodes = bundle?.tree?.nodes;
    if (!nodes || !bundle.tree.rootNodeId || !nodes[bundle.tree.rootNodeId]) {
      throw new Error("Invalid tree bundle");
    }

    const idMap = new Map<string, string>();
    for (const oldId of Object.keys(nodes)) idMap.set(oldId, crypto.randomUUID());

    const remap = (oldId: string): string => {
      const mapped = idMap.get(oldId);
      if (!mapped) throw new Error("Invalid tree bundle");
      return mapped;
    };

    const remappedNodes: Record<string, Node> = {};
    for (const [oldId, node] of Object.entries(nodes)) {
      remappedNodes[remap(oldId)] = {
        ...node,
        id: remap(oldId),
        parentId: node.parentId ? remap(node.parentId) : null,
        children: node.children.map((edge) => ({
          ...edge,
          id: crypto.randomUUID(),
          sourceNodeId: remap(edge.sourceNodeId),
          targetNodeId: remap(edge.targetNodeId),
        })),
      };
    }

    const readingPositions: Record<string, number> = {};
    for (const [oldId, fraction] of Object.entries(bundle.tree.readingPositions ?? {})) {
      if (idMap.has(oldId)) readingPositions[idMap.get(oldId)!] = fraction;
    }

    const json: TreeJSON = {
      version: 1,
      kind: bundle.tree.kind ?? "markdown",
      rootNodeId: remap(bundle.tree.rootNodeId),
      nodes: remappedNodes,
      createdAt: bundle.tree.createdAt,
      updatedAt: Date.now(),
      ...(Object.keys(readingPositions).length > 0 ? { readingPositions } : {}),
    };

    const assetMap = new Map<string, string>();
    for (const [oldId, entry] of Object.entries(bundle.assets ?? {})) {
      if (!entry.data) continue;
      const newId = crypto.randomUUID();
      await this.adapter.writeAsset(newId, new Blob([base64ToArrayBuffer(entry.data)]));
      assetMap.set(oldId, newId);
    }
    if (bundle.tree.assetId && assetMap.has(bundle.tree.assetId)) {
      json.assetId = assetMap.get(bundle.tree.assetId);
    }

    const treeId = crypto.randomUUID();
    await this.adapter.writeTreeMeta(treeId, json);
    for (const [oldId, content] of Object.entries(bundle.contents ?? {})) {
      if (idMap.has(oldId)) await this.adapter.writeNodeContent(idMap.get(oldId)!, content);
    }

    this.trees.set(treeId, await TreeStore.deserialize(json, this.adapter, treeId));
    await this.persistIndex({
      trees: [...this.index.trees, treeId],
      activeTreeId: treeId,
    });
    return treeId;
  }

  private async persistIndex(next: {
    trees: string[];
    activeTreeId: string | null;
  }): Promise<void> {
    this.index = { version: 1, ...next };
    await this.adapter.writeForestIndex(this.index);
  }
}
