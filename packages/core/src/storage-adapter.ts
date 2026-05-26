import type { TreeJSON } from "./types";

export interface StorageAdapter {
  readNodeContent(nodeId: string): Promise<string>;
  writeNodeContent(nodeId: string, content: string): Promise<void>;
  deleteNodeContent(nodeId: string): Promise<void>;
  readTreeMeta(): Promise<TreeJSON | null>;
  writeTreeMeta(json: TreeJSON): Promise<void>;
  listNodeIds(): Promise<string[]>;
  clear(): Promise<void>;
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private contents = new Map<string, string>();
  private meta: TreeJSON | null = null;

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

  async readTreeMeta(): Promise<TreeJSON | null> {
    return this.meta;
  }

  async writeTreeMeta(json: TreeJSON): Promise<void> {
    this.meta = json;
  }

  async listNodeIds(): Promise<string[]> {
    return Array.from(this.contents.keys());
  }

  async clear(): Promise<void> {
    this.contents.clear();
    this.meta = null;
  }
}
