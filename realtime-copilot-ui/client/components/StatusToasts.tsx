"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

interface Toast {
  id: string
  message: string
  type: "info" | "error" | "success"
}

interface StatusToastsProps {
  toasts: Toast[]
}

export default function StatusToasts({ toasts }: StatusToastsProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const toastColors = {
    info: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    error: "bg-red-500/20 text-red-300 border-red-500/40",
    success: "bg-green-500/20 text-green-300 border-green-500/40",
  }

  return createPortal(
    <div className="fixed bottom-4 right-4 space-y-2 pointer-events-none z-50">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-xl border animate-in fade-in slide-in-from-bottom-2 ${toastColors[toast.type]} pointer-events-auto`}
        >
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      ))}
    </div>,
    document.body,
  )
}
