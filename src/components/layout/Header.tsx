"use client"

import Link from "next/link"
import { Bell, ChevronDown, User, LogOut, Download } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/contexts/AuthContext"
import { ThemeToggle } from "@/components/theme-toggle"

export default function Header() {
  const { user, logout } = useAuth()

  const handleExportExcel = () => {
    const exportBtn = document.querySelector<HTMLButtonElement>('[data-export-excel]')
    if (exportBtn && !exportBtn.disabled) {
      exportBtn.click()
    }
  }

  return (
    <header className="flex h-16 w-full items-center border-b bg-background px-6">
      {/* Left */}
      <h1 className="text-sm font-semibold text-foreground">
        Dashboard
      </h1>

      {/* Right */}
      <div className="ml-auto flex items-center gap-3">

        {/* Export Button — role-gated */}
        {(user?.role === "admin" || user?.permissions?.includes("export")) && (
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 rounded-md bg-secondary hover:bg-secondary/80 px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors"
          >
            <Download size={16} />
            Export Excel
          </button>
        )}

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <button className="relative rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors hidden md:block">
          <Bell size={18} />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-green-500" />
        </button>

        <div className="h-6 w-px bg-border" />

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 rounded-lg px-2 py-1 bg-accent hover:bg-accent/80 outline-none transition-colors">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted-foreground/50 bg-muted text-muted-foreground">
                <User size={18} />
              </span>
              <div className="text-left leading-tight">
                <p className="text-sm font-medium text-foreground">
                  {user?.name || "Loading..."}
                </p>
                <p className="text-xs text-muted-foreground uppercase">
                  {user?.role || "user"}
                </p>
              </div>
              <ChevronDown size={16} className="text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                <User size={16} />
                <span>My Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
              onClick={logout}
            >
              <LogOut size={16} />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
