import type { Node, ForestIndex, TreeSummary } from "./types";
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

  async createTree(content: string, title: string): Promise<Node> {
    const treeId = crypto.randomUUID();
    const store = new TreeStore(this.adapter, treeId);
    const root = await store.createTree(content, title);
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

  private async persistIndex(next: {
    trees: string[];
    activeTreeId: string | null;
  }): Promise<void> {
    this.index = { version: 1, ...next };
    await this.adapter.writeForestIndex(this.index);
  }
}
