import type { Node, Edge, TreeJSON, ExportBundle } from "./types";
import type { StorageAdapter } from "./storage-adapter";

export class TreeStore {
  private rootNodeId: string | null = null;
  private nodes: Map<string, Node> = new Map();

  constructor(private adapter: StorageAdapter) {}

  async createTree(rootContent: string, title: string): Promise<Node> {
    if (this.rootNodeId !== null) throw new Error("Tree already exists");
    const id = crypto.randomUUID();
    const now = Date.now();
    const node: Node = {
      id,
      title,
      type: "article",
      status: "question",
      parentId: null,
      children: [],
      createdAt: now,
    };
    this.nodes.set(id, node);
    this.rootNodeId = id;
    await this.adapter.writeNodeContent(id, rootContent);
    await this.persist();
    return { ...node };
  }

  getNode(id: string): Node | undefined {
    const node = this.nodes.get(id);
    return node ? { ...node } : undefined;
  }

  getRoot(): Node {
    if (!this.rootNodeId) throw new Error("No tree exists");
    return { ...this.nodes.get(this.rootNodeId)! };
  }

  async reset(): Promise<void> {
    await this.adapter.clear();
    this.nodes.clear();
    this.rootNodeId = null;
  }

  getAllNodes(): Node[] {
    return Array.from(this.nodes.values()).map((n) => ({ ...n }));
  }

  async getContent(id: string): Promise<string> {
    return this.adapter.readNodeContent(id);
  }

  async addChild(
    parentId: string,
    edgeData: Omit<Edge, "id" | "sourceNodeId" | "targetNodeId">,
    content: string
  ): Promise<Node> {
    const parent = this.nodes.get(parentId);
    if (!parent) throw new Error("Parent node not found");

    const childId = crypto.randomUUID();
    const edgeId = crypto.randomUUID();
    const now = Date.now();

    const edge: Edge = {
      id: edgeId,
      sourceNodeId: parentId,
      targetNodeId: childId,
      ...edgeData,
    };

    const child: Node = {
      id: childId,
      title: edgeData.question,
      type: "answer",
      status: "question",
      parentId,
      children: [],
      createdAt: now,
    };

    parent.children = [...parent.children, edge];
    this.nodes.set(parentId, parent);
    this.nodes.set(childId, child);

    await this.adapter.writeNodeContent(childId, content);
    await this.persist();
    return { ...child };
  }

  getPath(id: string): Node[] {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Node not found");

    const path: Node[] = [];
    let current: Node | undefined = node;
    while (current) {
      path.unshift({ ...current });
      if (current.parentId) {
        current = this.nodes.get(current.parentId);
      } else {
        current = undefined;
      }
    }
    return path;
  }

  updateStatus(id: string, status: Node["status"]): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Node not found");
    node.status = status;
    this.persist();
  }

  async removeNode(id: string): Promise<void> {
    if (id === this.rootNodeId) throw new Error("Cannot remove root node");
    const node = this.nodes.get(id);
    if (!node) throw new Error("Node not found");

    const toRemove = this.collectSubtreeIds(id);
    toRemove.push(id);
    for (const removeId of toRemove) {
      await this.adapter.deleteNodeContent(removeId).catch(() => {});
      this.nodes.delete(removeId);
    }

    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter((e) => e.targetNodeId !== id);
        this.nodes.set(node.parentId, parent);
      }
    }
    await this.persist();
  }

  private collectSubtreeIds(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    const ids: string[] = [];
    for (const edge of node.children) {
      ids.push(edge.targetNodeId);
      ids.push(...this.collectSubtreeIds(edge.targetNodeId));
    }
    return ids;
  }

  serialize(): TreeJSON {
    if (!this.rootNodeId) throw new Error("No tree exists");
    const nodesObj: Record<string, Node> = {};
    for (const [id, node] of this.nodes) {
      nodesObj[id] = { ...node };
    }
    const rootNode = this.nodes.get(this.rootNodeId);
    return {
      version: 1,
      rootNodeId: this.rootNodeId,
      nodes: nodesObj,
      createdAt: rootNode?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  }

  static async deserialize(json: TreeJSON, adapter: StorageAdapter): Promise<TreeStore> {
    const store = new TreeStore(adapter);
    for (const [id, node] of Object.entries(json.nodes)) {
      store.nodes.set(id, { ...node });
    }
    store.rootNodeId = json.rootNodeId;
    return store;
  }

  async exportBundle(): Promise<ExportBundle> {
    const tree = this.serialize();
    const contents: Record<string, string> = {};
    for (const id of this.nodes.keys()) {
      try {
        contents[id] = await this.adapter.readNodeContent(id);
      } catch {
        contents[id] = "";
      }
    }
    return { version: 1, tree, contents };
  }

  static async importBundle(bundle: ExportBundle, adapter: StorageAdapter): Promise<TreeStore> {
    const store = await TreeStore.deserialize(bundle.tree, adapter);
    for (const [id, content] of Object.entries(bundle.contents)) {
      await adapter.writeNodeContent(id, content);
    }
    return store;
  }

  private async persist(): Promise<void> {
    await this.adapter.writeTreeMeta(this.serialize());
  }
}
