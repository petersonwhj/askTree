import { useRef, useState } from "react";
import { useTree } from "../hooks/useTree";
import { DEFAULT_PROMPT_CONFIG, SUGGEST_TEMPLATE } from "@asktree/core";

type Provider = "ollama" | "openai" | "anthropic";

const PROVIDERS: Provider[] = ["ollama", "openai", "anthropic"];

const PROVIDER_LABELS: Record<Provider, string> = {
  ollama: "🖥️ Ollama",
  openai: "☁️ OpenAI Compatible API",
  anthropic: "🧠 Anthropic Compatible API",
};

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
    model: "deepseek-flash",
    endpointPlaceholder: "https://api.deepseek.com",
    modelPlaceholder: "deepseek-flash",
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
};

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    llm,
    promptConfig,
    setPromptConfig,
    showExplored = true,
    setShowExplored,
  } = useTree();
  const [exploredDraft, setExploredDraft] = useState(showExplored);
  const saved = llm.getConfig();

  // Restore saved provider from localStorage. Obsolete values (glean/gateway)
  // are intentionally ignored and fall through to endpoint-based inference.
  const [provider, setProvider] = useState<Provider>(() => {
    try {
      const s = localStorage.getItem("asktree_provider");
      if (s === "ollama" || s === "openai" || s === "anthropic") return s;
      // Obsolete providers: map to the closest compatible one.
      if (s === "glean" || s === "gateway") return "openai";
    } catch {}
    if (!saved?.endpoint) return "ollama";
    if (saved.endpoint.includes("localhost") || saved.endpoint.includes("11434")) return "ollama";
    if (saved.endpoint.includes("anthropic")) return "anthropic";
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

  const [model, setModel] = useState(() => {
    try {
      const key = `asktree_provider_cfg_${provider}`;
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved).model;
    } catch {}
    return saved?.model || PRESETS[provider].model;
  });

  const [showApiKey, setShowApiKey] = useState(false);

  const [maxDepth, setMaxDepth] = useState(promptConfig.maxDepth);
  const [contextRadius, setContextRadius] = useState(promptConfig.contextRadius.join(", "));
  const [template, setTemplate] = useState(promptConfig.template);
  const [suggestTemplate, setSuggestTemplate] = useState(
    promptConfig.suggestTemplate ?? SUGGEST_TEMPLATE,
  );

  // In-memory drafts so switching providers keeps unsaved edits without
  // writing anything to storage (only Save commits).
  const draftsRef = useRef<
    Partial<Record<Provider, { endpoint: string; apiKey: string; model: string }>>
  >({});

  const saveProviderConfig = (p: Provider) => {
    const cfg = { endpoint, apiKey, model };
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
        setModel(cfg.model || PRESETS[p].model);
        return;
      }
    } catch {}
    // Fall back to presets
    const preset = PRESETS[p];
    setEndpoint(preset.endpoint);
    setApiKey("");
    setModel(preset.model);
  };

  const applyPreset = (p: Provider) => {
    if (p === provider) return;
    // Stash the current edits as an in-memory draft; write nothing yet.
    draftsRef.current[provider] = { endpoint, apiKey, model };
    setProvider(p);
    const draft = draftsRef.current[p];
    if (draft) {
      setEndpoint(draft.endpoint);
      setApiKey(draft.apiKey);
      setModel(draft.model);
      return;
    }
    restoreProviderConfig(p);
  };

  const handleSave = () => {
    saveProviderConfig(provider);
    localStorage.setItem("asktree_provider", provider);

    const config = { endpoint, apiKey: apiKey || undefined, model };
    llm.configure(config, provider);
    localStorage.setItem("asktree_llm_config", JSON.stringify({ config, provider }));
    setPromptConfig({
      maxDepth,
      contextRadius: contextRadius.split(",").map((s) => parseInt(s.trim()) || 0),
      template,
      suggestTemplate,
    });
    setShowExplored?.(exploredDraft);
    onClose();
  };

  const handleReset = () => {
    setMaxDepth(DEFAULT_PROMPT_CONFIG.maxDepth);
    setContextRadius(DEFAULT_PROMPT_CONFIG.contextRadius.join(", "));
    setTemplate(DEFAULT_PROMPT_CONFIG.template);
    setSuggestTemplate(DEFAULT_PROMPT_CONFIG.suggestTemplate ?? SUGGEST_TEMPLATE);
    setExploredDraft(true);
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
          {PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              aria-pressed={provider === p}
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
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>

        <label>Endpoint</label>
        <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={preset.endpointPlaceholder} />

        {preset.needsAuth && (
          <>
            <label>{preset.authLabel}</label>
            <div className="password-field">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === "anthropic" ? "sk-ant-api03-..." : "sk-..."}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                title={showApiKey ? "Hide API key" : "Show API key"}
                onClick={() => setShowApiKey((v) => !v)}
              >
                {showApiKey ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </>
        )}

        <label>Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={preset.modelPlaceholder} />

        <h3 style={{ fontSize: 14, color: "#8b949e", marginTop: 16 }}>Prompt Configuration</h3>
        <label>Max Ancestor Depth</label>
        <input type="number" value={maxDepth} onChange={(e) => setMaxDepth(parseInt(e.target.value) || 3)} min={1} max={5} />
        <p className="field-help">
          How many ancestor pages to include, walked upward from the page you are asking about.
          The current page is always included, and the real article root is always anchored.
        </p>

        <label>Context Radius (chars per depth, comma-separated)</label>
        <input value={contextRadius} onChange={(e) => setContextRadius(e.target.value)} placeholder="200, 100, 50" />
        <p className="field-help">
          Surrounding characters kept per depth level — the first value is for the current page,
          each next value is one ancestor level up.
        </p>

        <label>Prompt Template</label>
        <textarea
          aria-label="Prompt Template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />

        <label>Suggested Questions Template</label>
        <textarea
          aria-label="Suggested Questions Template"
          value={suggestTemplate}
          onChange={(e) => setSuggestTemplate(e.target.value)}
        />

        <h3 style={{ fontSize: 14, color: "#8b949e", marginTop: 16 }}>Reading</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={exploredDraft}
            onChange={(e) => setExploredDraft(e.target.checked)}
            style={{ width: "auto", margin: 0 }}
          />
          Show explored passages
        </label>
        <p className="field-help">
          Underlines passages you already asked about, in both panels.
        </p>

        <div className="btn-row">
          <button onClick={handleReset}>Reset Defaults</button>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
