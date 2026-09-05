"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Package, AlertTriangle, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, Info, RotateCcw, Minus, ArrowUp, ArrowDown
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface ReturnSummary {
    total_delivered_orders: number
    returned_orders: number
    return_rate: number
    return_revenue_loss: number
}

interface ReturnTrend {
    date: string
    total_delivered_orders: number
    returned_orders: number
    return_rate: number
    return_revenue_loss: number
}

interface ReturnRateData {
    summary: ReturnSummary
    trend: ReturnTrend[]
}

// ───── Constants ─────
const RETURN_ALERT_THRESHOLD = 8 // If Return Rate > 8%, show red alert

// ───── Helpers ─────
function formatCurrency(value: number): string {
    if (typeof value !== "number" || isNaN(value)) return "₹0";
    if (value >= 10000000) return `₹${(value / 10000000)?.toFixed(1)}Cr`
    if (value >= 100000) return `₹${(value / 100000)?.toFixed(1)}L`
    if (value >= 1000) return `₹${(value / 1000)?.toFixed(1)}K`
    return `₹${value?.toFixed(0)}`
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
}

// ───── Custom Tooltip ─────
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const prevDate = payload[0]?.payload?.prev_date
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{formatDate(label)}</p>
            {payload.map((entry: any, idx: number) => (
                <p key={idx} className="text-gray-600">
                    <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                        style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}: {entry.name === "Return Rate" ? `${entry.value}%` : entry.value}
                </p>
            ))}
            {prevDate && <p className="mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] text-gray-400">previous-period day: {prevDate}</p>}
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

export default function ReturnRatePage() {
    const [data, setData] = useState<ReturnRateData | null>(null)
    const [loading, setLoading] = useState(true)

    // Date range (default: last 30 days)
    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<ReturnRateData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/return-rate", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load Return Rate data", e)
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
                const res = await axios.get("/api/return-rate", {
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


    const summary = data?.summary
    const compareSummary = compareData?.summary
    const trend = data?.trend || []
    const compareTrend = compareData?.trend || []
    const returnRate = summary?.return_rate || 0
    const isHighReturn = returnRate > RETURN_ALERT_THRESHOLD

    
    

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Return Rate (Post-Delivery)
                    </h1>
                    <p className="text-sm text-gray-500">
                        Track orders returned after successful delivery &amp; revenue impact
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || trend.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Date", key: "date" },
                                { header: "Delivered Orders", key: "total_delivered_orders", format: "number" },
                                { header: "Returned Orders", key: "returned_orders", format: "number" },
                                { header: "Return Rate (%)", key: "return_rate", format: "percent" },
                                { header: "Revenue Loss (₹)", key: "return_revenue_loss", format: "currency" },
                            ]
                            exportToExcel(trend, cols, "Return_Rate", startDate, endDate)
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

            {compare.range && (
                <CompareBanner
                    current={{ start: startDate, end: endDate }}
                    compare={compare.range}
                    mode={compare.mode}
                />
            )}
            {compare.range && (
                <CompareSummary
                    endpoint="/api/return-rate"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Return Rate — Period Comparison"
                />
            )}


            {/* ═══════ High Return Alert Banner ═══════ */}
            {!loading && isHighReturn && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <div className="bg-red-100 rounded-full p-2 shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-red-800">
                            High Return Rate Alert — {returnRate}%
                        </p>
                        <p className="text-xs text-red-600">
                            Return rate exceeds {RETURN_ALERT_THRESHOLD}% threshold. Review product quality, sizing guides, and customer expectations.
                        </p>
                    </div>
                </div>
            )}

            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Return Rate — Hero Card */}
                <Card className={`shadow-sm border-l-4 ${isHighReturn
                    ? "bg-gradient-to-br from-red-50 to-red-100/50 border-l-red-500"
                    : "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-l-emerald-500"
                }`}>
                    <CardHeader className="pb-2">
                        <CardTitle className={`text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2 ${
                            isHighReturn ? "text-red-600" : "text-emerald-600"
                        }`}>
                            Return Rate
                            {isHighReturn
                                ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                                : <TrendingDown className="h-4 w-4 text-emerald-500 shrink-0" />
                            }
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-4xl font-extrabold ${isHighReturn ? "text-red-700" : "text-emerald-700"}`}>
                            {loading ? "—" : `${returnRate}%`}
                        </div>
                        <p className={`text-xs mt-1 ${isHighReturn ? "text-red-500/70" : "text-emerald-500/70"}`}>
                            {isHighReturn ? `⚠ Above ${RETURN_ALERT_THRESHOLD}% threshold` : "✓ Within acceptable range"}
                        </p>
                    </CardContent>
                </Card>

                {/* Total Delivered Orders */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Delivered Orders
                            <Package className="h-4 w-4 text-blue-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-blue-700">
                            {loading ? "—" : (summary?.total_delivered_orders || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-blue-500/70 mt-1">
                            Successfully delivered in range
                        </p>
                    
                    <DeltaLine current={summary?.total_delivered_orders} previous={compareSummary?.total_delivered_orders} kind="count" />
                    </CardContent>
                </Card>

                {/* Returned Orders */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Returned Orders
                            <RotateCcw className="h-4 w-4 text-rose-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-rose-600">
                            {loading ? "—" : (summary?.returned_orders || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Returned after delivery
                        </p>
                    
                    <DeltaLine current={summary?.returned_orders} previous={compareSummary?.returned_orders} kind="count" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Revenue Loss */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Revenue Loss
                            <DollarSign className="h-4 w-4 text-amber-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-amber-600">
                            {loading ? "—" : formatCurrency(summary?.return_revenue_loss || 0)}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Lost due to post-delivery returns
                        </p>
                    
                    <DeltaLine current={summary?.return_revenue_loss} previous={compareSummary?.return_revenue_loss} kind="currency" lowerIsBetter />
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Insight Card ═══════ */}
            {!loading && summary && (
                <Card className="shadow-sm border bg-gradient-to-r from-gray-50 to-white">
                    <CardContent className="py-5">
                        <div className="flex items-start gap-3">
                            <div className={`rounded-full p-2 shrink-0 ${
                                isHighReturn ? "bg-red-100" : "bg-emerald-100"
                            }`}>
                                <Info className={`h-5 w-5 ${
                                    isHighReturn ? "text-red-600" : "text-emerald-600"
                                }`} />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-1">
                                    Key Insight
                                </h3>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    Out of <strong>{summary.total_delivered_orders?.toLocaleString()}</strong> delivered orders,{" "}
                                    <strong className="text-rose-600">{summary.returned_orders?.toLocaleString()}</strong> ({returnRate}%)
                                    were returned post-delivery, resulting in a revenue loss of{" "}
                                    <strong className="text-amber-600">{formatCurrency(summary.return_revenue_loss)}</strong>.
                                    {isHighReturn ? (
                                        <span className="text-red-600 font-medium">
                                            {" "}This is above the {RETURN_ALERT_THRESHOLD}% threshold — consider reviewing product descriptions, sizing accuracy, and packaging quality.
                                        </span>
                                    ) : (
                                        <span className="text-emerald-600">
                                            {" "}Return rate is within the acceptable range.
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
                        <TrendingDown className="h-4 w-4 text-gray-500" />
                        Return Rate Trend
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
                                <AreaChart data={trend.map((row,i)=>({...row,prev_return_rate:compareTrend[i]?.return_rate??null,prev_date:compareTrend[i]?.date??null}))} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="returnGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
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
                                        tickFormatter={(v) => `${v}%`}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <ReferenceLine
                                        y={RETURN_ALERT_THRESHOLD}
                                        stroke="#ef4444"
                                        strokeDasharray="6 4"
                                        strokeWidth={1.5}
                                        label={{
                                            value: `${RETURN_ALERT_THRESHOLD}% threshold`,
                                            position: "insideTopRight",
                                            fill: "#ef4444",
                                            fontSize: 11,
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="return_rate"
                                        name="Return Rate"
                                        stroke="#8b5cf6"
                                        strokeWidth={2.5}
                                        fill="url(#returnGradient)"
                                        dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 0 }}
                                        activeDot={{ r: 5, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" }}
                                    />
                                    {compare.range && (
                                        <Area
                                            type="monotone"
                                            dataKey="prev_return_rate"
                                            name="Return Rate (previous)"
                                            stroke="#94a3b8"
                                            strokeDasharray="5 5"
                                            strokeWidth={2}
                                            fill="transparent"
                                            dot={false}
                                            connectNulls
                                        />
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Daily Breakdown Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-500" />
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
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Returned</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Return Rate</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Revenue Loss</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...trend].reverse().map((row) => {
                                        const isHigh = row.return_rate > RETURN_ALERT_THRESHOLD
                                        return (
                                            <tr
                                                key={row.date}
                                                className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${
                                                    isHigh ? "bg-red-50/30" : ""
                                                }`}
                                            >
                                                <td className="py-3 px-4 font-medium text-gray-700">
                                                    {formatDate(row.date)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-gray-600">
                                                    {row.total_delivered_orders?.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right text-gray-600">
                                                    {row.returned_orders?.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        isHigh
                                                            ? "bg-red-100 text-red-700"
                                                            : "bg-emerald-100 text-emerald-700"
                                                    }`}>
                                                        {isHigh
                                                            ? <ArrowUpRight className="h-3 w-3" />
                                                            : <ArrowDownRight className="h-3 w-3" />
                                                        }
                                                        {row.return_rate}%
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right text-amber-600 font-medium">
                                                    {formatCurrency(row.return_revenue_loss)}
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


