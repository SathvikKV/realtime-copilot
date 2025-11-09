import React from "react"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className = "", children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={`bg-white/5 ring-1 ring-white/10 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
})

Card.displayName = "Card"
export default Card
