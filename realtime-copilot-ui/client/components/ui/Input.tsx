import React from "react"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = "", ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`bg-white/5 text-white placeholder-white/50 ring-1 ring-white/10 focus:ring-2 focus:ring-sky-500/60 rounded-xl px-3 py-2 transition-all focus:outline-none ${className}`}
      {...props}
    />
  )
})

Input.displayName = "Input"
export default Input
