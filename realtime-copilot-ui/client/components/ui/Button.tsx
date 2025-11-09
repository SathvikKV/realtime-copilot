import React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive"
  size?: "sm" | "md" | "lg"
  isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", isLoading = false, disabled, children, ...props }, ref) => {
    const baseClasses =
      "rounded-xl font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 disabled:opacity-50 disabled:cursor-not-allowed"

    const variantClasses = {
      primary: "bg-sky-600 hover:bg-sky-500 text-white ring-1 ring-sky-400/40 active:bg-sky-700",
      secondary: "bg-white/5 hover:bg-white/10 text-white ring-1 ring-white/10 active:bg-white/20",
      destructive: "bg-rose-600 hover:bg-rose-500 text-white ring-1 ring-rose-400/40 active:bg-rose-700",
    }

    const sizeClasses = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-base",
      lg: "px-6 py-3 text-lg",
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    )
  },
)

Button.displayName = "Button"
export default Button
