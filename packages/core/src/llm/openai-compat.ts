import type { LLMConfig, AskOptions } from "../types";
import { llmErrorFromResponse, llmParseError } from "./errors";

export async function askOpenAICompat(config: LLMConfig, options: AskOptions): Promise<string> {
  const base = config.endpoint.replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;

  const authValue = config.authHeader || (config.apiKey ? `Bearer ${config.apiKey}` : undefined);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authValue) {
    headers["Authorization"] = authValue;
  }

  // Use rendered prompt when available; fall back to ad-hoc concatenation
  const messages: Array<{ role: string; content: string }> = [];
  if (options.system && options.user) {
    messages.push(
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    );
  } else {
    messages.push(
      {
        role: "system",
        content: "You are a helpful learning assistant. Explain concepts clearly and thoroughly.",
      },
      {
        role: "user",
        content:
          options.contextSlices.map((s) => s.surrounding).join("\n\n") +
          `\n\nQuestion about "${options.contextSlices[0]?.selectedText || "this"}": ${options.question}`,
      },
    );
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      // DeepSeek v4 models default to non-thinking; request thinking explicitly.
      thinking: { type: "enabled" },
    }),
    signal: options.signal,
  });

  if (!resp.ok) throw await llmErrorFromResponse(resp, "API");

  let json: {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  try {
    json = await resp.json();
  } catch {
    throw llmParseError("API", "body is not JSON");
  }
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw llmParseError("API", "missing choices[0].message.content");
  }
  return content;
}
