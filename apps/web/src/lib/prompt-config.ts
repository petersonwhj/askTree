import { DEFAULT_PROMPT_CONFIG, type PromptConfig } from "@asktree/core";

// Distinctive substrings of default templates shipped in earlier versions.
// A saved template matching one of these is an untouched old default and is
// safe to replace; user-customised templates are left alone.
const LEGACY_TEMPLATE_MARKERS = [
  "你是一个帮助用户理解文章内容的学习助手",
  "You are a focused study assistant",
];

/** Bring a saved prompt config up to date with the current default template. */
export function migratePromptConfig(
  saved: Partial<PromptConfig> | null | undefined,
): PromptConfig {
  if (!saved) return DEFAULT_PROMPT_CONFIG;

  const template = typeof saved.template === "string" ? saved.template : "";
  const isLegacyDefault = LEGACY_TEMPLATE_MARKERS.some((marker) =>
    template.includes(marker),
  );

  return {
    maxDepth:
      typeof saved.maxDepth === "number" ? saved.maxDepth : DEFAULT_PROMPT_CONFIG.maxDepth,
    contextRadius: Array.isArray(saved.contextRadius)
      ? saved.contextRadius
      : DEFAULT_PROMPT_CONFIG.contextRadius,
    template: isLegacyDefault || !template ? DEFAULT_PROMPT_CONFIG.template : template,
  };
}
