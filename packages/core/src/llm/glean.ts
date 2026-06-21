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

/** Labels that are generic search/reasoning prompts, not useful as queries */
const GENERIC_LABELS = new Set([
  "Searching company knowledge",
  "Searching",
  "Reading",
  "Planning",
  "Thinking",
  "Analyzing",
  "Reasoning",
  "Generating",
]);

/**
 * Extract the answer text and an optional research trail from a Glean Chat API
 * response. Only CONTENT-type messages contribute to the answer. UPDATE-type
 * messages surface search queries as a compact markdown blockquote trail.
 */
export function extractGleanAnswer(json: any): string {
  const messages: any[] = json?.messages;
  if (!Array.isArray(messages)) return "";

  // Answer: only CONTENT messages (final answer text)
  const contentMessages = messages.filter(
    (m) => m.messageType === "CONTENT",
  );

  // Fallback: if no CONTENT messages, use messages without a messageType
  const answerMessages =
    contentMessages.length > 0
      ? contentMessages
      : messages.filter((m) => !m.messageType);

  const answer = answerMessages
    .map((m) =>
      m.fragments?.map((f: any) => f.text).join("") ?? m.text ?? "",
    )
    .join("\n")
    .trim();

  // Research trail: use UPDATE messages (the live response shape)
  // Each UPDATE message carries a search step in fragments[1].text
  const updateMessages = messages.filter(
    (m) => m.messageType === "UPDATE",
  );

  if (updateMessages.length > 0) {
    const queries: string[] = [];
    for (const msg of updateMessages) {
      const fragments: any[] = msg.fragments ?? [];
      // fragments[0] is a label like "**Searching:**"
      // fragments[1] is the actual search query
      const query = fragments[1]?.text?.trim();
      if (query && !GENERIC_LABELS.has(query)) {
        queries.push(query);
      }
    }

    // De-duplicate while preserving order
    const unique = [...new Set(queries)];

    if (unique.length > 0) {
      const trail =
        "> **Searched:** " +
        unique.map((q) => "`" + q + "`").join(" · ") +
        "\n\n---\n\n";
      return trail + answer;
    }
  }

  return answer;
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
