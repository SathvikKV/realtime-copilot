"use client"

import { useEffect, useRef } from "react"
import Card from "@/components/ui/Card";

interface Turn {
  role: "user" | "assistant"
  text: string
  ts?: number
}

interface TranscriptProps {
  turns: Turn[]
  collapsed?: boolean
  onToggle?: () => void
}

export default function Transcript({ turns, collapsed = false, onToggle }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turns, collapsed])

  const formatTime = (ts?: number) => {
    if (!ts) return ""
    return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  }

  return (
    <Card className={`flex flex-col overflow-hidden ${collapsed ? "h-10" : "h-56"} transition-all`}>
      {/* Header */}
      <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/90">Transcript</h2>
        <button
          onClick={onToggle}
          className="text-xs text-white/40 hover:text-white/80"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 p-4">
          {turns.length === 0 ? (
            <div className="flex items-center justify-center h-full text-white/40 text-sm">No messages yet</div>
          ) : (
            turns.map((turn, idx) => (
              <div key={idx} className="flex gap-2">
                <div className="flex-shrink-0">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      turn.role === "user" ? "bg-sky-500/20 text-sky-300" : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {turn.role === "user" ? "You" : "AI"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90 break-words">{turn.text}</p>
                  {turn.ts && <p className="text-xs text-white/40 mt-1">{formatTime(turn.ts)}</p>}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(turn.text)}
                  className="flex-shrink-0 text-white/40 hover:text-white/70 transition-colors"
                  title="Copy message"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  )
}
