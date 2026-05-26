import type { LLMConfig, AskOptions } from "../types";

export async function askOllama(config: LLMConfig, options: AskOptions): Promise<string> {
  const url = `${config.endpoint}/api/generate`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      prompt:
        options.contextSlices.map((s) => s.surrounding).join("\n\n") +
        "\n\nQuestion: " +
        options.question,
      stream: false,
    }),
    signal: options.signal,
  });

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) throw new Error("AuthError: check API access");
    if (resp.status === 429) throw new Error("RateLimitError");
    throw new Error(`Ollama error: ${resp.status}`);
  }

  const json = await resp.json();
  return json.response ?? json.message ?? "";
}
