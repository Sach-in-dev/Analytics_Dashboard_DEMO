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
    TrendingUp, DollarSign, Trophy, Zap, CalendarRange, Users, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface CohortDataPoint {
    index: number
    revenue: number
    cumulative_revenue: number
    avg_ltv: number
}

interface CohortRow {
    cohort_month: string
    cohort_size: number
    data: CohortDataPoint[]
}

interface Summary {
    total_cohorts: number
    total_revenue: number
    avg_ltv: number
    best_cohort: { month: string; size: number; avg_ltv: number; cumulative_revenue: number } | null
    fastest_growing: { month: string; size: number; m0_revenue: number; m1_revenue: number; growth_pct: number } | null
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

function formatCurrency(value: number): string {
    if (typeof value !== "number" || isNaN(value)) return "₹0";
    if (value >= 10000000) return `₹${(value / 10000000)?.toFixed(2)}Cr`
    if (value >= 100000) return `₹${(value / 100000)?.toFixed(2)}L`
    if (value >= 1000) return `₹${(value / 1000)?.toFixed(1)}K`
    return `₹${value?.toFixed(0)}`
}

function getRevenueHeatmapColor(value: number, maxVal: number): string {
    if (maxVal === 0) return "bg-gray-50 text-gray-400"
    const pct = (value / maxVal) * 100
    if (pct >= 75) return "bg-blue-700 text-white"
    if (pct >= 50) return "bg-blue-600 text-white"
    if (pct >= 25) return "bg-blue-400 text-white"
    if (pct >= 10) return "bg-blue-200 text-blue-900"
    if (pct > 0)   return "bg-blue-100 text-blue-800"
    return "bg-gray-50 text-gray-400"
}

const LINE_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
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
                    {p.name}: {formatCurrency(p.value)}
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
        kind === "currency" ? (previous >= 100000 ? `₹${(previous/100000)?.toFixed(1)}L` : previous >= 1000 ? `₹${(previous/1000)?.toFixed(1)}K` : `₹${Math.round(previous)?.toLocaleString()}`) :
        kind === "percent" ? `${previous}%` :
        kind === "days" ? `${previous?.toFixed(1)}d` :
        previous?.toLocaleString()
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

export default function LifetimeCohortsPage() {
    const [data, setData] = useState<CohortResponse | null>(null)
    const [loading, setLoading] = useState(true)

    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<CohortResponse | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    const toMonth = (d: string) => d.substring(0, 7)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/lifetime-cohorts", {
                    params: {
                        start_month: toMonth(startDate),
                        end_month: toMonth(endDate),
                    },
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load lifetime cohort data", e)
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
                const res = await axios.get("/api/lifetime-cohorts", {
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
        total_revenue: 0,
        avg_ltv: 0,
        best_cohort: null,
        fastest_growing: null,
    }
    const compareSummary = compareData?.summary || {
        total_cohorts: 0,
        total_revenue: 0,
        avg_ltv: 0,
        best_cohort: null,
        fastest_growing: null,
    }

    const maxIndex = cohorts.reduce((max, c) => {
        const cMax = c.data.reduce((m, d) => Math.max(m, d.index), 0)
        return Math.max(max, cMax)
    }, 0)

    // Max revenue value for heatmap color scaling
    const maxRevenue = cohorts.reduce((max, c) => {
        const cMax = c.data.reduce((m, d) => Math.max(m, d.revenue), 0)
        return Math.max(max, cMax)
    }, 0)

    // ── Prepare cumulative LTV chart data ──
    const ltvTrendData: Record<string, any>[] = []
    for (let i = 0; i <= maxIndex; i++) {
        const point: Record<string, any> = { index: i }
        cohorts.forEach((c) => {
            const match = c.data.find((d) => d.index === i)
            point[c.cohort_month] = match ? match.avg_ltv : null
        })
        ltvTrendData.push(point)
    }

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Customer Lifetime Cohorts
                    </h1>
                    <p className="text-sm text-gray-500">
                        Track revenue growth over customer lifecycle — how value evolves after acquisition
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || cohorts.length === 0}
                        onClick={() => {
                            const maxMonth = cohorts.reduce((max, c) => Math.max(max, ...c.data.map(d => d.index)), 0)
                            const cols: ExportColumn[] = [
                                { header: "Cohort Month", key: "cohort_month" },
                                { header: "Cohort Size", key: "cohort_size", format: "number" },
                            ]
                            for (let i = 0; i <= maxMonth; i++) {
                                cols.push({ header: `Month ${i} Revenue (₹)`, key: `month_${i}_rev`, format: "currency" })
                                cols.push({ header: `Month ${i} Cumulative (₹)`, key: `month_${i}_cum`, format: "currency" })
                            }
                            const rows = cohorts.map(c => {
                                const row: Record<string, any> = { cohort_month: c.cohort_month, cohort_size: c.cohort_size }
                                c.data.forEach(d => {
                                    row[`month_${d.index}_rev`] = d.revenue
                                    row[`month_${d.index}_cum`] = d.cumulative_revenue
                                })
                                return row
                            })
                            exportToExcel(rows, cols, "Lifetime_Cohorts", startDate, endDate)
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
                    endpoint="/api/lifetime-cohorts"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Lifetime Cohorts — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Revenue — Hero */}
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-sm border-l-4 border-l-blue-600">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Revenue
                            <DollarSign className="h-4 w-4 text-blue-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-blue-700">
                            {loading ? "—" : formatCurrency(summary?.total_revenue || 0)}
                        </div>
                        <p className="text-xs text-blue-500/70 mt-1">
                            across all cohorts
                        </p>
                    
                    <DeltaLine current={summary?.total_revenue} previous={compareSummary?.total_revenue} kind="currency" />
                    </CardContent>
                </Card>

                {/* Avg LTV */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Avg LTV
                            <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-emerald-700">
                            {loading ? "—" : formatCurrency(summary?.avg_ltv || 0)}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            per customer overall
                        </p>
                    
                    <DeltaLine current={summary?.avg_ltv} previous={compareSummary?.avg_ltv} kind="currency" />
                    </CardContent>
                </Card>

                {/* Best Cohort */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Highest LTV Cohort
                            <Trophy className="h-4 w-4 text-blue-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-3xl font-extrabold text-gray-800">—</div>
                        ) : summary.best_cohort ? (
                            <>
                                <div className="text-2xl font-extrabold text-blue-700">
                                    {formatMonth(summary.best_cohort.month)}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    {formatCurrency(summary.best_cohort.avg_ltv)} avg LTV · {summary.best_cohort.size?.toLocaleString()} customers
                                </p>
                            </>
                        ) : (
                            <div className="text-sm text-gray-400">No data</div>
                        )}
                    
                    
                    </CardContent>
                </Card>

                {/* Fastest Growing */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Fastest Growing
                            <Zap className="h-4 w-4 text-amber-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-3xl font-extrabold text-gray-800">—</div>
                        ) : summary.fastest_growing ? (
                            <>
                                <div className="text-2xl font-extrabold text-amber-600">
                                    {formatMonth(summary.fastest_growing.month)}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    {summary.fastest_growing.growth_pct}% M0→M1 growth · {summary.fastest_growing.size?.toLocaleString()} customers
                                </p>
                            </>
                        ) : (
                            <div className="text-sm text-gray-400">No data</div>
                        )}
                    

                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Insight Card ═══════ */}
            {!loading && data && summary.best_cohort && (
                <Card className="shadow-sm border bg-gradient-to-r from-gray-50 to-white">
                    <CardContent className="py-5">
                        <div className="flex items-start gap-3">
                            <div className="bg-blue-100 rounded-full p-2 shrink-0">
                                <TrendingUp className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-1">
                                    Lifetime Value Insights
                                </h3>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    Across <strong>{summary.total_cohorts}</strong> cohorts, total lifetime revenue is{" "}
                                    <strong className="text-blue-700">{formatCurrency(summary.total_revenue)}</strong> with
                                    an average LTV of <strong className="text-emerald-700">{formatCurrency(summary.avg_ltv)}</strong> per customer.
                                    The highest-value cohort is{" "}
                                    <strong className="text-blue-700">{formatMonth(summary.best_cohort.month)}</strong>{" "}
                                    ({formatCurrency(summary.best_cohort.avg_ltv)} avg LTV).
                                    {summary.fastest_growing && (
                                        <> The fastest growing is{" "}
                                        <strong className="text-amber-600">{formatMonth(summary.fastest_growing.month)}</strong>{" "}
                                        ({summary.fastest_growing.growth_pct}% M0→M1 revenue growth).</>
                                    )}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ═══════ Revenue Heatmap Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-500" />
                        Cohort Revenue Heatmap
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
                                                className="px-3 py-2 bg-gray-50 font-semibold text-gray-600 border border-gray-200 whitespace-nowrap text-center min-w-[80px]"
                                            >
                                                M{i}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cohorts.map((cohort) => {
                                        const revMap = new Map(
                                            cohort.data.map((d) => [d.index, d])
                                        )
                                        return (
                                            <tr key={cohort.cohort_month} className="hover:bg-gray-50/50">
                                                <td className="px-3 py-2 font-medium text-gray-800 border border-gray-200 whitespace-nowrap sticky left-0 bg-white z-10">
                                                    {formatMonth(cohort.cohort_month)}
                                                </td>
                                                <td className="px-3 py-2 text-center font-semibold text-gray-700 border border-gray-200">
                                                    {cohort.cohort_size?.toLocaleString()}
                                                </td>
                                                {Array.from({ length: maxIndex + 1 }, (_, i) => {
                                                    const dp = revMap.get(i)
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
                                                            className={`px-3 py-2 text-center border border-gray-200 font-medium text-xs transition-colors ${getRevenueHeatmapColor(dp.revenue, maxRevenue)}`}
                                                            title={`Revenue: ${formatCurrency(dp.revenue)} | Cumulative: ${formatCurrency(dp.cumulative_revenue)} | Avg LTV: ${formatCurrency(dp.avg_ltv)}`}
                                                        >
                                                            {formatCurrency(dp.revenue)}
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
                    {!loading && cohorts.length > 0 && (
                        <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
                            <span>Low</span>
                            <div className="flex gap-0.5">
                                <div className="w-6 h-4 rounded-sm bg-blue-100" />
                                <div className="w-6 h-4 rounded-sm bg-blue-200" />
                                <div className="w-6 h-4 rounded-sm bg-blue-400" />
                                <div className="w-6 h-4 rounded-sm bg-blue-600" />
                                <div className="w-6 h-4 rounded-sm bg-blue-700" />
                            </div>
                            <span>High</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Cumulative LTV Chart ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-gray-500" />
                        Cumulative Avg LTV by Cohort
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
                                <LineChart data={ltvTrendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="index"
                                        tick={{ fontSize: 12 }}
                                        tickFormatter={(v) => `M${v}`}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 12 }}
                                        tickFormatter={(v) => formatCurrency(v)}
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
                                        <th className="text-left px-3 py-2 font-semibold text-gray-600">Cohort</th>
                                        <th className="text-center px-3 py-2 font-semibold text-gray-600">Month</th>
                                        <th className="text-center px-3 py-2 font-semibold text-gray-600">Size</th>
                                        <th className="text-right px-3 py-2 font-semibold text-gray-600">Revenue</th>
                                        <th className="text-right px-3 py-2 font-semibold text-gray-600">Cumulative</th>
                                        <th className="text-right px-3 py-2 font-semibold text-gray-600">Avg LTV</th>
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
                                                    {cohort.cohort_size?.toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700">
                                                    {formatCurrency(dp.revenue)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-medium text-blue-700">
                                                    {formatCurrency(dp.cumulative_revenue)}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                                        {formatCurrency(dp.avg_ltv)}
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
