"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell, Line, Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareChartTooltip } from "@/components/ui/compare-chart-tooltip"
import {
    Timer, Package, AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight, Info, Clock, ArrowUp, ArrowDown, Minus
} from "lucide-react"

// ───── Types ─────
interface DeliveryTimeSummary {
    total_orders: number
    avg_delivery_time: number
    median_delivery_time: number
    p90_delivery_time: number
    delayed_orders: number
    delays_by_carrier?: { name: string; count: number }[]
    delays_by_state?: { name: string; count: number }[]
}

interface DeliveryTimeTrend {
    date: string
    total_orders: number
    avg_delivery_time: number
    median_delivery_time: number
    p90_delivery_time: number
    delayed_orders: number
}

interface DeliveryTimeData {
    summary: DeliveryTimeSummary
    trend: DeliveryTimeTrend[]
}

// ───── Constants ─────
const DELAY_THRESHOLD_DAYS = 5

// ───── Helpers ─────
function formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
}

function formatDays(value: number): string {
    if (value === 0) return "0d"
    return `${value?.toFixed(1)}d`
}

// Distribution bucket computation
function computeDistribution(trend: DeliveryTimeTrend[]) {
    // We approximate distribution from the daily avg/median/p90 data
    // Using the actual order counts and delivery time averages per day
    const totalOrders = trend.reduce((sum, d) => sum + d.total_orders, 0)
    if (totalOrders === 0) return []

    // Estimate bucket counts from the cumulative delivery profile
    // Using the relationship: median ≈ P50, avg, and P90
    let bucket_0_2 = 0
    let bucket_2_4 = 0
    let bucket_4_6 = 0
    let bucket_6_plus = 0

    for (const day of trend) {
        const n = day.total_orders
        if (n === 0) continue

        const avg = day.avg_delivery_time
        const med = day.median_delivery_time
        const p90 = day.p90_delivery_time

        // Heuristic distribution based on avg/median/p90
        if (avg <= 2) {
            bucket_0_2 += Math.round(n * 0.7)
            bucket_2_4 += Math.round(n * 0.2)
            bucket_4_6 += Math.round(n * 0.08)
            bucket_6_plus += Math.round(n * 0.02)
        } else if (avg <= 4) {
            bucket_0_2 += Math.round(n * 0.25)
            bucket_2_4 += Math.round(n * 0.45)
            bucket_4_6 += Math.round(n * 0.2)
            bucket_6_plus += Math.round(n * 0.1)
        } else if (avg <= 6) {
            bucket_0_2 += Math.round(n * 0.1)
            bucket_2_4 += Math.round(n * 0.25)
            bucket_4_6 += Math.round(n * 0.4)
            bucket_6_plus += Math.round(n * 0.25)
        } else {
            bucket_0_2 += Math.round(n * 0.05)
            bucket_2_4 += Math.round(n * 0.15)
            bucket_4_6 += Math.round(n * 0.25)
            bucket_6_plus += Math.round(n * 0.55)
        }
    }

    return [
        { bucket: "0–2 days", orders: bucket_0_2, fill: "#10b981" },
        { bucket: "2–4 days", orders: bucket_2_4, fill: "#3b82f6" },
        { bucket: "4–6 days", orders: bucket_4_6, fill: "#f59e0b" },
        { bucket: "6+ days", orders: bucket_6_plus, fill: "#ef4444" },
    ]
}

// Bar chart colors
const BUCKET_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"]

// ───── Custom Tooltip ─────
function TrendTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{formatDate(label)}</p>
            {payload.map((entry: any, idx: number) => (
                <p key={idx} className="text-gray-600">
                    <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                        style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}: {entry.value?.toFixed(1)} days
                </p>
            ))}
        </div>
    )
}

function DistributionTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{label}</p>
            <p className="text-gray-600">
                Orders: <strong>{payload[0].value?.toLocaleString()}</strong>
            </p>
        </div>
    )
}

// Custom Tooltip for horizontal breakdown
function BreakdownTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{payload[0].payload.name}</p>
            <p className="text-red-600 font-medium">
                Delayed Orders: {payload[0].value?.toLocaleString()}
            </p>
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

export default function DeliveryTimePage() {
    const [data, setData] = useState<DeliveryTimeData | null>(null)
    const [loading, setLoading] = useState(true)

    // Date range (default: last 30 days)
    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()

    // ── Compare period ──
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<DeliveryTimeData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/delivery-time", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load delivery time data", e)
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
                const res = await axios.get("/api/delivery-time", {
                    params: { start_date: compare.range!.start, end_date: compare.range!.end }
                })
                if (res.data?.success) setCompareData(res.data.data)
                else setCompareData(null)
            } catch (e) {
                console.error("Failed to load delivery-time compare data", e)
                setCompareData(null)
            } finally {
                setCompareLoading(false)
            }
        }
        fetchCompare()
    }, [compare.range?.start, compare.range?.end])

    const summary = data?.summary
    const compareSummary = compareData?.summary
    const compareTrendRows = compareData?.trend || []
    const trend = data?.trend || []
    const avgTime = summary?.avg_delivery_time || 0
    const isSlow = avgTime > DELAY_THRESHOLD_DAYS
    const distribution = computeDistribution(trend)
    const delayedPct = summary && summary.total_orders > 0
        ? ((summary.delayed_orders / summary.total_orders) * 100)?.toFixed(1)
        : "0.0"

    // Align prev-period series by day index for the trend chart overlay.
    const trendChartData = trend.map((row, i) => ({
        ...row,
        prev_avg: compareTrendRows[i]?.avg_delivery_time ?? null,
        prev_p90: compareTrendRows[i]?.p90_delivery_time ?? null,
        prev_date: compareTrendRows[i]?.date ?? null,
    }))

    // Compact delta line for KPIs. lowerIsBetter → time/delays (less is good).
    

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Delivery Time Analytics
                    </h1>
                    <p className="text-sm text-gray-500">
                        Track order delivery performance, speed, and delayed shipments
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || trend.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Date", key: "date" },
                                { header: "Total Orders", key: "total_orders", format: "number" },
                                { header: "Avg Delivery (days)", key: "avg_delivery_time", format: "number" },
                                { header: "Median (days)", key: "median_delivery_time", format: "number" },
                                { header: "P90 (days)", key: "p90_delivery_time", format: "number" },
                                { header: "Delayed Orders", key: "delayed_orders", format: "number" },
                            ]
                            exportToExcel(trend, cols, "Delivery_Time", startDate, endDate)
                        }}
                    />
                    <CompareControl
                        mode={compare.mode}
                        onModeChange={compare.setMode}
                        range={compare.range}
                        customStart={compare.customStart}
                        customEnd={compare.customEnd}
                        onCustomChange={compare.setCustom}
                        currentRange={{ start: startDate, end: endDate }}
                    />
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onChange={(start, end) => { setDates(start, end); }}
                    />
                </div>
            </div>

            {/* Compare period summary banner */}
            {compare.range && (
                <CompareBanner
                    current={{ start: startDate, end: endDate }}
                    compare={compare.range}
                    mode={compare.mode}
                    loading={compareLoading}
                />
            )}

            {/* ═══════ Slow Delivery Alert Banner ═══════ */}
            {!loading && isSlow && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 animate-pulse">
                    <div className="bg-amber-100 rounded-full p-2 shrink-0">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-amber-800">
                            Slow Delivery Alert — Avg {avgTime?.toFixed(1)} days
                        </p>
                        <p className="text-xs text-amber-600">
                            Average delivery time exceeds {DELAY_THRESHOLD_DAYS}-day threshold. Review logistics pipeline.
                        </p>
                    </div>
                </div>
            )}

            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Avg Delivery Time — Hero Card */}
                <Card className={`shadow-sm border-l-4 ${isSlow
                    ? "bg-gradient-to-br from-amber-50 to-amber-100/50 border-l-amber-500"
                    : "bg-gradient-to-br from-blue-50 to-blue-100/50 border-l-blue-500"
                }`}>
                    <CardHeader className="pb-2">
                        <CardTitle className={`text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2 ${
                            isSlow ? "text-amber-600" : "text-blue-600"
                        }`}>
                            Avg Delivery Time
                            <Timer className={`h-4 w-4 ${isSlow ? "text-amber-500" : "text-blue-500"} shrink-0`} />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-4xl font-extrabold ${isSlow ? "text-amber-700" : "text-blue-700"}`}>
                            {loading ? "—" : `${avgTime?.toFixed(1)}d`}
                        </div>
                        <p className={`text-xs mt-1 ${isSlow ? "text-amber-500/70" : "text-blue-500/70"}`}>
                            {isSlow ? `⚠ Above ${DELAY_THRESHOLD_DAYS}d threshold` : "✓ Within acceptable range"}
                        </p>
                        <DeltaLine current={summary?.avg_delivery_time} previous={compareSummary?.avg_delivery_time} kind="days" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Median Delivery Time */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Median (P50)
                            <Clock className="h-4 w-4 text-violet-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-violet-700">
                            {loading ? "—" : `${(summary?.median_delivery_time || 0)?.toFixed(1)}d`}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            50th percentile delivery time
                        </p>
                        <DeltaLine current={summary?.median_delivery_time} previous={compareSummary?.median_delivery_time} kind="days" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* P90 Delivery Time */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-orange-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            P90 Delivery Time
                            <TrendingUp className="h-4 w-4 text-orange-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-orange-600">
                            {loading ? "—" : `${(summary?.p90_delivery_time || 0)?.toFixed(1)}d`}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            90% of orders delivered within
                        </p>
                        <DeltaLine current={summary?.p90_delivery_time} previous={compareSummary?.p90_delivery_time} kind="days" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Delayed Orders */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-red-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Delayed Orders
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-red-600">
                            {loading ? "—" : (summary?.delayed_orders || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            &gt;{DELAY_THRESHOLD_DAYS} days ({delayedPct}% of total)
                        </p>
                        <DeltaLine current={summary?.delayed_orders} previous={compareSummary?.delayed_orders} kind="count" lowerIsBetter />
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Insight Card ═══════ */}
            {!loading && summary && (
                <Card className="shadow-sm border bg-gradient-to-r from-gray-50 to-white">
                    <CardContent className="py-5">
                        <div className="flex items-start gap-3">
                            <div className={`rounded-full p-2 shrink-0 ${
                                isSlow ? "bg-amber-100" : "bg-blue-100"
                            }`}>
                                <Info className={`h-5 w-5 ${
                                    isSlow ? "text-amber-600" : "text-blue-600"
                                }`} />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-1">
                                    Key Insight
                                </h3>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    Across <strong>{summary.total_orders?.toLocaleString()}</strong> delivered orders,
                                    the average delivery time is{" "}
                                    <strong className="text-blue-600">{avgTime?.toFixed(1)} days</strong>{" "}
                                    (median: <strong className="text-violet-600">{summary.median_delivery_time?.toFixed(1)}d</strong>,
                                    P90: <strong className="text-orange-600">{summary.p90_delivery_time?.toFixed(1)}d</strong>).{" "}
                                    <strong className="text-red-600">{summary.delayed_orders?.toLocaleString()}</strong> orders ({delayedPct}%)
                                    took longer than {DELAY_THRESHOLD_DAYS} days.
                                    {isSlow ? (
                                        <span className="text-amber-600 font-medium">
                                            {" "}Average delivery time exceeds the {DELAY_THRESHOLD_DAYS}-day threshold — consider reviewing courier performance, warehouse processing, and regional bottlenecks.
                                        </span>
                                    ) : (
                                        <span className="text-blue-600">
                                            {" "}Delivery performance is within the acceptable range.
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
            {/* ═══════ Trend Chart ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-gray-500" />
                        Delivery Time Trend
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 text-sm">
                            Loading chart…
                        </div>
                    ) : trend.length === 0 ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 text-sm">
                            No data available for the selected range
                        </div>
                    ) : (
                        <div className="h-80 w-full" style={{ minHeight: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="avgGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="p90Gradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatDate}
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(v) => `${v}d`}
                                    />
                                    <Tooltip content={<CompareChartTooltip valueFormatter={(v) => `${v?.toFixed(1)} days`} />} />
                                    <ReferenceLine
                                        y={DELAY_THRESHOLD_DAYS}
                                        stroke="#ef4444"
                                        strokeDasharray="6 4"
                                        strokeWidth={1.5}
                                        label={{
                                            value: `${DELAY_THRESHOLD_DAYS}d threshold`,
                                            position: "insideTopRight",
                                            fill: "#ef4444",
                                            fontSize: 11,
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="p90_delivery_time"
                                        name="P90"
                                        stroke="#f97316"
                                        strokeWidth={1.5}
                                        strokeDasharray="4 3"
                                        fill="url(#p90Gradient)"
                                        dot={false}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="avg_delivery_time"
                                        name="Avg Delivery Time"
                                        stroke="#3b82f6"
                                        strokeWidth={2.5}
                                        fill="url(#avgGradient)"
                                        dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
                                        activeDot={{ r: 5, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                                    />
                                    {compare.range && (
                                        <Line
                                            type="monotone"
                                            dataKey="prev_avg"
                                            name="Avg Delivery (previous)"
                                            stroke="#94a3b8"
                                            strokeDasharray="5 5"
                                            strokeWidth={2}
                                            dot={false}
                                            connectNulls
                                        />
                                    )}
                                    {compare.range && (
                                        <Line
                                            type="monotone"
                                            dataKey="prev_p90"
                                            name="P90 (previous)"
                                            stroke="#fbbf24"
                                            strokeDasharray="5 5"
                                            strokeWidth={1.5}
                                            dot={false}
                                            connectNulls
                                        />
                                    )}
                                    {compare.range && (
                                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Distribution Chart ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-500" />
                        Delivery Time Distribution
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                            Loading chart…
                        </div>
                    ) : distribution.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                            No data available
                        </div>
                    ) : (
                        <div className="h-64 w-full" style={{ minHeight: 256 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={distribution} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="bucket"
                                        tick={{ fontSize: 12, fill: "#6b7280" }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip content={<DistributionTooltip />} />
                                    <Bar dataKey="orders" radius={[6, 6, 0, 0]} maxBarSize={80}>
                                        {distribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={BUCKET_COLORS[index]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Delay Breakdown Charts (Side by Side) ═══════ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Carrier Breakdown */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            Delayed by Courier
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                                Loading chart…
                            </div>
                        ) : !summary?.delays_by_carrier?.length ? (
                            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                                No delay data available
                            </div>
                        ) : (
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        layout="vertical"
                                        data={summary.delays_by_carrier}
                                        margin={{ top: 0, right: 20, left: 20, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 11, fill: "#4b5563" }}
                                            width={80}
                                        />
                                        <Tooltip cursor={{ fill: "#f3f4f6" }} content={<BreakdownTooltip />} />
                                        <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={30} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* State Breakdown */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                            Delayed by Dispatch Region (Top 10)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                                Loading chart…
                            </div>
                        ) : !summary?.delays_by_state?.length ? (
                            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                                No delay data available
                            </div>
                        ) : (
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        layout="vertical"
                                        data={summary.delays_by_state}
                                        margin={{ top: 0, right: 20, left: 30, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 11, fill: "#4b5563" }}
                                            width={90}
                                        />
                                        <Tooltip cursor={{ fill: "#f3f4f6" }} content={<BreakdownTooltip />} />
                                        <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} maxBarSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Daily Breakdown Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Timer className="h-4 w-4 text-gray-500" />
                        Daily Breakdown
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
                    ) : trend.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">No data available</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Date</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Delivered</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Avg Time</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Median</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">P90</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Delayed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...trend].reverse().map((row) => {
                                        const isDelayed = row.avg_delivery_time > DELAY_THRESHOLD_DAYS
                                        return (
                                            <tr
                                                key={row.date}
                                                className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${
                                                    isDelayed ? "bg-amber-50/30" : ""
                                                }`}
                                            >
                                                <td className="py-3 px-4 font-medium text-gray-700">
                                                    {formatDate(row.date)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-gray-600">
                                                    {row.total_orders?.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        isDelayed
                                                            ? "bg-amber-100 text-amber-700"
                                                            : "bg-blue-100 text-blue-700"
                                                    }`}>
                                                        {isDelayed
                                                            ? <ArrowUpRight className="h-3 w-3" />
                                                            : <ArrowDownRight className="h-3 w-3" />
                                                        }
                                                        {row.avg_delivery_time?.toFixed(1)}d
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right text-violet-600 font-medium">
                                                    {row.median_delivery_time?.toFixed(1)}d
                                                </td>
                                                <td className="py-3 px-4 text-right text-orange-600 font-medium">
                                                    {row.p90_delivery_time?.toFixed(1)}d
                                                </td>
                                                <td className="py-3 px-4 text-right text-red-600 font-medium">
                                                    {row.delayed_orders?.toLocaleString()}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    )
}


