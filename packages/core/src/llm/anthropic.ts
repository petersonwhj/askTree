import type { LLMConfig, AskOptions } from "../types";

async function apiError(resp: Response): Promise<Error> {
  try {
    const body = await resp.clone().json();
    const msg = body?.error?.message || body?.message || "";
    if (msg) return new Error(`Anthropic error ${resp.status}: ${msg}`);
  } catch {}
  return new Error(`Anthropic error: ${resp.status} ${resp.statusText}`);
}

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

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: "You are a helpful learning assistant. Explain concepts clearly and thoroughly.",
      messages: [
        {
          role: "user",
          content:
            options.contextSlices.map((s) => s.surrounding).join("\n\n") +
            `\n\nQuestion about "${options.contextSlices[0]?.selectedText || "this"}": ${options.question}`,
        },
      ],
      stream: false,
    }),
    signal: options.signal,
  });

  if (!resp.ok) throw await apiError(resp);

  const json = await resp.json();
  return json.content?.[0]?.text ?? "";
}
