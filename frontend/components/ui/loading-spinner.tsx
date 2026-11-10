import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface LoadingSpinnerProps {
  size?: "sm" | "default" | "lg"
  text?: string
  className?: string
}

export function LoadingSpinner({ size = "default", text, className }: LoadingSpinnerProps) {
  const sizeMap = {
    sm: "h-4 w-4",
    default: "h-8 w-8",
    lg: "h-12 w-12"
  }
  
  return (
    <div className={cn("flex flex-col items-center justify-center py-8", className)}>
      <Loader2 className={cn(sizeMap[size], "animate-spin text-primary")} />
      {text && <p className="mt-3 text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner size="lg" text="Đang tải..." />
    </div>
  )
}

export function InlineLoader({ text }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </div>
  )
}
