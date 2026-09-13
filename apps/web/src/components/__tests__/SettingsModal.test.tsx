import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));

vi.mock("../../hooks/useTree", () => ({ useTree: () => mocks.ctx }));

import { SettingsModal } from "../SettingsModal";

describe("SettingsModal providers", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.ctx = {
      llm: { getConfig: () => null, configure: vi.fn() },
      promptConfig: DEFAULT_PROMPT_CONFIG,
      setPromptConfig: vi.fn(),
      showExplored: true,
      setShowExplored: vi.fn(),
    };
  });

  it("toggles the explored-passages setting on Save", () => {
    const setShowExplored = vi.fn();
    mocks.ctx = { ...mocks.ctx, setShowExplored };

    render(<SettingsModal onClose={() => {}} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(true);

    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(setShowExplored).toHaveBeenCalledWith(false);
  });

  it("offers only Ollama, OpenAI-compatible, and Anthropic providers", () => {
    render(<SettingsModal onClose={() => {}} />);

    expect(screen.getByRole("button", { name: /ollama/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /openai compatible api/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /anthropic compatible api/i })).toBeTruthy();

    expect(screen.queryByText(/glean/i)).toBeNull();
    expect(screen.queryByText(/custom gateway/i)).toBeNull();
  });

  it("migrates an obsolete saved provider to OpenAI-compatible", () => {
    localStorage.setItem("asktree_provider", "glean");

    render(<SettingsModal onClose={() => {}} />);

    const openai = screen.getByRole("button", { name: /openai compatible api/i });
    expect(openai.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not persist a provider switch until Save", () => {
    localStorage.setItem("asktree_provider", "openai");
    const configure = vi.fn();
    mocks.ctx = {
      llm: { getConfig: () => null, configure },
      promptConfig: DEFAULT_PROMPT_CONFIG,
      setPromptConfig: vi.fn(),
    };

    render(<SettingsModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /ollama/i }));

    expect(localStorage.getItem("asktree_provider")).toBe("openai");
    expect(configure).not.toHaveBeenCalled();
  });

  it("persists the provider switch and prompt templates on Save", () => {
    localStorage.setItem("asktree_provider", "openai");
    const configure = vi.fn();
    const setPromptConfig = vi.fn();
    mocks.ctx = {
      llm: { getConfig: () => null, configure },
      promptConfig: DEFAULT_PROMPT_CONFIG,
      setPromptConfig,
    };

    render(<SettingsModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /ollama/i }));
    fireEvent.change(screen.getByLabelText("Suggested Questions Template"), {
      target: { value: "MY SUGGEST TEMPLATE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(localStorage.getItem("asktree_provider")).toBe("ollama");
    expect(configure).toHaveBeenCalled();
    expect(setPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({ suggestTemplate: "MY SUGGEST TEMPLATE" }),
    );
  });

  it("Cancel discards the draft switch", () => {
    localStorage.setItem("asktree_provider", "openai");
    const configure = vi.fn();
    mocks.ctx = {
      llm: { getConfig: () => null, configure },
      promptConfig: DEFAULT_PROMPT_CONFIG,
      setPromptConfig: vi.fn(),
    };

    render(<SettingsModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /ollama/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(localStorage.getItem("asktree_provider")).toBe("openai");
    expect(configure).not.toHaveBeenCalled();
  });

  it("shows the suggested-questions template from the config", () => {
    render(<SettingsModal onClose={() => {}} />);
    const area = screen.getByLabelText("Suggested Questions Template") as HTMLTextAreaElement;
    expect(area.value).toBe(DEFAULT_PROMPT_CONFIG.suggestTemplate);
  });

  it("explains the depth and radius settings", () => {
    render(<SettingsModal onClose={() => {}} />);
    expect(screen.getByText(/upward from the page you are asking/i)).toBeTruthy();
    expect(screen.getByText(/surrounding characters kept per depth/i)).toBeTruthy();
  });

  it("defaults the OpenAI-compatible model to deepseek-flash", () => {
    localStorage.setItem("asktree_provider", "openai");
    render(<SettingsModal onClose={() => {}} />);
    expect(screen.getByDisplayValue("deepseek-flash")).toBeTruthy();
  });

  it("keeps the API key hidden by default and toggles visibility with the eye", () => {
    localStorage.setItem("asktree_provider", "openai");
    render(<SettingsModal onClose={() => {}} />);

    const input = screen.getByPlaceholderText("sk-...") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: /show api key/i }));
    expect(input.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: /hide api key/i }));
    expect(input.type).toBe("password");
  });
});
