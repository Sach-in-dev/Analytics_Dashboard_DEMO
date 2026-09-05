"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import { ArrowUp, ArrowDown, Minus, GitCompareArrows } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { pctChange, CompareRange } from "@/hooks/use-compare-range"

interface FieldSpec {
    key: string
    label?: string
    format?: "currency" | "percent" | "days" | "count"
    lowerIsBetter?: boolean
}

interface Props {
    endpoint: string
    currentRange: CompareRange
    compareRange: CompareRange | null
    /** Optional explicit field list. If omitted, every numeric key in summary is shown. */
    fields?: FieldSpec[]
    /** Card title override. */
    title?: string
}

const fmtCurrency = (v: number) => {
    if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
    if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`
    if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`
    return `₹${Math.round(v).toLocaleString()}`
}
const fmtCount = (v: number) => v.toLocaleString()
const fmtPercent = (v: number) => `${v}%`
const fmtDays = (v: number) => `${v.toFixed(1)}d`

const renderValue = (v: number, format: FieldSpec["format"]) => {
    switch (format) {
        case "currency": return fmtCurrency(v)
        case "percent":  return fmtPercent(v)
        case "days":     return fmtDays(v)
        default:         return fmtCount(v)
    }
}

/** Signed absolute change, e.g. "+2,500" / "−₹1.2L" — the counterpart to the % delta. */
const renderSignedDelta = (cur: number, prev: number, format: FieldSpec["format"]) => {
    const diff = cur - prev
    const sign = diff > 0 ? "+" : diff < 0 ? "−" : ""
    return `${sign}${renderValue(Math.abs(diff), format)}`
}

const prettyLabel = (key: string) =>
    key.replace(/[_]/g, " ").replace(/\b\w/g, c => c.toUpperCase())

/**
 * Pull a flat map of numeric metrics from any endpoint response.
 * Order of preference:
 *   1. `data.summary` numeric leaves (most endpoints)
 *   2. top-level numeric leaves on `data` itself (flat endpoints like RPR)
 *   3. numeric leaves one level deep inside nested objects
 *      (e.g. funnel's `totals` / `rates`) — keyed by their own field name,
 *      with parent prefix only if the key would collide.
 * Arrays are skipped (list endpoints don't have a comparable scalar summary).
 */
function extractNumericSummary(data: any): Record<string, number> | null {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    const root = (data.summary && typeof data.summary === "object" && !Array.isArray(data.summary))
        ? data.summary
        : data

    const out: Record<string, number> = {}
    // 1+2. top-level numeric leaves
    for (const [k, v] of Object.entries(root)) {
        if (typeof v === "number" && isFinite(v)) out[k] = v
    }
    // 3. one level deep into nested plain objects
    for (const [pk, pv] of Object.entries(root)) {
        if (pv && typeof pv === "object" && !Array.isArray(pv)) {
            for (const [k, v] of Object.entries(pv as Record<string, any>)) {
                if (typeof v === "number" && isFinite(v)) {
                    const key = out[k] !== undefined ? `${pk}_${k}` : k
                    out[key] = v as number
                }
            }
        }
    }
    return Object.keys(out).length ? out : null
}

const guessFormat = (key: string): FieldSpec["format"] => {
    const k = key.toLowerCase()
    if (/(rate|pct|percent|share)/.test(k)) return "percent"
    if (/(revenue|gmv|spend|amount|cac|cost|cpc|cpm|aov|ltv|value|total|payout|salary|loss)/.test(k)) return "currency"
    if (/(days|time)/.test(k)) return "days"
    return "count"
}

const guessLowerIsBetter = (key: string) => {
    const k = key.toLowerCase()
    return /(failure|failed|cac|cost|discount|drop|delay|rto|return|cancel|loss|delivery_time|abandon|bounce)/.test(k)
}

/**
 * Drop-in compare card. Reads the same endpoint twice (current + compare ranges)
 * and renders a horizontal strip of metric deltas. Renders nothing when no
 * comparison is active. Backend-agnostic — works with any endpoint whose
 * response shape is { data: { summary: { ...numeric fields... } } }.
 */
export function CompareSummary({ endpoint, currentRange, compareRange, fields, title = "Period Comparison" }: Props) {
    const [curSummary, setCurSummary] = useState<Record<string, any> | null>(null)
    const [prevSummary, setPrevSummary] = useState<Record<string, any> | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!compareRange) {
            setCurSummary(null)
            setPrevSummary(null)
            return
        }
        const ctrl = new AbortController()
        const fetchBoth = async () => {
            try {
                setLoading(true)
                const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
                const headers = token ? { Authorization: `Bearer ${token}` } : {}
                const [a, b] = await Promise.all([
                    axios.get(endpoint, {
                        params: { start_date: currentRange.start, end_date: currentRange.end },
                        signal: ctrl.signal,
                        headers,
                    }),
                    axios.get(endpoint, {
                        params: { start_date: compareRange.start, end_date: compareRange.end },
                        signal: ctrl.signal,
                        headers,
                    }),
                ])
                // Prefer an explicit meta.summary (used by list/array endpoints
                // whose `data` is an array) then fall back to the data payload.
                const pick = (r: any) => r?.data?.meta?.summary ?? r?.data?.data
                setCurSummary(extractNumericSummary(pick(a)))
                setPrevSummary(extractNumericSummary(pick(b)))
            } catch (e) {
                if (!axios.isCancel(e)) console.error(`[CompareSummary] fetch failed for ${endpoint}`, e)
            } finally {
                setLoading(false)
            }
        }
        fetchBoth()
        return () => ctrl.abort()
    }, [endpoint, currentRange.start, currentRange.end, compareRange?.start, compareRange?.end])

    if (!compareRange) return null

    const resolvedFields: FieldSpec[] = (() => {
        if (fields && fields.length) return fields
        if (!curSummary) return []
        return Object.keys(curSummary)
            .filter(k => typeof curSummary[k] === "number")
            .map(k => ({
                key: k,
                label: prettyLabel(k),
                format: guessFormat(k),
                lowerIsBetter: guessLowerIsBetter(k),
            }))
    })()

    return (
        <Card className="shadow-sm border-blue-100 dark:border-blue-900">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                    <GitCompareArrows className="h-4 w-4 text-blue-500" />
                    {title}
                    {loading && <span className="text-xs text-blue-400 font-normal ml-2 animate-pulse">loading…</span>}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {!curSummary || !prevSummary ? (
                    <div className="text-xs text-gray-400 py-4 text-center">
                        {loading ? "Fetching comparison…" : "No comparison data."}
                    </div>
                ) : resolvedFields.length === 0 ? (
                    <div className="text-xs text-gray-400 py-4 text-center">
                        No numeric fields detected.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {resolvedFields.map(f => {
                            const cur = Number(curSummary[f.key])
                            const prev = Number(prevSummary[f.key])
                            if (!isFinite(cur) || !isFinite(prev)) return null
                            const delta = pctChange(cur, prev)
                            const neutral = delta === 0
                            const positive = f.lowerIsBetter ? delta < 0 : delta > 0
                            const Icon = neutral ? Minus : (delta > 0 ? ArrowUp : ArrowDown)
                            const color = neutral ? "text-gray-400" : positive ? "text-emerald-600" : "text-rose-600"
                            return (
                                <div key={f.key} className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700">
                                    <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold truncate">
                                        {f.label ?? prettyLabel(f.key)}
                                    </div>
                                    <div className="mt-1 text-base font-bold text-gray-800 dark:text-gray-100">
                                        {renderValue(cur, f.format)}
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-1 text-[11px]">
                                        <span className={`inline-flex items-center gap-0.5 font-semibold ${color}`}>
                                            <Icon size={10} />
                                            {renderSignedDelta(cur, prev, f.format)} ({Math.abs(delta)}%)
                                        </span>
                                        <span className="text-gray-400 truncate">
                                            vs {renderValue(prev, f.format)}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
