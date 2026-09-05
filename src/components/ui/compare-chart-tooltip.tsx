"use client"

/**
 * Shared Recharts tooltip that shows the CURRENT chart date AND the aligned
 * PREVIOUS-PERIOD date on the same tooltip — matches the Order Metrics pattern.
 *
 * Usage on any page that overlays a compare-period series:
 *   1. Include both `date` and `prev_date` in each chartData row.
 *   2. Pass this as the tooltip content:
 *        <Tooltip content={<CompareChartTooltip />} />
 *
 * Falls back to a plain single-date tooltip when no `prev_date` is present,
 * so pages without a compare overlay behave the same as before.
 */
interface Props {
    active?: boolean
    // Recharts calls tooltip content with the hovered slice's `payload` array.
    payload?: Array<{ name?: string; value?: number | string | null; color?: string; payload?: Record<string, unknown> }>
    label?: string | number
    /** Optional formatter for the numeric value; defaults to toLocaleString. */
    valueFormatter?: (v: number, name?: string) => string
}

export function CompareChartTooltip({ active, payload, label, valueFormatter }: Props) {
    if (!active || !payload || payload.length === 0) return null
    const row = (payload[0]?.payload ?? {}) as Record<string, unknown>
    const currentDate = (row.date as string) ?? (row.fullDate as string) ?? String(label ?? "")
    const prevDate = (row.prev_date as string) ?? (row.prevDate as string) ?? null

    const fmt = (v: unknown, name?: string) => {
        if (v == null) return "—"
        const n = Number(v)
        if (!isFinite(n)) return String(v)
        return valueFormatter ? valueFormatter(n, name) : n?.toLocaleString()
    }

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg rounded-lg p-3 text-xs min-w-[200px]">
            <p className="font-semibold text-gray-800 dark:text-gray-100 mb-1.5">
                {currentDate}
            </p>
            {payload.map((p, i) => {
                if (p.value == null) return null
                return (
                    <div key={i} className="flex items-center justify-between gap-4 py-0.5">
                        <span className="text-gray-500 dark:text-gray-400">{p.name}</span>
                        <span className="font-semibold" style={{ color: p.color }}>
                            {fmt(p.value, p.name)}
                        </span>
                    </div>
                )
            })}
            {prevDate && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700 text-[11px] text-gray-400 dark:text-gray-500">
                    previous-period day: {prevDate}
                </div>
            )}
        </div>
    )
}
