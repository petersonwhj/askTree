import type { LLMConfig, AskOptions } from "./types";
import { askOllama } from "./llm/ollama";
import { askOpenAICompat } from "./llm/openai-compat";
import { askAnthropic } from "./llm/anthropic";
import { LLMError, llmErrorFromFetch, llmSetupError } from "./llm/errors";

export type LLMProvider = "ollama" | "openai" | "anthropic";

// Single owner of retries: at most MAX_ATTEMPTS total, within MAX_TOTAL_MS,
// with a cooldown. Only retryable failures are retried; auth failures are not.
const MAX_ATTEMPTS = 3;
const MAX_TOTAL_MS = 30_000;
const RETRY_COOLDOWN_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class LLMService {
  private config: LLMConfig | null = null;
  private provider: LLMProvider = "openai";
  private controller: AbortController | null = null;

  configure(config: LLMConfig, provider: LLMProvider): void {
    this.config = config;
    this.provider = provider;
  }

  getConfig(): LLMConfig | null {
    return this.config;
  }

  private dispatch(config: LLMConfig, options: AskOptions): Promise<string> {
    switch (this.provider) {
      case "ollama":
        return askOllama(config, options);
      case "openai":
        return askOpenAICompat(config, options);
      case "anthropic":
        return askAnthropic(config, options);
    }
  }

  async ask(options: AskOptions): Promise<string> {
    if (!this.config) throw llmSetupError();
    const config = this.config;

    this.controller = new AbortController();
    const askOptions: AskOptions = {
      ...options,
      signal: options.signal ?? this.controller.signal,
    };

    const startedAt = Date.now();
    let lastError: LLMError | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.dispatch(config, askOptions);
      } catch (e) {
        const error = e instanceof LLMError ? e : llmErrorFromFetch(e);
        lastError = error;

        const withinBudget = Date.now() - startedAt < MAX_TOTAL_MS;
        if (!error.retryable || attempt >= MAX_ATTEMPTS || !withinBudget) {
          throw error;
        }
        await sleep(RETRY_COOLDOWN_MS);
      }
    }

    throw lastError ?? llmSetupError();
  }

  abort(): void {
    this.controller?.abort();
  }
}
