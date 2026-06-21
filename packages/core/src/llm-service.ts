import type { LLMConfig, AskOptions } from "./types";
import { askOllama } from "./llm/ollama";
import { askOpenAICompat } from "./llm/openai-compat";
import { askAnthropic } from "./llm/anthropic";
import { askGlean } from "./llm/glean";

export type LLMProvider = "ollama" | "openai" | "anthropic" | "glean";

export class LLMService {
  private config: LLMConfig | null = null;
  private provider: LLMProvider = "openai";
  private controller: AbortController | null = null;

  configure(config: LLMConfig, provider: LLMProvider): void {
    this.config = config;
    this.provider = provider;
  }

  async ask(options: AskOptions): Promise<string> {
    if (!this.config) throw new Error("LLM not configured");

    this.controller = new AbortController();
    const askOptions: AskOptions = {
      ...options,
      signal: options.signal ?? this.controller.signal,
    };

    switch (this.provider) {
      case "ollama":
        return askOllama(this.config, askOptions);
      case "openai":
        return askOpenAICompat(this.config, askOptions);
      case "anthropic":
        return askAnthropic(this.config, askOptions);
      case "glean":
        return askGlean(this.config, askOptions);
    }
  }

  abort(): void {
    this.controller?.abort();
  }

  getConfig(): LLMConfig | null {
    return this.config;
  }
}
