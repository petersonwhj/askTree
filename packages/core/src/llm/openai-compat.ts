import type { LLMConfig, AskOptions } from "../types";

async function apiError(resp: Response): Promise<Error> {
  try {
    const body = await resp.clone().json();
    const msg = body?.error?.message || body?.message || body?.detail || "";
    if (msg) return new Error(`API error ${resp.status}: ${msg}`);
  } catch {}
  return new Error(`API error: ${resp.status} ${resp.statusText}`);
}

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
    }),
    signal: options.signal,
  });

  if (!resp.ok) throw await apiError(resp);

  const json = await resp.json();
  return json.choices?.[0]?.message?.content ?? "";
}
