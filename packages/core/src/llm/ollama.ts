import type { LLMConfig, AskOptions } from "../types";
import { llmErrorFromResponse, llmParseError } from "./errors";

export async function askOllama(config: LLMConfig, options: AskOptions): Promise<string> {
  const base = config.endpoint.replace(/\/+$/, "");
  const url = `${base}/api/generate`;

  // Use rendered prompt when available; fall back to ad-hoc concatenation
  let prompt: string;
  if (options.system && options.user) {
    // Ollama has no system role — prepend system to user prompt
    prompt = options.system + "\n\n" + options.user;
  } else {
    prompt =
      options.contextSlices.map((s) => s.surrounding).join("\n\n") +
      "\n\nQuestion: " +
      options.question;
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      prompt,
      stream: false,
    }),
    signal: options.signal,
  });

  if (!resp.ok) throw await llmErrorFromResponse(resp, "Ollama");

  let json: { response?: unknown; message?: unknown };
  try {
    json = await resp.json();
  } catch {
    throw llmParseError("Ollama", "body is not JSON");
  }
  const content = json?.response ?? json?.message;
  if (typeof content !== "string") {
    throw llmParseError("Ollama", "missing response field");
  }
  return content;
}
