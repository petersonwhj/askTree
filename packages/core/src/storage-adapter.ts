import type { TreeJSON, ForestIndex } from "./types";

export interface StorageAdapter {
  readNodeContent(nodeId: string): Promise<string>;
  writeNodeContent(nodeId: string, content: string): Promise<void>;
  deleteNodeContent(nodeId: string): Promise<void>;
  listNodeIds(): Promise<string[]>;
  readForestIndex(): Promise<ForestIndex | null>;
  writeForestIndex(index: ForestIndex): Promise<void>;
  readTreeMeta(treeId: string): Promise<TreeJSON | null>;
  writeTreeMeta(treeId: string, json: TreeJSON): Promise<void>;
  deleteTreeMeta(treeId: string): Promise<void>;
  readAsset(id: string): Promise<ArrayBuffer | null>;
  writeAsset(id: string, data: ArrayBuffer): Promise<void>;
  deleteAsset(id: string): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private contents = new Map<string, string>();
  private metas = new Map<string, TreeJSON>();
  private forest: ForestIndex | null = null;
  private assets = new Map<string, ArrayBuffer>();

  async readNodeContent(nodeId: string): Promise<string> {
    const c = this.contents.get(nodeId);
    if (c === undefined) throw new Error(`Node content not found: ${nodeId}`);
    return c;
  }

  async writeNodeContent(nodeId: string, content: string): Promise<void> {
    this.contents.set(nodeId, content);
  }

  async deleteNodeContent(nodeId: string): Promise<void> {
    this.contents.delete(nodeId);
  }

  async listNodeIds(): Promise<string[]> {
    return Array.from(this.contents.keys());
  }

  async readForestIndex(): Promise<ForestIndex | null> {
    return this.forest ? { ...this.forest, trees: [...this.forest.trees] } : null;
  }

  async writeForestIndex(index: ForestIndex): Promise<void> {
    this.forest = { ...index, trees: [...index.trees] };
  }

  async readTreeMeta(treeId: string): Promise<TreeJSON | null> {
    return this.metas.get(treeId) ?? null;
  }

  async writeTreeMeta(treeId: string, json: TreeJSON): Promise<void> {
    this.metas.set(treeId, json);
  }

  async deleteTreeMeta(treeId: string): Promise<void> {
    this.metas.delete(treeId);
  }

  async readAsset(id: string): Promise<ArrayBuffer | null> {
    return this.assets.get(id) ?? null;
  }

  async writeAsset(id: string, data: ArrayBuffer): Promise<void> {
    this.assets.set(id, data);
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets.delete(id);
  }

  async clear(): Promise<void> {
    this.contents.clear();
    this.metas.clear();
    this.forest = null;
    this.assets.clear();
  }
}
