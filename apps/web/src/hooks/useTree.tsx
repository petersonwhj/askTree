import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { TreeStore, LLMService, DEFAULT_PROMPT_CONFIG, type Node, type Edge, type ExportBundle, type PromptConfig } from "@asktree/core";
import { IndexedDBStorageAdapter } from "../storage/indexeddb-adapter";

interface TreeContextValue {
  store: TreeStore;
  llm: LLMService;
  activePath: Node[];
  navigateTo: (nodeId: string) => void;
  navigateUp: () => void;
  focusNode: (nodeId: string) => void;
  createRootTree: (content: string, title: string) => Promise<void>;
  resetTree: () => Promise<void>;
  addChildNode: (parentId: string, edge: Omit<Edge, "id" | "sourceNodeId" | "targetNodeId">, answerContent: string) => Promise<Node>;
  updateStatus: (nodeId: string, status: Node["status"]) => void;
  removeNode: (nodeId: string) => Promise<void>;
  selectedText: { text: string; start: number; end: number; nodeId: string } | null;
  setSelectedText: (s: TreeContextValue["selectedText"]) => void;
  importBundle: (bundle: ExportBundle) => Promise<void>;
  exportBundle: () => Promise<ExportBundle | null>;
  promptConfig: PromptConfig;
  setPromptConfig: (c: PromptConfig) => void;
  isLoading: boolean;
}

const TreeContext = createContext<TreeContextValue | null>(null);

export function TreeProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef(new TreeStore(new IndexedDBStorageAdapter()));
  const llmRef = useRef(new LLMService());
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

  useEffect(() => {
    (async () => {
      try {
        const adapter = new IndexedDBStorageAdapter();
        const meta = await adapter.readTreeMeta();
        if (meta) {
          const store = await TreeStore.deserialize(meta, adapter);
          storeRef.current = store;
          setActivePath([store.getRoot()]);
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

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
    setActivePath(storeRef.current.getPath(nodeId));
  }, []);

  const focusNode = useCallback((nodeId: string) => {
    const node = storeRef.current.getNode(nodeId);
    if (node) setActivePath([node]);
  }, []);

  const navigateUp = useCallback(() => {
    if (activePath.length > 1) setActivePath((p) => p.slice(0, -1));
  }, [activePath]);

  const createRootTree = useCallback(async (content: string, title: string) => {
    const root = await storeRef.current.createTree(content, title);
    setActivePath([root]);
  }, []);

  const resetTree = useCallback(async () => {
    await storeRef.current.reset();
    setActivePath([]);
    setSelectedText(null);
  }, []);

  const addChildNode = useCallback(async (
    parentId: string,
    edge: Omit<Edge, "id" | "sourceNodeId" | "targetNodeId">,
    answerContent: string,
  ) => {
    const child = await storeRef.current.addChild(parentId, edge, answerContent);
    setActivePath(storeRef.current.getPath(child.id));
    return child;
  }, []);

  const updateStatus = useCallback((nodeId: string, status: Node["status"]) => {
    storeRef.current.updateStatus(nodeId, status);
    // Patch the matching node in activePath so React re-renders with new status
    setActivePath((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, status } : n))
    );
  }, []);

  const removeNode = useCallback(async (nodeId: string) => {
    await storeRef.current.removeNode(nodeId);
    // If the deleted node is in the active path, navigate up to its parent
    setActivePath((prev) => {
      const idx = prev.findIndex((n) => n.id === nodeId);
      if (idx === -1) return prev; // not in path, no change
      // Trim path to the node before the deleted one; if that leaves empty, clear
      const trimmed = prev.slice(0, idx);
      return trimmed.length > 0 ? trimmed : [];
    });
  }, []);

  const importBundleFn = useCallback(async (bundle: ExportBundle) => {
    const adapter = new IndexedDBStorageAdapter();
    const store = await TreeStore.importBundle(bundle, adapter);
    storeRef.current = store;
    setActivePath([store.getRoot()]);
  }, []);

  const exportBundleFn = useCallback(async () => {
    try { return await storeRef.current.exportBundle(); }
    catch { return null; }
  }, []);

  return (
    <TreeContext.Provider value={{
        store: storeRef.current, llm: llmRef.current, activePath, navigateTo, navigateUp, focusNode,
        createRootTree, resetTree, addChildNode, updateStatus, removeNode, selectedText, setSelectedText,
      importBundle: importBundleFn, exportBundle: exportBundleFn, promptConfig, setPromptConfig, isLoading,
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
