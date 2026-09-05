"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, BarChart, Bar, Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Users, MousePointerClick, Eye, ShoppingBag, TrendingDown,
    ArrowDown, Percent, Activity,
    ArrowUp, Minus,
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"
import { CompareChartTooltip } from "@/components/ui/compare-chart-tooltip"

// ───── Types ─────
interface FunnelTotals {
    total_users: number
    open_users: number
    click_users: number
    payment_failure_users: number
    converted_users: number
}

interface FunnelRates {
    open_rate: number
    click_rate: number
    payment_failure_rate: number
    conversion_rate: number
}

interface FunnelDrop {
    open_to_click_drop: number
    click_to_conversion_drop: number
}

interface TrendItem {
    date: string
    total_users: number
    open_users: number
    click_users: number
    payment_failure_users: number
    converted_users: number
    open_rate: number
    click_rate: number
    payment_failure_rate: number
    conversion_rate: number
}

interface FunnelData {
    totals: FunnelTotals
    rates: FunnelRates
    funnel_drop: FunnelDrop
    trend: TrendItem[]
    last_updated: string | null
}

// ───── Colors ─────
const FUNNEL_COLORS = {
    total: "#6366f1",     // indigo
    open: "#8b5cf6",      // violet
    click: "#f59e0b",     // amber
    payment_failure: "#ef4444", // red
    converted: "#10b981", // emerald
}

const RATE_COLORS = {
    open_rate: "#8b5cf6",
    click_rate: "#f59e0b",
    payment_failure_rate: "#ef4444",
    conversion_rate: "#10b981",
}

// ───── Custom Tooltips ─────
function FunnelBarTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const { name, value, payload: data } = payload[0]
    return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800">{name}</p>
            <p className="text-gray-500 mt-1">
                {value.toLocaleString()} users
            </p>
            {data.percentage !== undefined && (
                <p className="text-gray-400 text-xs mt-0.5">
                    {data.percentage}% of total
                </p>
            )}
        </div>
    )
}

function TrendTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 text-sm min-w-[180px]">
            <p className="font-semibold text-gray-800 mb-2">{label}</p>
            {payload.map((entry: any, idx: number) => (
                <p key={idx} className="flex items-center justify-between gap-4 text-gray-600">
                    <span className="flex items-center gap-1.5">
                        <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        {entry.name}
                    </span>
                    <span className="font-medium">{entry.value}%</span>
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

export default function FunnelPage() {
    const [data, setData] = useState<FunnelData | null>(null)
    const [loading, setLoading] = useState(true)

    // Date range (default: last 1 year)
    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<FunnelData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/funnel-metrics", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load funnel data", e)
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
                const res = await axios.get("/api/funnel-metrics", {
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


    // Derived
    const totals = data?.totals || { total_users: 0, open_users: 0, click_users: 0, payment_failure_users: 0, converted_users: 0 }
    const rates = data?.rates || { open_rate: 0, click_rate: 0, payment_failure_rate: 0, conversion_rate: 0 }
    const drop = data?.funnel_drop || { open_to_click_drop: 0, click_to_conversion_drop: 0 }
    const trend = data?.trend || []
    const cmpTotals = compareData?.totals
    const cmpRates = compareData?.rates
    const compareTrend = compareData?.trend || []

    // Funnel bar data
    const funnelBars = [
        {
            name: "Total Users",
            value: totals.total_users,
            fill: FUNNEL_COLORS.total,
            percentage: 100,
        },
        {
            name: "Open Users",
            value: totals.open_users,
            fill: FUNNEL_COLORS.open,
            percentage: totals.total_users > 0
                ? round((totals.open_users / totals.total_users) * 100)
                : 0,
        },
        {
            name: "Click Users",
            value: totals.click_users,
            fill: FUNNEL_COLORS.click,
            percentage: totals.total_users > 0
                ? round((totals.click_users / totals.total_users) * 100)
                : 0,
        },
        {
            name: "Payment Failed",
            value: totals.payment_failure_users,
            fill: FUNNEL_COLORS.payment_failure,
            percentage: totals.total_users > 0
                ? round((totals.payment_failure_users / totals.total_users) * 100)
                : 0,
        },
        {
            name: "Converted",
            value: totals.converted_users,
            fill: FUNNEL_COLORS.converted,
            percentage: totals.total_users > 0
                ? round((totals.converted_users / totals.total_users) * 100)
                : 0,
        },
    ]

    
    

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Open / Click / Conversion Rates
                    </h1>
                    <p className="text-sm text-gray-500">
                        Customer engagement funnel — from browsing to purchase
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || trend.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Date", key: "date" },
                                { header: "Total Users", key: "total_users", format: "number" },
                                { header: "Open Users", key: "open_users", format: "number" },
                                { header: "Click Users", key: "click_users", format: "number" },
                                { header: "Payment Failures", key: "payment_failure_users", format: "number" },
                                { header: "Converted Users", key: "converted_users", format: "number" },
                                { header: "Open Rate (%)", key: "open_rate", format: "percent" },
                                { header: "Click Rate (%)", key: "click_rate", format: "percent" },
                                { header: "Payment Failure Rate (%)", key: "payment_failure_rate", format: "percent" },
                                { header: "Conversion Rate (%)", key: "conversion_rate", format: "percent" },
                            ]
                            exportToExcel(trend, cols, "Funnel_Metrics", startDate, endDate)
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
                    endpoint="/api/funnel-metrics"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Funnel — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Users */}
                <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 shadow-sm border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-indigo-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Users
                            <Users className="h-4 w-4 text-indigo-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-indigo-700">
                            {loading ? "—" : totals.total_users.toLocaleString()}
                        </div>
                        <p className="text-xs text-indigo-500/70 mt-1">
                            Base audience entering funnel
                        </p>
                        <DeltaLine current={totals.total_users} previous={cmpTotals?.total_users} kind="count" />
                    </CardContent>
                </Card>

                {/* Open Rate */}
                <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-violet-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Open Rate
                            <Eye className="h-4 w-4 text-violet-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-violet-700">
                            {loading ? "—" : `${rates.open_rate}%`}
                        </div>
                        <p className="text-xs text-violet-500/70 mt-1">
                            {loading ? "" : `${totals.open_users.toLocaleString()} users browsed`}
                        </p>
                        <DeltaLine current={rates.open_rate} previous={cmpRates?.open_rate} kind="percent" />
                    </CardContent>
                </Card>

                {/* Click Rate */}
                <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Click Rate
                            <MousePointerClick className="h-4 w-4 text-amber-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-amber-600">
                            {loading ? "—" : `${rates.click_rate}%`}
                        </div>
                        <p className="text-xs text-amber-500/70 mt-1">
                            {loading ? "" : `${totals.click_users.toLocaleString()} users added to cart`}
                        </p>
                        <DeltaLine current={rates.click_rate} previous={cmpRates?.click_rate} kind="percent" />
                    </CardContent>
                </Card>

                {/* Conversion Rate */}
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Conversion Rate
                            <ShoppingBag className="h-4 w-4 text-emerald-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-emerald-700">
                            {loading ? "—" : `${rates.conversion_rate}%`}
                        </div>
                        <p className="text-xs text-emerald-500/70 mt-1">
                            {loading ? "" : `${totals.converted_users.toLocaleString()} users purchased`}
                        </p>
                        <DeltaLine current={rates.conversion_rate} previous={cmpRates?.conversion_rate} kind="percent" />
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Insight Card ═══════ */}
            {!loading && data && totals.total_users > 0 && (
                <Card className="shadow-sm border bg-gradient-to-r from-gray-50 to-white">
                    <CardContent className="py-5">
                        <div className="flex items-start gap-3">
                            <div className="bg-indigo-100 rounded-full p-2 shrink-0">
                                <Activity className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-1">
                                    Funnel Insight
                                </h3>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    Of <strong>{totals.total_users.toLocaleString()}</strong> total users,{" "}
                                    <strong className="text-violet-700">{totals.open_users.toLocaleString()}</strong> ({rates.open_rate}%) browsed the store,{" "}
                                    <strong className="text-amber-600">{totals.click_users.toLocaleString()}</strong> ({rates.click_rate}%) added items to cart,{" "}
                                    <strong className="text-rose-600">{totals.payment_failure_users.toLocaleString()}</strong> ({rates.payment_failure_rate}%) failed at payment, and{" "}
                                    <strong className="text-emerald-700">{totals.converted_users.toLocaleString()}</strong> ({rates.conversion_rate}%) completed a purchase.
                                    {drop.open_to_click_drop > 50 && (
                                        <span className="text-rose-600">
                                            {" "}The biggest drop-off is from open to click ({drop.open_to_click_drop}%) — consider improving product discovery.
                                        </span>
                                    )}
                                    {drop.click_to_conversion_drop > 50 && (
                                        <span className="text-rose-600">
                                            {" "}The conversion drop-off is {drop.click_to_conversion_drop}% — consider streamlining checkout.
                                        </span>
                                    )}
                                    {rates.payment_failure_rate > 10 && (
                                        <span className="text-rose-600 font-medium">
                                            {" "}High payment failure rate detected ({rates.payment_failure_rate}%)! Check payment gateways and checkout friction.
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ═══════ Funnel Visualization + Drop-off ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Funnel Bar Chart */}
                <Card className="shadow-sm lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-gray-500" />
                            Funnel Visualization
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-80 flex items-center justify-center text-gray-400 text-sm">
                                Loading chart…
                            </div>
                        ) : totals.total_users === 0 ? (
                            <div className="h-80 flex items-center justify-center text-gray-400 text-sm">
                                No data available
                            </div>
                        ) : (
                            <div className="h-80 w-full" style={{ minHeight: 320 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={funnelBars}
                                        layout="vertical"
                                        margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                                        barCategoryGap="24%"
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            horizontal={false}
                                            stroke="#f0f0f0"
                                        />
                                        <XAxis
                                            type="number"
                                            tickFormatter={(v) => v.toLocaleString()}
                                            tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            width={100}
                                            tick={{ fontSize: 12, fill: "#4b5563", fontWeight: 500 }}
                                        />
                                        <Tooltip content={<FunnelBarTooltip />} />
                                        <Bar
                                            dataKey="value"
                                            radius={[0, 6, 6, 0]}
                                            maxBarSize={48}
                                        >
                                            {funnelBars.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Drop-off Panel */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-gray-500" />
                            Funnel Drop-off
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                                Loading…
                            </div>
                        ) : (
                            <div className="space-y-6 py-2">
                                {/* Stage 1 → 2 */}
                                <FunnelStage
                                    from="Total Users"
                                    to="Open Users"
                                    fromCount={totals.total_users}
                                    toCount={totals.open_users}
                                    rate={rates.open_rate}
                                    color="violet"
                                />

                                {/* Stage 2 → 3 */}
                                <FunnelStage
                                    from="Open Users"
                                    to="Click Users"
                                    fromCount={totals.open_users}
                                    toCount={totals.click_users}
                                    rate={rates.click_rate}
                                    color="amber"
                                />

                                {/* Stage 3 → Payment Failed */}
                                <FunnelStage
                                    from="Click Users"
                                    to="Payment Failed"
                                    fromCount={totals.click_users}
                                    toCount={totals.payment_failure_users}
                                    rate={rates.payment_failure_rate}
                                    color="rose"
                                    isFailure={true}
                                />

                                {/* Stage 3 → 4 */}
                                <FunnelStage
                                    from="Click Users"
                                    to="Converted"
                                    fromCount={totals.click_users}
                                    toCount={totals.converted_users}
                                    rate={rates.conversion_rate}
                                    color="emerald"
                                />

                                {/* Overall */}
                                <div className="border-t pt-4">
                                    <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 rounded-lg p-4 text-center">
                                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                                            Overall Conversion
                                        </p>
                                        <p className="text-3xl font-black text-gray-800">
                                            {totals.total_users > 0
                                                ? round((totals.converted_users / totals.total_users) * 100)
                                                : 0}%
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Total → Converted
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Trend Line Chart ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Percent className="h-4 w-4 text-gray-500" />
                        Rate Trends Over Time
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                            Loading chart…
                        </div>
                    ) : trend.length === 0 ? (
                        <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                            No trend data available yet. Data will appear after the daily cron runs.
                        </div>
                    ) : (
                        <div className="h-72 w-full" style={{ minHeight: 288 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trend.map((row,i)=>({...row,prev_open_rate:compareTrend[i]?.open_rate??null,prev_click_rate:compareTrend[i]?.click_rate??null,prev_conversion_rate:compareTrend[i]?.conversion_rate??null,prev_payment_failure_rate:compareTrend[i]?.payment_failure_rate??null,prev_date:compareTrend[i]?.date??null}))} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        tickFormatter={(v) => {
                                            const d = new Date(v)
                                            return `${d.getDate()}/${d.getMonth() + 1}`
                                        }}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        tickFormatter={(v) => `${v}%`}
                                        domain={[0, 100]}
                                    />
                                    <Tooltip content={<CompareChartTooltip valueFormatter={(v) => `${v}%`} />} />
                                    <Legend
                                        verticalAlign="bottom"
                                        iconType="circle"
                                        iconSize={8}
                                        formatter={(value: string) => (
                                            <span className="text-xs text-gray-600">{value}</span>
                                        )}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="open_rate"
                                        name="Open Rate"
                                        stroke={RATE_COLORS.open_rate}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="click_rate"
                                        name="Click Rate"
                                        stroke={RATE_COLORS.click_rate}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="conversion_rate"
                                        name="Conversion Rate"
                                        stroke={RATE_COLORS.conversion_rate}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="payment_failure_rate"
                                        name="Payment Failure Rate"
                                        stroke={RATE_COLORS.payment_failure_rate}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                    {compare.range && (
                                        <Line type="monotone" dataKey="prev_open_rate" name="Open Rate (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                                    )}
                                    {compare.range && (
                                        <Line type="monotone" dataKey="prev_click_rate" name="Click Rate (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                                    )}
                                    {compare.range && (
                                        <Line type="monotone" dataKey="prev_conversion_rate" name="Conversion Rate (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                                    )}
                                    {compare.range && (
                                        <Line type="monotone" dataKey="prev_payment_failure_rate" name="Payment Failure Rate (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                                    )}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Date-wise Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700">
                        Daily Breakdown
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
                            Loading…
                        </div>
                    ) : trend.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
                            No data available
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Open</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Click</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">P. Fail</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Converted</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-violet-600 uppercase tracking-wider">Open %</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-amber-600 uppercase tracking-wider">Click %</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-rose-600 uppercase tracking-wider">Fail %</th>
                                        <th className="text-right py-3 px-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider">Conv %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...trend].reverse().map((row, idx) => (
                                        <tr
                                            key={row.date}
                                            className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}
                                        >
                                            <td className="py-2.5 px-3 font-medium text-gray-700">{row.date}</td>
                                            <td className="py-2.5 px-3 text-right text-gray-600">{row.total_users.toLocaleString()}</td>
                                            <td className="py-2.5 px-3 text-right text-gray-600">{row.open_users.toLocaleString()}</td>
                                            <td className="py-2.5 px-3 text-right text-gray-600">{row.click_users.toLocaleString()}</td>
                                            <td className="py-2.5 px-3 text-right text-gray-600">{row.payment_failure_users.toLocaleString()}</td>
                                            <td className="py-2.5 px-3 text-right text-gray-600">{row.converted_users.toLocaleString()}</td>
                                            <td className="py-2.5 px-3 text-right">
                                                <span className="inline-block bg-violet-50 text-violet-700 rounded px-2 py-0.5 text-xs font-semibold">
                                                    {row.open_rate}%
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right">
                                                <span className="inline-block bg-amber-50 text-amber-700 rounded px-2 py-0.5 text-xs font-semibold">
                                                    {row.click_rate}%
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right">
                                                <span className="inline-block bg-rose-50 text-rose-700 rounded px-2 py-0.5 text-xs font-semibold">
                                                    {row.payment_failure_rate}%
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 text-right">
                                                <span className="inline-block bg-emerald-50 text-emerald-700 rounded px-2 py-0.5 text-xs font-semibold">
                                                    {row.conversion_rate}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    )
}


// ═══════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════

function FunnelStage({
    from, to, fromCount, toCount, rate, color, isFailure = false
}: {
    from: string
    to: string
    fromCount: number
    toCount: number
    rate: number
    color: string
    isFailure?: boolean
}) {
    // If it's a failure metric (like payment failure), the "dropped" logic is inverted or irrelevant
    // because toCount IS the drop. We adjust the display slightly.
    const dropped = isFailure ? 0 : fromCount - toCount
    const dropPct = isFailure ? 0 : (fromCount > 0 ? round((dropped / fromCount) * 100) : 0)

    const colorMap: Record<string, { bg: string; text: string; bar: string }> = {
        violet: { bg: "bg-violet-50", text: "text-violet-700", bar: "from-violet-400 to-violet-600" },
        amber: { bg: "bg-amber-50", text: "text-amber-700", bar: "from-amber-400 to-amber-600" },
        emerald: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "from-emerald-400 to-emerald-600" },
        rose: { bg: "bg-rose-50", text: "text-rose-700", bar: "from-rose-400 to-rose-600" },
    }
    const c = colorMap[color] || colorMap.violet

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 font-medium">{from} → {to}</span>
                <span className={`font-bold ${c.text}`}>{rate}%</span>

            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                    className={`h-3 rounded-full bg-gradient-to-r ${c.bar} transition-all duration-1000 ease-out`}
                    style={{ width: `${Math.min(rate, 100)}%` }}
                />
            </div>
            {!isFailure && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                    <ArrowDown className="h-3 w-3 text-rose-400" />
                    <span>{dropped.toLocaleString()} users dropped ({dropPct}%)</span>
                </div>
            )}
            {isFailure && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                    <ArrowDown className="h-3 w-3 text-rose-400" />
                    <span>{toCount.toLocaleString()} users failed</span>
                </div>
            )}
        </div>
    )
}

function round(n: number, decimals = 2) {
    return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals)
}
