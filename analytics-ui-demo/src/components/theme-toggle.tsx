"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="
        relative flex h-8 w-8 items-center justify-center rounded-full
        text-muted-foreground
        hover:bg-accent hover:text-accent-foreground
        transition-colors duration-200
      "
    >
      {/* Sun — visible in light mode */}
      <Sun
        size={17}
        className={`
          absolute transition-all duration-300
          ${isDark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}
        `}
      />
      {/* Moon — visible in dark mode */}
      <Moon
        size={17}
        className={`
          absolute transition-all duration-300
          ${isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}
        `}
      />
    </button>
  )
}
