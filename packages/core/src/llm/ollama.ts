import type { LLMConfig, AskOptions } from "../types";

async function apiError(resp: Response): Promise<Error> {
  try {
    const body = await resp.clone().json();
    const msg = body?.error || body?.message || "";
    if (msg) return new Error(`Ollama error ${resp.status}: ${msg}`);
  } catch {}
  return new Error(`Ollama error: ${resp.status} ${resp.statusText}`);
}

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

  if (!resp.ok) throw await apiError(resp);

  const json = await resp.json();
  return json.response ?? json.message ?? "";
}
