import { useState } from "react";
import { useTree } from "../hooks/useTree";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";

type Provider = "ollama" | "openai" | "anthropic" | "gateway";
type GatewayFormat = "openai" | "anthropic";

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
  anthropic: {
    endpoint: "https://api.anthropic.com",
    model: "claude-sonnet-4-6",
    endpointPlaceholder: "https://api.anthropic.com",
    modelPlaceholder: "claude-sonnet-4-6",
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

  // Restore saved provider from localStorage
  const [provider, setProvider] = useState<Provider>(() => {
    try {
      const s = localStorage.getItem("asktree_provider");
      if (s && (s === "ollama" || s === "openai" || s === "anthropic" || s === "gateway")) return s;
    } catch {}
    if (!saved?.endpoint) return "ollama";
    if (saved.endpoint.includes("localhost") || saved.endpoint.includes("11434")) return "ollama";
    if (saved.endpoint.includes("anthropic")) return "anthropic";
    return "openai";
  });

  const [gatewayFormat, setGatewayFormat] = useState<GatewayFormat>(() => {
    try {
      const s = localStorage.getItem("asktree_gateway_format");
      if (s === "anthropic" || s === "openai") return s;
    } catch {}
    return "openai";
  });

  const [endpoint, setEndpoint] = useState(() => {
    try {
      const key = `asktree_provider_cfg_${provider}`;
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved).endpoint;
    } catch {}
    return saved?.endpoint || PRESETS[provider].endpoint;
  });

  const [apiKey, setApiKey] = useState(() => {
    try {
      const key = `asktree_provider_cfg_${provider}`;
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved).apiKey || "";
    } catch {}
    return saved?.apiKey || "";
  });

  const [authHeader, setAuthHeader] = useState(() => {
    try {
      const key = `asktree_provider_cfg_${provider}`;
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved).authHeader || "";
    } catch {}
    return saved?.authHeader || "";
  });

  const [model, setModel] = useState(() => {
    try {
      const key = `asktree_provider_cfg_${provider}`;
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved).model;
    } catch {}
    return saved?.model || PRESETS[provider].model;
  });

  const [maxDepth, setMaxDepth] = useState(promptConfig.maxDepth);
  const [contextRadius, setContextRadius] = useState(promptConfig.contextRadius.join(", "));
  const [template, setTemplate] = useState(promptConfig.template);

  const saveProviderConfig = (p: Provider) => {
    const cfg = { endpoint, apiKey, authHeader, model };
    localStorage.setItem(`asktree_provider_cfg_${p}`, JSON.stringify(cfg));
  };

  const restoreProviderConfig = (p: Provider) => {
    try {
      const key = `asktree_provider_cfg_${p}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const cfg = JSON.parse(saved);
        setEndpoint(cfg.endpoint || PRESETS[p].endpoint);
        setApiKey(cfg.apiKey || "");
        setAuthHeader(cfg.authHeader || "");
        setModel(cfg.model || PRESETS[p].model);
        return;
      }
    } catch {}
    // Fall back to presets
    const preset = PRESETS[p];
    setEndpoint(preset.endpoint);
    setApiKey("");
    setAuthHeader("");
    setModel(preset.model);
  };

  const applyPreset = (p: Provider) => {
    if (provider !== p) {
      saveProviderConfig(provider);
    }
    setProvider(p);
    restoreProviderConfig(p);
    localStorage.setItem("asktree_provider", p);
  };

  const handleSave = () => {
    // Save per-provider config
    saveProviderConfig(provider);
    localStorage.setItem("asktree_provider", provider);
    localStorage.setItem("asktree_gateway_format", gatewayFormat);

    const config = {
      endpoint,
      apiKey: provider !== "gateway" ? (apiKey || undefined) : undefined,
      authHeader: provider === "gateway" ? (authHeader || undefined) : undefined,
      model,
    };
    const llmProvider = provider === "gateway"
      ? gatewayFormat
      : provider;
    llm.configure(config, llmProvider);
    localStorage.setItem("asktree_llm_config", JSON.stringify({ config, provider: llmProvider }));
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
    <div className="settings-modal-overlay">
      <div className="settings-modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid #30363d",
              borderRadius: 4,
              color: "#8b949e",
              cursor: "pointer",
              fontSize: 16,
              padding: "2px 8px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <h3 style={{ fontSize: 14, color: "#8b949e", marginTop: 16 }}>LLM Configuration</h3>
        <label>Provider</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {(["ollama", "openai", "anthropic", "gateway"] as Provider[]).map((p) => (
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
              {p === "ollama" ? "🖥️ Ollama" : p === "openai" ? "☁️ OpenAI Compat." : p === "anthropic" ? "🧠 Anthropic" : "🏢 Custom Gateway"}
            </button>
          ))}
        </div>

        {provider === "gateway" && (
          <>
            <label>Gateway Format</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {(["openai", "anthropic"] as GatewayFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setGatewayFormat(f)}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    fontSize: 12,
                    background: gatewayFormat === f ? "#1a3a5c" : "#21262d",
                    border: `1px solid ${gatewayFormat === f ? "#58a6ff" : "#30363d"}`,
                    borderRadius: 4,
                    color: gatewayFormat === f ? "#58a6ff" : "#8b949e",
                    cursor: "pointer",
                  }}
                >
                  {f === "openai" ? "OpenAI-compatible" : "Anthropic Messages"}
                </button>
              ))}
            </div>
          </>
        )}

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
            ) : provider === "anthropic" ? (
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
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
