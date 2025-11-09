import OpenAI from "openai";
import { Sections } from "./types";

/**
 * visionUnderstandImage
 * - Be concrete about WHAT this actually is.
 * - Name the site/app/game if recognizable (Twitch, Reddit, Amazon cart, YouTube, etc.).
 * - Describe what's happening in the *main panel*, not just "a video player UI".
 * - Capture side panels like chat/sidebar/recommendations.
 * - Capture any numeric/status info you can SEE (viewers, score, cart count).
 */
export async function visionUnderstandImage(openai: OpenAI, b64: string): Promise<Sections> {
  const systemPrompt = [
    "You are analyzing a live screen capture.",
    "You may be looking at: a browser tab, a livestream, an online store cart, a code editor, a document, a dashboard, a game POV, etc.",
    "",
    "Return strict JSON with keys:",
    "scene: string                      // What is the main thing happening? Name the site/app/game if obvious.",
    "notableElements: string[]          // Important visible elements: e.g. 'first-person shooter HUD', 'Reddit dark theme post list', 'chat sidebar full of emotes', 'shopping cart with multiple items', 'streamer webcam overlay top-left', 'map of Boston from 1775', etc.",
    "uiRegions: string[]                // Layout regions you can clearly see. Example: 'left nav of followed channels', 'center gameplay feed', 'right live chat'.",
    "counts: string[]                   // Any numbers or stats you can confidently read: e.g. '32.5K viewers', 'Cart has 5 items', 'health 100', 'ammo 13'. Include game HUD info if it's legible.",
    "suggestions: string[]              // Helpful next steps for the user. Example:",
    "// - 'Ask me to summarize the chat on the right.'",
    "// - 'Ask me to explain the minimap / HUD indicators.'",
    "// - 'Ask me to summarize this Reddit thread.'",
    "// - 'Ask me to list what's in your cart.'",
    "",
    "Rules:",
    "- Be specific. If it's clearly Twitch or Reddit or YouTube, say so.",
    "- If it's clearly a shooter game POV, say something like 'First-person shooter view of a player holding a pistol in an industrial map' instead of generic 'characters in a virtual environment'.",
    "- If there's a facecam/streamer webcam overlay, mention it.",
    "- If there's a chat sidebar full of emotes, mention it.",
    "- If it's a historical map or document, say what's being shown (e.g. '18th century map of Boston').",
    "- If you truly can't read tiny text, that's fine, just say 'small/unclear text', but you SHOULD still describe visible layout/content.",
    "- Be honest. Do not invent details you cannot see.",
  ].join("\n");

  const userContent: any = [
    { type: "text", text: "Describe this screenshot and fill the JSON spec precisely." },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
  ];

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent as any },
    ],
    response_format: { type: "json_object" } as any,
  } as any);

  const raw = resp.choices?.[0]?.message?.content || "{}";

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const scene = parsed.scene || "A screen is visible.";
  const notableElements: string[] = Array.isArray(parsed.notableElements) ? parsed.notableElements : [];
  const uiRegions: string[] = Array.isArray(parsed.uiRegions) ? parsed.uiRegions : [];
  const counts: string[] = Array.isArray(parsed.counts) ? parsed.counts : [];
  const suggestions: string[] = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

  const summary = scene;
  const keyItems: string[] = [
    ...notableElements.map((x) => x.trim()).filter(Boolean),
    ...uiRegions.map((x) => x.trim()).filter(Boolean),
    ...counts.map((x) => x.trim()).filter(Boolean),
  ];

  return {
    summary: summary || "This screenshot shows some content.",
    keyItems,
    suggestions,
  };
}
