"use client";

import { useState } from "react";

type Turn = { role: "user" | "assistant"; text: string; ts?: number };

export default function ChatPanel({
  turns,
  onSendChat,
  disabled,
  suggestions = [],
}: {
  turns: Turn[];
  onSendChat: (t: string) => void;
  disabled?: boolean;
  suggestions?: string[];
}) {
  const [text, setText] = useState("");

  return (
    <div className="flex flex-col h-full bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "text-right" : "text-left"}>
            <div
              className={
                t.role === "user"
                  ? "inline-block bg-sky-500/20 text-sky-50 px-3 py-2 rounded-lg text-sm"
                  : "inline-block bg-white/10 text-white/90 px-3 py-2 rounded-lg text-sm"
              }
            >
              {t.text}
            </div>
          </div>
        ))}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onSendChat(s)}
                className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded-lg"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              onSendChat(text.trim());
              setText("");
            }
          }}
          disabled={disabled}
          className="flex-1 bg-black/20 border border-white/10 rounded-lg px-2 py-1 text-sm outline-none"
          placeholder="Ask about the screen…"
        />
        <button
          onClick={() => {
            if (!text.trim()) return;
            onSendChat(text.trim());
            setText("");
          }}
          disabled={disabled}
          className="bg-sky-500 hover:bg-sky-600 text-sm px-3 py-1 rounded-lg"
        >
          Send
        </button>
      </div>
    </div>
  );
}
