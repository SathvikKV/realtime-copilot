"use client"

import React from "react"

interface ToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean
  onPressedChange?: (pressed: boolean) => void
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className = "", pressed = false, onPressedChange, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const newPressed = !pressed
      onPressedChange?.(newPressed)
      onClick?.(e)
    }

    return (
      <button
        ref={ref}
        aria-pressed={pressed}
        onClick={handleClick}
        className={`rounded-xl px-4 py-2 font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 ${
          pressed
            ? "bg-sky-600 text-white ring-1 ring-sky-400/40"
            : "bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/10"
        } ${className}`}
        {...props}
      />
    )
  },
)

Toggle.displayName = "Toggle"
export default Toggle
