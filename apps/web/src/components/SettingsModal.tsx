import { useState } from "react";
import { useTree } from "../hooks/useTree";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { llm, promptConfig, setPromptConfig } = useTree();
  const [endpoint, setEndpoint] = useState(llm.getConfig()?.endpoint || "http://localhost:11434");
  const [apiKey, setApiKey] = useState(llm.getConfig()?.apiKey || "");
  const [model, setModel] = useState(llm.getConfig()?.model || "llama3");
  const [provider, setProvider] = useState<"ollama" | "openai">("ollama");
  const [maxDepth, setMaxDepth] = useState(promptConfig.maxDepth);
  const [contextRadius, setContextRadius] = useState(promptConfig.contextRadius.join(", "));
  const [template, setTemplate] = useState(promptConfig.template);

  const handleSave = () => {
    llm.configure({ endpoint, apiKey: apiKey || undefined, model }, provider);
    setPromptConfig({
      maxDepth,
      contextRadius: contextRadius.split(",").map((s) => parseInt(s.trim()) || 0),
      template,
    });
    onClose();
  };

  const handleReset = () => {
    setMaxDepth(DEFAULT_PROMPT_CONFIG.maxDepth);
    setContextRadius(DEFAULT_PROMPT_CONFIG.contextRadius.join(", "));
    setTemplate(DEFAULT_PROMPT_CONFIG.template);
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <h3 style={{ fontSize: 14, color: "#8b949e", marginTop: 16 }}>LLM Configuration</h3>
        <label>Provider</label>
        <select value={provider} onChange={(e) => setProvider(e.target.value as any)}>
          <option value="ollama">Ollama</option>
          <option value="openai">OpenAI Compatible</option>
        </select>

        <label>Endpoint</label>
        <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:11434" />

        <label>API Key {provider === "ollama" ? "(optional)" : ""}</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />

        <label>Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="llama3" />

        <h3 style={{ fontSize: 14, color: "#8b949e", marginTop: 16 }}>Prompt Configuration</h3>
        <label>Max Ancestor Depth</label>
        <input type="number" value={maxDepth} onChange={(e) => setMaxDepth(parseInt(e.target.value) || 3)} min={1} max={5} />

        <label>Context Radius (chars per depth, comma-separated)</label>
        <input value={contextRadius} onChange={(e) => setContextRadius(e.target.value)} placeholder="200, 100, 50" />

        <label>Prompt Template</label>
        <textarea value={template} onChange={(e) => setTemplate(e.target.value)} />

        <div className="btn-row">
          <button onClick={handleReset}>Reset Defaults</button>
          <button className="primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
