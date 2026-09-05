"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
    ResponsiveContainer, Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Users, TrendingUp, Trophy, AlertTriangle, CalendarRange, Percent, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface CohortDataPoint {
    index: number
    users: number
    rate: number
}

interface CohortRow {
    cohort_month: string
    cohort_size: number
    data: CohortDataPoint[]
}

interface Summary {
    total_cohorts: number
    avg_retention_month_1: number
    best_cohort: { month: string; size: number; month_1_rate: number } | null
    worst_cohort: { month: string; size: number; month_1_rate: number } | null
}

interface CohortResponse {
    cohorts: CohortRow[]
    summary: Summary
    last_updated: string | null
}

// ───── Helpers ─────
function formatMonth(ym: string): string {
    const [y, m] = ym.split("-")
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    return `${months[parseInt(m, 10) - 1]} ${y}`
}

function getHeatmapColor(rate: number): string {
    if (rate >= 75) return "bg-emerald-700 text-white"
    if (rate >= 50) return "bg-emerald-600 text-white"
    if (rate >= 25) return "bg-emerald-500 text-white"
    if (rate >= 10) return "bg-emerald-300 text-emerald-900"
    if (rate > 0)   return "bg-emerald-100 text-emerald-800"
    return "bg-gray-50 text-gray-400"
}

const LINE_COLORS = [
    "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
    "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
    "#06b6d4", "#e11d48",
]

// ───── Custom Chart Tooltip ─────
function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">Month {label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} className="text-gray-600" style={{ color: p.color }}>
                    {p.name}: {p.value}%
                </p>
            ))}
        </div>
    )
}

// ═══════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════




function DeltaLine({ current, previous, kind, lowerIsBetter = false }: {
    current?: number; previous?: number;
    kind: "count" | "currency" | "percent" | "days";
    lowerIsBetter?: boolean;
}) {
    if (current == null || previous == null) return null
    const delta = pctChange(current, previous)
    const isNeutral = delta === 0
    const isPositive = lowerIsBetter ? delta < 0 : delta > 0
    const Icon = isNeutral ? Minus : (delta > 0 ? ArrowUp : ArrowDown)
    const color = isNeutral ? "text-gray-400" : isPositive ? "text-emerald-600" : "text-rose-600"
    const fmtPrev =
        kind === "currency" ? (previous >= 100000 ? `₹${(previous/100000).toFixed(1)}L` : previous >= 1000 ? `₹${(previous/1000).toFixed(1)}K` : `₹${Math.round(previous).toLocaleString()}`) :
        kind === "percent" ? `${previous}%` :
        kind === "days" ? `${previous.toFixed(1)}d` :
        previous.toLocaleString()
    return (
        <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-0.5 font-semibold ${color}`}>
                <Icon size={12} />
                {Math.abs(delta)}%
            </span>
            <span className="text-gray-400">vs {fmtPrev}</span>
        </div>
    )
}

export default function RepeatCohortsPage() {
    const [data, setData] = useState<CohortResponse | null>(null)
    const [loading, setLoading] = useState(true)

    // Default date range: last 12 months
    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<CohortResponse | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    // Convert YYYY-MM-DD to YYYY-MM for API
    const toMonth = (d: string) => d.substring(0, 7)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/repeat-cohorts", {
                    params: {
                        start_month: toMonth(startDate),
                        end_month: toMonth(endDate),
                    },
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load cohort data", e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/repeat-cohorts", {
                    params: { start_date: compare.range!.start, end_date: compare.range!.end }
                })
                if (res.data?.success) setCompareData(res.data.data)
                else setCompareData(null)
            } catch (e) {
                console.error("Failed to load compare data", e)
                setCompareData(null)
            } finally {
                setCompareLoading(false)
            }
        }
        fetchCompare()
    }, [compare.range?.start, compare.range?.end])


    const cohorts = data?.cohorts || []
    const summary = data?.summary || {
        total_cohorts: 0,
        avg_retention_month_1: 0,
        best_cohort: null,
        worst_cohort: null,
    }
    const compareSummary = compareData?.summary || {
        total_cohorts: 0,
        avg_retention_month_1: 0,
        best_cohort: null,
        worst_cohort: null,
    }

    // Determine max cohort index for the heatmap columns
    const maxIndex = cohorts.reduce((max, c) => {
        const cMax = c.data.reduce((m, d) => Math.max(m, d.index), 0)
        return Math.max(max, cMax)
    }, 0)

    // ── Prepare trend chart data ──
    const trendData: Record<string, any>[] = []
    for (let i = 0; i <= maxIndex; i++) {
        const point: Record<string, any> = { index: i }
        cohorts.forEach((c) => {
            const match = c.data.find((d) => d.index === i)
            point[c.cohort_month] = match ? match.rate : null
        })
        trendData.push(point)
    }

    
    

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Repeat Purchase Cohorts
                    </h1>
                    <p className="text-sm text-gray-500">
                        Track customer retention by first-purchase month — how many come back over time
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || cohorts.length === 0}
                        onClick={() => {
                            // Flatten cohort matrix into exportable rows
                            const maxMonth = cohorts.reduce((max, c) => Math.max(max, ...c.data.map(d => d.index)), 0)
                            const cols: ExportColumn[] = [
                                { header: "Cohort Month", key: "cohort_month" },
                                { header: "Cohort Size", key: "cohort_size", format: "number" },
                            ]
                            for (let i = 0; i <= maxMonth; i++) {
                                cols.push({ header: `Month ${i} (%)`, key: `month_${i}`, format: "percent" })
                            }
                            const rows = cohorts.map(c => {
                                const row: Record<string, any> = { cohort_month: c.cohort_month, cohort_size: c.cohort_size }
                                c.data.forEach(d => { row[`month_${d.index}`] = d.rate })
                                return row
                            })
                            exportToExcel(rows, cols, "Repeat_Cohorts", startDate, endDate)
                        }}
                    />
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onChange={(start, end) => { setDates(start, end) }}
                    />
                </div>
            </div>

            {compare.range && (
                <CompareBanner
                    current={{ start: startDate, end: endDate }}
                    compare={compare.range}
                    mode={compare.mode}
                />
            )}
            {compare.range && (
                <CompareSummary
                    endpoint="/api/repeat-cohorts"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Repeat Cohorts — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Avg Month-1 Retention — Hero */}
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Avg Month-1 Retention
                            <Percent className="h-4 w-4 text-emerald-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-emerald-700">
                            {loading ? "—" : `${summary.avg_retention_month_1}%`}
                        </div>
                        <p className="text-xs text-emerald-500/70 mt-1">
                            average across all cohorts
                        </p>
                    
                    <DeltaLine current={summary?.avg_retention_month_1} previous={compareSummary?.avg_retention_month_1} kind="percent" />
                    </CardContent>
                </Card>

                {/* Total Cohorts */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-gray-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Cohorts
                            <CalendarRange className="h-4 w-4 text-gray-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-gray-800">
                            {loading ? "—" : summary?.total_cohorts}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            monthly cohorts tracked
                        </p>
                    
                    <DeltaLine current={summary?.total_cohorts} previous={compareSummary?.total_cohorts} kind="count" />
                    </CardContent>
                </Card>

                {/* Best Cohort */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Best Cohort
                            <Trophy className="h-4 w-4 text-emerald-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-3xl font-extrabold text-gray-800">—</div>
                        ) : summary.best_cohort ? (
                            <>
                                <div className="text-2xl font-extrabold text-emerald-700">
                                    {formatMonth(summary.best_cohort.month)}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    {summary.best_cohort.month_1_rate}% month-1 retention · {summary.best_cohort.size.toLocaleString()} customers
                                </p>
                            </>
                        ) : (
                            <div className="text-sm text-gray-400">No data</div>
                        )}
                    
                    
                    </CardContent>
                </Card>

                {/* Worst Cohort */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Worst Cohort
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-3xl font-extrabold text-gray-800">—</div>
                        ) : summary.worst_cohort ? (
                            <>
                                <div className="text-2xl font-extrabold text-amber-600">
                                    {formatMonth(summary.worst_cohort.month)}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    {summary.worst_cohort.month_1_rate}% month-1 retention · {summary.worst_cohort.size.toLocaleString()} customers
                                </p>
                            </>
                        ) : (
                            <div className="text-sm text-gray-400">No data</div>
                        )}
                    
                    
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Insight Card ═══════ */}
            {!loading && data && summary.best_cohort && summary.worst_cohort && (
                <Card className="shadow-sm border bg-gradient-to-r from-gray-50 to-white">
                    <CardContent className="py-5">
                        <div className="flex items-start gap-3">
                            <div className="bg-emerald-100 rounded-full p-2 shrink-0">
                                <TrendingUp className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-1">
                                    Cohort Insights
                                </h3>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    Across <strong>{summary.total_cohorts}</strong> cohorts, the average month-1 retention is{" "}
                                    <strong className="text-emerald-700">{summary.avg_retention_month_1}%</strong>.
                                    The best-performing cohort is{" "}
                                    <strong className="text-emerald-700">{formatMonth(summary.best_cohort.month)}</strong>{" "}
                                    ({summary.best_cohort.month_1_rate}% retention), while{" "}
                                    <strong className="text-amber-600">{formatMonth(summary.worst_cohort.month)}</strong>{" "}
                                    had the lowest at {summary.worst_cohort.month_1_rate}%.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ═══════ Cohort Heatmap Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-500" />
                        Cohort Retention Heatmap
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                            Loading heatmap…
                        </div>
                    ) : cohorts.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                            No cohort data available
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr>
                                        <th className="text-left px-3 py-2 bg-gray-50 font-semibold text-gray-600 border border-gray-200 whitespace-nowrap sticky left-0 z-10">
                                            Cohort
                                        </th>
                                        <th className="px-3 py-2 bg-gray-50 font-semibold text-gray-600 border border-gray-200 whitespace-nowrap text-center">
                                            Size
                                        </th>
                                        {Array.from({ length: maxIndex + 1 }, (_, i) => (
                                            <th
                                                key={i}
                                                className="px-3 py-2 bg-gray-50 font-semibold text-gray-600 border border-gray-200 whitespace-nowrap text-center min-w-[72px]"
                                            >
                                                M{i}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cohorts.map((cohort) => {
                                        const rateMap = new Map(
                                            cohort.data.map((d) => [d.index, d])
                                        )
                                        return (
                                            <tr key={cohort.cohort_month} className="hover:bg-gray-50/50">
                                                <td className="px-3 py-2 font-medium text-gray-800 border border-gray-200 whitespace-nowrap sticky left-0 bg-white z-10">
                                                    {formatMonth(cohort.cohort_month)}
                                                </td>
                                                <td className="px-3 py-2 text-center font-semibold text-gray-700 border border-gray-200">
                                                    {cohort.cohort_size.toLocaleString()}
                                                </td>
                                                {Array.from({ length: maxIndex + 1 }, (_, i) => {
                                                    const dp = rateMap.get(i)
                                                    if (!dp) {
                                                        return (
                                                            <td
                                                                key={i}
                                                                className="px-3 py-2 text-center border border-gray-200 bg-gray-50 text-gray-300"
                                                            >
                                                                —
                                                            </td>
                                                        )
                                                    }
                                                    return (
                                                        <td
                                                            key={i}
                                                            className={`px-3 py-2 text-center border border-gray-200 font-medium transition-colors ${getHeatmapColor(dp.rate)}`}
                                                            title={`${dp.users.toLocaleString()} customers (${dp.rate}%)`}
                                                        >
                                                            {dp.rate}%
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {/* Heatmap Legend */}
                    {!loading && cohorts.length > 0 && (
                        <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
                            <span>Low</span>
                            <div className="flex gap-0.5">
                                <div className="w-6 h-4 rounded-sm bg-emerald-100" />
                                <div className="w-6 h-4 rounded-sm bg-emerald-300" />
                                <div className="w-6 h-4 rounded-sm bg-emerald-500" />
                                <div className="w-6 h-4 rounded-sm bg-emerald-600" />
                                <div className="w-6 h-4 rounded-sm bg-emerald-700" />
                            </div>
                            <span>High</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Retention Trend Chart ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-gray-500" />
                        Retention Curve by Cohort
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 text-sm">
                            Loading chart…
                        </div>
                    ) : cohorts.length === 0 ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 text-sm">
                            No data available
                        </div>
                    ) : (
                        <div className="h-80 w-full" style={{ minHeight: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="index"
                                        tick={{ fontSize: 12 }}
                                        tickFormatter={(v) => `M${v}`}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 12 }}
                                        tickFormatter={(v) => `${v}%`}
                                        domain={[0, 100]}
                                    />
                                    <ReTooltip content={<ChartTooltip />} />
                                    <Legend
                                        verticalAlign="bottom"
                                        iconType="circle"
                                        iconSize={8}
                                        formatter={(value: string) => (
                                            <span className="text-xs text-gray-600">
                                                {formatMonth(value)}
                                            </span>
                                        )}
                                    />
                                    {cohorts.slice(0, 12).map((c, idx) => (
                                        <Line
                                            key={c.cohort_month}
                                            type="monotone"
                                            dataKey={c.cohort_month}
                                            stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                                            strokeWidth={2}
                                            dot={{ r: 3 }}
                                            connectNulls={false}
                                            name={c.cohort_month}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Detailed Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <CalendarRange className="h-4 w-4 text-gray-500" />
                        Detailed Cohort Breakdown
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                            Loading…
                        </div>
                    ) : cohorts.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                            No data available
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left px-3 py-2 font-semibold text-gray-600">Cohort Month</th>
                                        <th className="text-center px-3 py-2 font-semibold text-gray-600">Month Index</th>
                                        <th className="text-center px-3 py-2 font-semibold text-gray-600">Cohort Size</th>
                                        <th className="text-center px-3 py-2 font-semibold text-gray-600">Repeat Customers</th>
                                        <th className="text-center px-3 py-2 font-semibold text-gray-600">Retention Rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cohorts.flatMap((cohort) =>
                                        cohort.data.map((dp) => (
                                            <tr
                                                key={`${cohort.cohort_month}-${dp.index}`}
                                                className="border-b border-gray-100 hover:bg-gray-50"
                                            >
                                                <td className="px-3 py-2 font-medium text-gray-800">
                                                    {formatMonth(cohort.cohort_month)}
                                                </td>
                                                <td className="px-3 py-2 text-center text-gray-600">
                                                    {dp.index === 0 ? "Same month" : `Month ${dp.index}`}
                                                </td>
                                                <td className="px-3 py-2 text-center text-gray-700 font-medium">
                                                    {cohort.cohort_size.toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2 text-center text-gray-700">
                                                    {dp.users.toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        dp.rate >= 50
                                                            ? "bg-emerald-100 text-emerald-700"
                                                            : dp.rate >= 20
                                                            ? "bg-yellow-100 text-yellow-700"
                                                            : "bg-red-100 text-red-700"
                                                    }`}>
                                                        {dp.rate}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    )
}
