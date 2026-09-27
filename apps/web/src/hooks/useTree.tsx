import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import {
  ForestStore,
  LLMService,
  DEFAULT_PROMPT_CONFIG,
  type Node,
  type Edge,
  type ExportBundle,
  type PromptConfig,
  type TreeStore,
  type TreeSummary,
  type DocumentKind,
  IndexedDBStorageAdapter,
} from "@asktree/core";

interface TreeContextValue {
  store: TreeStore | null;
  llm: LLMService;
  activePath: Node[];
  trees: TreeSummary[];
  activeTreeId: string | null;
  setActiveTree: (id: string | null) => Promise<void>;
  createDocument: (content: string, title: string, kind?: DocumentKind, asset?: Blob) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  renameDocument: (id: string, title: string) => Promise<void>;
  exportDocument: (id: string) => Promise<ExportBundle | null>;
  importDocument: (bundle: ExportBundle) => Promise<void>;
  navigateTo: (nodeId: string) => void;
  navigateUp: () => void;
  focusNode: (nodeId: string) => void;
  addChildNode: (parentId: string, edge: Omit<Edge, "id" | "sourceNodeId" | "targetNodeId">, answerContent: string) => Promise<Node>;
  updateStatus: (nodeId: string, status: Node["status"]) => void;
  removeNode: (nodeId: string) => Promise<void>;
  selectedText: { text: string; start: number; end: number; nodeId: string } | null;
  setSelectedText: (s: TreeContextValue["selectedText"]) => void;
  promptConfig: PromptConfig;
  setPromptConfig: (c: PromptConfig) => void;
  showExplored: boolean;
  setShowExplored: (show: boolean) => void;
  /** Bumped on forest or tree mutations so derived views can recompute. */
  treeVersion: number;
  isLoading: boolean;
}

const TreeContext = createContext<TreeContextValue | null>(null);

export function TreeProvider({ children }: { children: React.ReactNode }) {
  const adapterRef = useRef(new IndexedDBStorageAdapter());
  const forestRef = useRef<ForestStore | null>(null);
  const llmRef = useRef(new LLMService());
  const [store, setStore] = useState<TreeStore | null>(null);
  const [trees, setTrees] = useState<TreeSummary[]>([]);
  const [activeTreeId, setActiveTreeId] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<Node[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedText, setSelectedText] = useState<TreeContextValue["selectedText"]>(null);
  const [promptConfig, setPromptConfig] = useState<PromptConfig>(() => {
    try {
      const saved = localStorage.getItem("asktree_prompt_config");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_PROMPT_CONFIG;
  });

  useEffect(() => {
    localStorage.setItem("asktree_prompt_config", JSON.stringify(promptConfig));
  }, [promptConfig]);

  const [treeVersion, setTreeVersion] = useState(0);

  const [showExplored, setShowExplored] = useState<boolean>(() => {
    try {
      return localStorage.getItem("asktree_show_explored") !== "false";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    localStorage.setItem("asktree_show_explored", String(showExplored));
  }, [showExplored]);

  const refresh = useCallback((forest: ForestStore) => {
    const active = forest.getActiveTree();
    setTrees(forest.listTrees());
    setActiveTreeId(forest.getActiveTreeId());
    setStore(active);
    setActivePath(active ? [active.getRoot()] : []);
    setTreeVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const forest = await ForestStore.load(adapterRef.current);
        forestRef.current = forest;
        refresh(forest);
      } catch {}
      setIsLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("asktree_llm_config");
      if (saved) {
        const { config, provider } = JSON.parse(saved);
        if (config) llmRef.current.configure(config, provider || "openai");
      }
    } catch {}
  }, []);

  const navigateTo = useCallback((nodeId: string) => {
    const active = forestRef.current?.getActiveTree();
    if (active) setActivePath(active.getPath(nodeId));
  }, []);

  const focusNode = useCallback((nodeId: string) => {
    const active = forestRef.current?.getActiveTree();
    const node = active?.getNode(nodeId);
    if (node) setActivePath([node]);
  }, []);

  const navigateUp = useCallback(() => {
    if (activePath.length > 1) setActivePath((p) => p.slice(0, -1));
  }, [activePath]);

  const setActiveTree = useCallback(async (id: string | null) => {
    const forest = forestRef.current;
    if (!forest) return;
    await forest.setActiveTree(id);
    setSelectedText(null);
    refresh(forest);
  }, [refresh]);

  const createDocument = useCallback(async (
    content: string,
    title: string,
    kind?: DocumentKind,
    asset?: Blob,
  ) => {
    const forest = forestRef.current;
    if (!forest) return;
    await forest.createTree(content, title, kind, asset);
    setSelectedText(null);
    refresh(forest);
  }, [refresh]);

  const deleteDocument = useCallback(async (id: string) => {
    const forest = forestRef.current;
    if (!forest) return;
    await forest.deleteTree(id);
    setSelectedText(null);
    refresh(forest);
  }, [refresh]);

  const renameDocument = useCallback(async (id: string, title: string) => {
    const forest = forestRef.current;
    if (!forest) return;
    await forest.renameTree(id, title);
    refresh(forest);
  }, [refresh]);

  const exportDocument = useCallback(async (id: string) => {
    const forest = forestRef.current;
    if (!forest) return null;
    try {
      return await forest.exportTree(id);
    } catch {
      return null;
    }
  }, []);

  const importDocument = useCallback(async (bundle: ExportBundle) => {
    const forest = forestRef.current;
    if (!forest) return;
    await forest.importBundle(bundle);
    setSelectedText(null);
    refresh(forest);
  }, [refresh]);

  const addChildNode = useCallback(async (
    parentId: string,
    edge: Omit<Edge, "id" | "sourceNodeId" | "targetNodeId">,
    answerContent: string,
  ) => {
    const active = forestRef.current?.getActiveTree();
    if (!active) throw new Error("No active document");
    const child = await active.addChild(parentId, edge, answerContent);
    setActivePath(active.getPath(child.id));
    setTreeVersion((v) => v + 1);
    return child;
  }, []);

  const updateStatus = useCallback((nodeId: string, status: Node["status"]) => {
    const active = forestRef.current?.getActiveTree();
    if (!active) return;
    active.updateStatus(nodeId, status);
    setActivePath((prev) => prev.map((n) => (n.id === nodeId ? { ...n, status } : n)));
  }, []);

  const removeNode = useCallback(async (nodeId: string) => {
    const active = forestRef.current?.getActiveTree();
    if (!active) return;
    await active.removeNode(nodeId);
    setActivePath((prev) => {
      const idx = prev.findIndex((n) => n.id === nodeId);
      if (idx === -1) return prev;
      const trimmed = prev.slice(0, idx);
      return trimmed.length > 0 ? trimmed : [];
    });
    setTreeVersion((v) => v + 1);
  }, []);

  return (
    <TreeContext.Provider value={{
      store, llm: llmRef.current, activePath, trees, activeTreeId, setActiveTree,
      createDocument, deleteDocument, renameDocument, exportDocument, importDocument,
      navigateTo, navigateUp, focusNode, addChildNode, updateStatus, removeNode,
      selectedText, setSelectedText, promptConfig, setPromptConfig, isLoading,
      showExplored, setShowExplored, treeVersion,
    }}>
      {children}
    </TreeContext.Provider>
  );
}

export function useTree() {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error("useTree must be used within TreeProvider");
  return ctx;
}
