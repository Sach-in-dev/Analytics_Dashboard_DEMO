"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { api } from "@/lib/axios"
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, BarChart, Bar, ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    DollarSign, ShoppingBag, TrendingDown, TrendingUp, CalendarCheck, CalendarX, Sparkles, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

interface TrendPoint {
    date: string
    total_spend: number
    total_orders: number
    cost_per_order: number
}

interface SummaryData {
    total_spend: number
    total_orders: number
    cost_per_order: number
    total_days: number
    best_day: { date: string | null; cost_per_order: number }
    worst_day: { date: string | null; cost_per_order: number }
}

interface MCPOData {
    summary: SummaryData
    trend: TrendPoint[]
}

function fmt(v: number): string {
    if (v >= 10000000) return `₹${(v / 10000000)?.toFixed(1)}Cr`
    if (v >= 100000) return `₹${(v / 100000)?.toFixed(1)}L`
    if (v >= 1000) return `₹${(v / 1000)?.toFixed(1)}K`
    return `₹${v?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function fmtExact(v: number): string {
    return `₹${v?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtNum(v: number): string {
    return v >= 1000 ? `${(v / 1000)?.toFixed(1)}K` : v?.toLocaleString()
}

function cpoColor(c: number) {
    if (!c) return "text-gray-400"
    if (c <= 150) return "text-emerald-600"
    if (c <= 300) return "text-amber-600"
    return "text-rose-600"
}

function cpoBg(c: number) {
    if (!c) return "bg-gray-100 text-gray-500"
    if (c <= 150) return "bg-emerald-100 text-emerald-700"
    if (c <= 300) return "bg-amber-100 text-amber-700"
    return "bg-rose-100 text-rose-700"
}

function formatDate(d: string | null) {
    if (!d) return "—"
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function TrendTip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload

    

        return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{label}</p>
            <p className="text-gray-600">
                Cost/Order: <strong className={cpoColor(d?.cost_per_order || 0)}>{fmtExact(d?.cost_per_order || 0)}</strong>
            </p>
            <p className="text-gray-600">
                Spend: <strong className="text-rose-600">{fmt(d?.total_spend || 0)}</strong>
            </p>
            <p className="text-gray-600">
                Orders: <strong className="text-blue-600">{fmtNum(d?.total_orders || 0)}</strong>
            </p>
            {d?.prev_date && <p className="mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] text-gray-400">previous-period day: {d.prev_date}</p>}
        </div>
    )
}

function BarTip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} className="text-gray-600">
                    {p.name}: <strong style={{ color: p.color }}>
                        {p.name === "Orders" ? fmtNum(p.value) : fmt(p.value)}
                    </strong>
                </p>
            ))}
        </div>
    )
}





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

export default function MarketingCostPage() {
    const [data, setData] = useState<MCPOData | null>(null)
    const [loading, setLoading] = useState(true)

    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<MCPOData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                setLoading(true)
                const r = await api.get("/marketing-cost-per-order", {
                    params: { start_date: startDate, end_date: endDate },
                })
                if (r.data?.success) setData(r.data.data)
            } catch (e) {
                console.error("Failed to load Marketing Cost per Order", e)
            } finally {
                setLoading(false)
            }
        })()
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await api.get("/marketing-cost-per-order", {
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

    // Compute trend direction (compare last 7 days vs previous 7 days)
    const trendDirection = useMemo(() => {
        if (trend.length < 14) return null
        const recent = trend.slice(-7)
        const previous = trend.slice(-14, -7)
        const recentAvg = recent.reduce((s, t) => s + t.cost_per_order, 0) / recent.length
        const prevAvg = previous.reduce((s, t) => s + t.cost_per_order, 0) / previous.length
        if (prevAvg === 0) return null
        const change = ((recentAvg - prevAvg) / prevAvg) * 100
        return { change: Math.round(change), increasing: change > 0 }
    }, [trend])

    // Compute avg for reference line
    const avgCPO = useMemo(() => {
        if (!trend.length) return 0
        const withData = trend.filter(t => t.cost_per_order > 0)
        if (!withData.length) return 0
        return withData.reduce((s, t) => s + t.cost_per_order, 0) / withData.length
    }, [trend])

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Marketing Cost per Order
                    </h1>
                    <p className="text-sm text-gray-500">
                        How much marketing spend goes into each order — lower is better
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || (data?.trend || []).length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Date", key: "date" },
                                { header: "Total Spend (₹)", key: "total_spend", format: "currency" },
                                { header: "Total Orders", key: "total_orders", format: "number" },
                                { header: "Cost per Order (₹)", key: "cost_per_order", format: "currency" },
                            ]
                            exportToExcel(data?.trend || [], cols, "Marketing_Cost", startDate, endDate)
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
                        onChange={(s, e) => { setDates(s, e) }}
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
                    endpoint="/api/marketing-cost-per-order"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Marketing Cost — Period Comparison"
                />
            )}


            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-violet-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Cost per Order
                            <DollarSign className="h-4 w-4 text-violet-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-extrabold ${cpoColor(summary?.cost_per_order || 0)}`}>
                            {loading ? "—" : fmtExact(summary?.cost_per_order || 0)}
                        </div>
                        <p className="text-xs text-violet-500/70 mt-1">
                            {trendDirection ? (
                                <span className={`inline-flex items-center gap-1 ${trendDirection.increasing ? "text-rose-500" : "text-emerald-500"}`}>
                                    {trendDirection.increasing
                                        ? <><TrendingUp className="h-3 w-3" /> +{trendDirection.change}% vs prev 7d</>
                                        : <><TrendingDown className="h-3 w-3" /> {trendDirection.change}% vs prev 7d</>
                                    }
                                </span>
                            ) : "Spend / Total Orders"}
                        </p>
                    
                    <DeltaLine current={summary?.cost_per_order} previous={compareSummary?.cost_per_order} kind="currency" lowerIsBetter />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 shadow-sm border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-rose-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Spend
                            <DollarSign className="h-4 w-4 text-rose-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-rose-700">
                            {loading ? "—" : fmt(summary?.total_spend || 0)}
                        </div>
                        <p className="text-xs text-rose-500/70 mt-1">
                            {!loading && summary ? `Across ${summary.total_days} days` : "—"}
                        </p>
                    
                    <DeltaLine current={summary?.total_spend} previous={compareSummary?.total_spend} kind="currency" lowerIsBetter />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Orders
                            <ShoppingBag className="h-4 w-4 text-blue-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-blue-700">
                            {loading ? "—" : fmtNum(summary?.total_orders || 0)}
                        </div>
                        <p className="text-xs text-blue-500/70 mt-1">Paid / delivered orders</p>
                    
                    <DeltaLine current={summary?.total_orders} previous={compareSummary?.total_orders} kind="count" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Best Day
                            <CalendarCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-extrabold text-emerald-700">
                            {loading ? "—" : summary?.best_day?.cost_per_order ? fmtExact(summary.best_day.cost_per_order) : "—"}
                        </div>
                        <p className="text-xs text-emerald-500/70 mt-1">
                            {loading ? "—" : formatDate(summary?.best_day?.date || null)}
                        </p>
                    
                    
                    </CardContent>
                </Card>
            </div>

            {/* Insight Card */}
            {!loading && summary && summary.total_orders > 0 && (
                <Card className="bg-gradient-to-r from-slate-50 to-violet-50/30 shadow-sm border-l-4 border-l-violet-400">
                    <CardContent className="py-4">
                        <p className="text-sm text-gray-600 leading-relaxed">
                            <strong className="text-gray-800">
                                <Sparkles className="h-4 w-4 inline mr-1 text-violet-500" />
                                Insight:
                            </strong>{" "}
                            Your average marketing cost per order is{" "}
                            <strong className={cpoColor(summary.cost_per_order)}>
                                {fmtExact(summary.cost_per_order)}
                            </strong>.{" "}
                            Over {summary.total_days} days, you spent{" "}
                            <strong className="text-rose-600">{fmt(summary.total_spend)}</strong> on marketing
                            to generate{" "}
                            <strong className="text-blue-600">{fmtNum(summary.total_orders)}</strong> orders.
                            {summary.best_day?.date && (
                                <> Best efficiency was on{" "}
                                    <strong className="text-emerald-600">{formatDate(summary.best_day.date)}</strong>{" "}
                                    at {fmtExact(summary.best_day.cost_per_order)}/order.</>
                            )}
                            {trendDirection && (
                                <>{" "}Cost per order is{" "}
                                    <strong className={trendDirection.increasing ? "text-rose-600" : "text-emerald-600"}>
                                        {trendDirection.increasing ? "increasing" : "decreasing"}
                                    </strong>{" "}
                                    ({trendDirection.change > 0 ? "+" : ""}{trendDirection.change}% week-over-week).
                                </>
                            )}
                        </p>
                    </CardContent>
                </Card>
            )}
            {/* Charts: Trend + Spend vs Orders */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Cost per Order Trend */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-gray-500" />
                            Cost per Order Trend
                            <span className="text-xs text-gray-400 font-normal ml-1">
                                Lower = better
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
                                Loading…
                            </div>
                        ) : trend.length === 0 ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
                                No data available
                            </div>
                        ) : (
                            <div className="h-[320px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={trend.map((row,i)=>({...row,prev_cpo:compareTrend[i]?.cost_per_order??null,prev_date:compareTrend[i]?.date??null}))} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="cpoGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fill: "#9ca3af" }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tickFormatter={v => `₹${v}`}
                                            tick={{ fontSize: 10, fill: "#9ca3af" }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip content={<TrendTip />} />
                                        <Legend />
                                        {avgCPO > 0 && (
                                            <ReferenceLine
                                                y={avgCPO}
                                                stroke="#9ca3af"
                                                strokeDasharray="6 3"
                                                label={{
                                                    value: `Avg ₹${Math.round(avgCPO)}`,
                                                    position: "insideTopRight",
                                                    fill: "#9ca3af",
                                                    fontSize: 10,
                                                }}
                                            />
                                        )}
                                        <Area
                                            type="monotone"
                                            dataKey="cost_per_order"
                                            name="Cost/Order"
                                            stroke="#7c3aed"
                                            fill="url(#cpoGrad)"
                                            strokeWidth={2.5}
                                        />
                                        {compare.range && (
                                            <Area type="monotone" dataKey="prev_cpo" name="Cost/Order (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                                        )}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Spend vs Orders Bar Chart */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4 text-gray-500" />
                            Spend vs Orders
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
                                Loading…
                            </div>
                        ) : trend.length === 0 ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
                                No data
                            </div>
                        ) : (
                            <div className="h-[320px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={trend} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fill: "#374151" }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            yAxisId="spend"
                                            tickFormatter={v => fmt(v)}
                                            tick={{ fontSize: 10, fill: "#9ca3af" }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            yAxisId="orders"
                                            orientation="right"
                                            tickFormatter={v => fmtNum(v)}
                                            tick={{ fontSize: 10, fill: "#9ca3af" }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip content={<BarTip />} />
                                        <Legend />
                                        <Bar
                                            yAxisId="spend"
                                            dataKey="total_spend"
                                            name="Spend"
                                            fill="#f43f5e"
                                            radius={[4, 4, 0, 0]}
                                            opacity={0.8}
                                        />
                                        <Bar
                                            yAxisId="orders"
                                            dataKey="total_orders"
                                            name="Orders"
                                            fill="#3b82f6"
                                            radius={[4, 4, 0, 0]}
                                            opacity={0.8}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Daily Breakdown Table */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <CalendarX className="h-4 w-4 text-gray-500" />
                        Daily Breakdown
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
                    ) : trend.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">No data</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                                            Date
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                                            Spend
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                                            Orders
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                                            Cost / Order
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...trend].reverse().map((row) => {
                                        const isBest = summary?.best_day?.date === row.date
                                        const isWorst = summary?.worst_day?.date === row.date
                                        return (
                                            <tr
                                                key={row.date}
                                                className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${isBest ? "bg-emerald-50/30" : isWorst ? "bg-rose-50/20" : ""}`}
                                            >
                                                <td className="py-3 px-4 font-medium text-gray-700">
                                                    <div className="flex items-center gap-2">
                                                        {row.date}
                                                        {isBest && (
                                                            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
                                                                BEST
                                                            </span>
                                                        )}
                                                        {isWorst && (
                                                            <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-semibold">
                                                                WORST
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right text-rose-600 font-medium">
                                                    {fmt(row.total_spend)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-blue-600 font-medium">
                                                    {row.total_orders?.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cpoBg(row.cost_per_order)}`}>
                                                        {row.cost_per_order > 0 ? fmtExact(row.cost_per_order) : "—"}
                                                    </span>
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


