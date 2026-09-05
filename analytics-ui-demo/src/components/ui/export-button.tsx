"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"

interface ExportButtonProps {
  onClick: () => void
  disabled?: boolean
  label?: string
}

/**
 * Hidden export anchor — sits invisibly in the DOM so the Header's
 * "Export Excel" button can find it via [data-export-excel] and trigger
 * the module-specific download logic.  RBAC is enforced by the Header;
 * this component only renders when the user has export access.
 */
export function ExportButton({ onClick, disabled = false }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)
  const { user } = useAuth()

  // Role-based access: only render for admin or users with "export" permission
  const canExport = user?.role === "admin" || user?.permissions?.includes("export")
  if (!canExport) return null

  const handleClick = async () => {
    if (exporting) return
    setExporting(true)
    try {
      await new Promise((r) => setTimeout(r, 50))
      onClick()
    } finally {
      setTimeout(() => setExporting(false), 600)
    }
  }

  return (
    <button
      data-export-excel
      onClick={handleClick}
      disabled={disabled || exporting}
      className="sr-only"
      aria-hidden="true"
      tabIndex={-1}
    />
  )
}
