import { useState } from "react";
import { useTree } from "../hooks/useTree";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";

type Provider = "ollama" | "openai" | "gateway";

const PRESETS: Record<Provider, {
  endpoint: string;
  model: string;
  endpointPlaceholder: string;
  modelPlaceholder: string;
  needsAuth: boolean;
  authLabel: string;
}> = {
  ollama: {
    endpoint: "http://localhost:11434",
    model: "llama3",
    endpointPlaceholder: "http://localhost:11434",
    modelPlaceholder: "llama3",
    needsAuth: false,
    authLabel: "API Key (optional)",
  },
  openai: {
    endpoint: "https://api.deepseek.com",
    model: "deepseek-chat",
    endpointPlaceholder: "https://api.deepseek.com",
    modelPlaceholder: "deepseek-chat",
    needsAuth: true,
    authLabel: "API Key",
  },
  gateway: {
    endpoint: "https://your-gateway.example.com",
    model: "gpt-4",
    endpointPlaceholder: "https://your-gateway.example.com/v1",
    modelPlaceholder: "gpt-4",
    needsAuth: true,
    authLabel: "Authorization Header (full value)",
  },
};

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { llm, promptConfig, setPromptConfig } = useTree();
  const saved = llm.getConfig();
  const [endpoint, setEndpoint] = useState(saved?.endpoint || "");
  const [apiKey, setApiKey] = useState(saved?.apiKey || "");
  const [authHeader, setAuthHeader] = useState(saved?.authHeader || "");
  const [model, setModel] = useState(saved?.model || "");
  const [provider, setProvider] = useState<Provider>(
    !saved?.endpoint ? "ollama"
      : saved.endpoint.includes("localhost") || saved.endpoint.includes("11434") ? "ollama"
      : "openai"
  );
  const [maxDepth, setMaxDepth] = useState(promptConfig.maxDepth);
  const [contextRadius, setContextRadius] = useState(promptConfig.contextRadius.join(", "));
  const [template, setTemplate] = useState(promptConfig.template);

  const applyPreset = (p: Provider) => {
    setProvider(p);
    const preset = PRESETS[p];
    setEndpoint(preset.endpoint);
    setModel(preset.model);
    setApiKey("");
    setAuthHeader("");
  };

  const handleSave = () => {
    llm.configure({
      endpoint,
      apiKey: provider !== "gateway" ? (apiKey || undefined) : undefined,
      authHeader: provider === "gateway" ? (authHeader || undefined) : undefined,
      model,
    }, provider === "ollama" ? "ollama" : "openai");
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

  const preset = PRESETS[provider];

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <h3 style={{ fontSize: 14, color: "#8b949e", marginTop: 16 }}>LLM Configuration</h3>
        <label>Provider</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {(["ollama", "openai", "gateway"] as Provider[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: 12,
                background: provider === p ? "#1a3a5c" : "#21262d",
                border: `1px solid ${provider === p ? "#58a6ff" : "#30363d"}`,
                borderRadius: 4,
                color: provider === p ? "#58a6ff" : "#8b949e",
                cursor: "pointer",
              }}
            >
              {p === "ollama" ? "🖥️ Ollama" : p === "openai" ? "☁️ DeepSeek/OpenAI" : "🏢 Custom Gateway"}
            </button>
          ))}
        </div>

        <label>Endpoint</label>
        <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={preset.endpointPlaceholder} />

        {preset.needsAuth && (
          <>
            <label>{preset.authLabel}</label>
            {provider === "gateway" ? (
              <input
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
                placeholder="Bearer sk-xxx or ApiKey xxx or X-API-Key: xxx"
              />
            ) : (
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            )}
          </>
        )}

        <label>Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={preset.modelPlaceholder} />

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
