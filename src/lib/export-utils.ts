/**
 * Excel Export Utility
 * 
 * Shared helper for exporting tabular data to .xlsx files.
 * Uses SheetJS (xlsx) for client-side generation — no backend required.
 */

import * as XLSX from "xlsx"

/** Column definition for export */
export interface ExportColumn {
  header: string
  key: string
  /** Optional formatter: "currency", "percent", "number", or a custom function */
  format?: "currency" | "percent" | "number" | ((value: any) => string | number)
}

/**
 * Format a value for Excel based on its format type.
 */
function formatValue(value: any, format?: ExportColumn["format"]): string | number {
  if (value === null || value === undefined) return ""

  if (typeof format === "function") {
    return format(value)
  }

  switch (format) {
    case "currency":
      return typeof value === "number"
        ? Math.round(value * 100) / 100
        : value
    case "percent":
      return typeof value === "number"
        ? `${value}%`
        : value
    case "number":
      return typeof value === "number"
        ? Math.round(value * 100) / 100
        : value
    default:
      return value
  }
}

/**
 * Export data to an .xlsx file and trigger a browser download.
 *
 * @param rows       Array of data objects (each object = one row)
 * @param columns    Column definitions (header label, data key, optional format)
 * @param metricName Human-readable metric name (used in filename and sheet name)
 * @param startDate  Start date string (YYYY-MM-DD)
 * @param endDate    End date string (YYYY-MM-DD)
 */
export function exportToExcel(
  rows: Record<string, any>[],
  columns: ExportColumn[],
  metricName: string,
  startDate?: string,
  endDate?: string
): void {
  if (!rows.length) return

  // Build header row
  const headers = columns.map((col) => col.header)

  // Build data rows with formatting
  const dataRows = rows.map((row) =>
    columns.map((col) => formatValue(row[col.key], col.format))
  )

  // Combine headers + data
  const sheetData = [headers, ...dataRows]

  // Create worksheet and workbook
  const ws = XLSX.utils.aoa_to_sheet(sheetData)

  // Auto-size columns based on content
  const colWidths = columns.map((col, idx) => {
    const maxDataLen = dataRows.reduce((max, row) => {
      const cellLen = String(row[idx] ?? "").length
      return Math.max(max, cellLen)
    }, 0)
    return { wch: Math.max(col.header.length, maxDataLen) + 2 }
  })
  ws["!cols"] = colWidths

  const wb = XLSX.utils.book_new()
  const safeSheetName = metricName.replace(/[\\/?*[\]]/g, "").slice(0, 31)
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName)

  // Generate filename: Metric_Name_2026-04-07_to_2026-05-07.xlsx
  const safeName = metricName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")
  const datePart = startDate && endDate ? `_${startDate}_to_${endDate}` : `_${new Date().toISOString().split("T")[0]}`
  const fileName = `${safeName}${datePart}.xlsx`

  // Trigger download
  XLSX.writeFile(wb, fileName)
}
