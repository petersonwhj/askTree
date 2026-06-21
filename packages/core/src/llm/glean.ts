import type { LLMConfig, AskOptions } from "../types";

/**
 * Build the Glean Chat API request payload.
 * Glean has no system role — system + user are combined into one user message.
 */
export function buildGleanPayload(
  system: string,
  user: string,
): { messages: Array<{ role: string; content: string }> } {
  const combined = system + "\n\n" + user;
  return {
    messages: [
      {
        role: "user",
        content: combined,
      },
    ],
  };
}

/**
 * Extract the answer text from a Glean Chat API response.
 * Renders only CONTENT-type messages (the final answer).
 * Intermediate search/reasoning steps are skipped (see commits 28-30).
 */
export function extractGleanAnswer(json: any): string {
  const messages: any[] = json?.messages;
  if (!Array.isArray(messages)) return "";

  const contentMessages = messages.filter(
    (m) => m.messageType === "CONTENT",
  );

  // If no CONTENT messages found, fall back to messages without a messageType
  const candidates =
    contentMessages.length > 0
      ? contentMessages
      : messages.filter((m) => !m.messageType);

  return candidates
    .map((m) => m.fragments?.map((f: any) => f.text).join("") ?? m.text ?? "")
    .join("\n")
    .trim();
}

async function apiError(resp: Response): Promise<Error> {
  try {
    const body = await resp.clone().json();
    const msg = body?.error?.message || body?.message || "";
    if (msg) return new Error(`Glean error ${resp.status}: ${msg}`);
  } catch {}
  return new Error(`Glean error: ${resp.status} ${resp.statusText}`);
}

export async function askGlean(config: LLMConfig, options: AskOptions): Promise<string> {
  const base = config.endpoint.replace(/\/+$/, "");
  const url = `${base}/rest/api/v1/chat/`;

  const authValue = config.authHeader || (config.apiKey ? `Bearer ${config.apiKey}` : undefined);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authValue) {
    headers["Authorization"] = authValue.startsWith("Bearer ") ? authValue : `Bearer ${authValue}`;
  }

  // Use rendered prompt when available; fall back to ad-hoc
  let system: string;
  let user: string;
  if (options.system && options.user) {
    system = options.system;
    user = options.user;
  } else {
    system = "You are a helpful learning assistant.";
    user =
      options.contextSlices.map((s) => s.surrounding).join("\n\n") +
      `\n\nQuestion about "${options.contextSlices[0]?.selectedText || "this"}": ${options.question}`;
  }

  const payload = buildGleanPayload(system, user);

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!resp.ok) throw await apiError(resp);

  const json = await resp.json();
  return extractGleanAnswer(json);
}
