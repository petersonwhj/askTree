import type { LLMConfig, AskOptions } from "../types";
import { llmErrorFromResponse, llmParseError } from "./errors";

export async function askAnthropic(config: LLMConfig, options: AskOptions): Promise<string> {
  const base = config.endpoint.replace(/\/+$/, "");
  const url = base.endsWith("/messages") ? base : `${base}/v1/messages`;

  const authValue = config.authHeader || (config.apiKey ? `x-api-key ${config.apiKey}` : undefined);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (authValue) {
    if (authValue.startsWith("x-api-key ")) {
      headers["x-api-key"] = authValue.slice("x-api-key ".length);
    } else if (authValue.startsWith("Bearer ")) {
      headers["Authorization"] = authValue;
    } else {
      headers["x-api-key"] = authValue;
    }
  }

  // Use rendered prompt when available; fall back to ad-hoc concatenation
  let system: string;
  let userContent: string;
  if (options.system && options.user) {
    system = options.system;
    userContent = options.user;
  } else {
    system = "You are a helpful learning assistant. Explain concepts clearly and thoroughly.";
    userContent =
      options.contextSlices.map((s) => s.surrounding).join("\n\n") +
      `\n\nQuestion about "${options.contextSlices[0]?.selectedText || "this"}": ${options.question}`;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      stream: false,
    }),
    signal: options.signal,
  });

  if (!resp.ok) throw await llmErrorFromResponse(resp, "Anthropic");

  let json: { content?: Array<{ text?: unknown }> };
  try {
    json = await resp.json();
  } catch {
    throw llmParseError("Anthropic", "body is not JSON");
  }
  const text = json?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw llmParseError("Anthropic", "missing content[0].text");
  }
  return text;
}
