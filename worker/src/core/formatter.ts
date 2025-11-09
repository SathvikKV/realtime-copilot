// worker/src/core/formatter.ts
import { Sections } from './types';

function bullets(arr: string[]) {
  const cleaned = Array.isArray(arr) && arr.length ? arr : [];
  if (!cleaned.length) return "- (none)";
  return cleaned.map((s) => `- ${s}`).join("\n");
}

/**
 * asMarkdown() is what we actually send back over DataChannel.
 * Keep it readable in Transcript.
 */
export function asMarkdown(sections: Sections) {
  const { summary, keyItems, suggestions } = sections;

  return [
    summary?.trim() || "Here's what I can see.",
    "",
    keyItems && keyItems.length
      ? `Key details:\n${bullets(keyItems)}`
      : undefined,
    suggestions && suggestions.length
      ? `Next steps:\n${bullets(suggestions)}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * mergeSections() fuses vision + OCR signals.
 * We de-dupe but keep both perspectives.
 */
export function mergeSections(a: Sections, b: Sections): Sections {
  const uniq = (xs: string[]) =>
    Array.from(new Set(xs.map((s) => s.trim()).filter(Boolean)));

  return {
    summary: a.summary?.trim() || b.summary?.trim() || "Here's what I can see.",
    keyItems: uniq([...(a.keyItems || []), ...(b.keyItems || [])]),
    suggestions: uniq([...(a.suggestions || []), ...(b.suggestions || [])]),
  };
}
