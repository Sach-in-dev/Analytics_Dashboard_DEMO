"use client"

import { useMemo, useState } from "react"
import { GitCompareArrows, X } from "lucide-react"
import {
    CompareMode,
    CompareRange,
    addDays,
    daysBetween,
    COMPARE_MODE_META,
} from "@/hooks/use-compare-range"

// Order shown in the picker. "off" and "custom" bookend the period shifts.
const COMPARE_MODE_ORDER: CompareMode[] = [
    "off", "standard", "dod", "wow", "mom", "qoq", "yoy",
    "p7d", "p30d", "p90d", "ttm", "custom",
]

interface CompareControlProps {
    mode: CompareMode
    onModeChange: (m: CompareMode) => void
    range: CompareRange | null
    customStart: string
    customEnd: string
    onCustomChange: (start: string, end: string) => void
    currentRange: CompareRange
}

/**
 * Popover button shown beside the date picker. Lets the user toggle
 * comparison off / standard / custom and pick custom dates.
 */
export function CompareControl({
    mode,
    onModeChange,
    range,
    customStart,
    customEnd,
    onCustomChange,
    currentRange,
}: CompareControlProps) {
    const [open, setOpen] = useState(false)
    const yesterdayStr = (() => {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        return d.toISOString().split("T")[0]
    })()

    const suggestedCustom = useMemo(() => {
        const span = daysBetween(currentRange.start, currentRange.end)
        const end = addDays(currentRange.start, -1)
        const start = addDays(end, -span)
        return { start, end }
    }, [currentRange.start, currentRange.end])

    const label = COMPARE_MODE_META[mode].button

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-2 border rounded-lg px-4 py-2 text-sm font-medium transition ${
                    mode === "off"
                        ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                        : "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                }`}
            >
                <GitCompareArrows size={14} />
                <span>{label}</span>
                {mode !== "off" && range && (
                    <span className="hidden md:inline text-xs text-blue-500">
                        · {range.start.slice(5)} → {range.end.slice(5)}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 z-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Compare to
                        </h4>
                        {mode !== "off" && (
                            <button
                                onClick={() => { onModeChange("off"); setOpen(false) }}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            >
                                <X size={12} /> clear
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        {COMPARE_MODE_ORDER.map(m => (
                            <button
                                key={m}
                                onClick={() => onModeChange(m)}
                                className={`text-xs font-medium px-2 py-2 rounded-md border transition ${
                                    mode === m
                                        ? "bg-blue-600 text-white border-blue-600"
                                        : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                                }`}
                            >
                                {COMPARE_MODE_META[m].short}
                            </button>
                        ))}
                    </div>

                    {mode !== "off" && mode !== "custom" && range && (
                        <div className="bg-blue-50/50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-800 rounded-md px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                            <div className="font-medium">{COMPARE_MODE_META[mode].hint}:</div>
                            <div className="mt-1">{range.start} → {range.end}</div>
                        </div>
                    )}

                    {mode === "custom" && (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block">
                                    Compare start
                                </label>
                                <input
                                    type="date"
                                    max={yesterdayStr}
                                    className="w-full border border-gray-200 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                                    value={customStart || suggestedCustom.start}
                                    onChange={e => onCustomChange(e.target.value, customEnd || suggestedCustom.end)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block">
                                    Compare end
                                </label>
                                <input
                                    type="date"
                                    max={yesterdayStr}
                                    className="w-full border border-gray-200 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                                    value={customEnd || suggestedCustom.end}
                                    onChange={e => onCustomChange(customStart || suggestedCustom.start, e.target.value)}
                                />
                            </div>
                            {!customStart && !customEnd && (
                                <p className="text-[11px] text-gray-400">
                                    Defaults to {suggestedCustom.start} → {suggestedCustom.end} (preceding period)
                                </p>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                className="w-full mt-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-md transition shadow-sm"
                            >
                                Apply
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/**
 * Small banner shown under the page header when a comparison is active.
 */
export function CompareBanner({
    current,
    compare,
    mode,
    loading,
}: {
    current: CompareRange
    compare: CompareRange
    mode: CompareMode
    loading?: boolean
}) {
    return (
        <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-blue-700 dark:text-blue-300">
            <GitCompareArrows size={14} />
            <span>
                <span className="font-semibold">Comparing</span> {current.start} → {current.end}{" "}
                <span className="text-blue-500">vs</span>{" "}
                <span className="font-semibold">{compare.start} → {compare.end}</span>{" "}
                <span className="text-blue-400">({COMPARE_MODE_META[mode].hint})</span>
                {loading && <span className="ml-2 text-blue-400 animate-pulse">loading…</span>}
            </span>
        </div>
    )
}
