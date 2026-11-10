"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  // Tránh hydration mismatch: next-themes chỉ biết theme thật sau khi mount ở client
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const isDark = mounted ? resolvedTheme === "dark" : true

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        "h-9 w-9 rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-all duration-300",
        isDark
          ? "shadow-sm shadow-primary/20"
          : "shadow-sm"
      )}
      aria-label="Chuyển chế độ sáng/tối"
      title={isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
    >
      <Sun className="h-5 w-5 text-primary rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 text-foreground/80 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}
