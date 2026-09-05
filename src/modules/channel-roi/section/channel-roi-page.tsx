"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { api } from "@/lib/axios"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, AreaChart, Area, ReferenceLine, Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    DollarSign, TrendingUp, PiggyBank, Trophy,
    ArrowUpDown, ChevronUp, ChevronDown,
    ArrowDown, Minus, ArrowUp,
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface ChannelData {
    [key: string]: string | number
    channel: string
    total_revenue: number
    total_spend: number
    roi: number
    roas: number
    total_orders: number
    unique_users: number
    aov: number
}

interface TrendPoint {
    date: string
    total_revenue: number
    total_spend: number
    roi: number
    total_orders: number
}

interface SummaryData {
    total_revenue: number
    total_spend: number
    overall_roi: number
    overall_roas: number
    total_orders: number
    best_channel: string
    best_channel_roi: number
}

interface ChannelRoiData {
    summary: SummaryData
    channels: ChannelData[]
    trend: TrendPoint[]
}

// ───── Colors ─────
const CHANNEL_COLORS: Record<string, string> = {
    "Facebook Ads": "#1877F2",
    "Google Ads": "#34A853",
    "Email": "#8B5CF6",
    "Influencer": "#EC4899",
    "Organic": "#06B6D4",
    "Other": "#9CA3AF",
}
const BAR_REVENUE = "#10b981"
const BAR_SPEND = "#f43f5e"

type SortKey = "roi" | "roas" | "total_revenue" | "total_spend" | "total_orders"

// ───── Helpers ─────
function fmt(v: number): string {
    if (v >= 10000000) return `₹${(v / 10000000)?.toFixed(1)}Cr`
    if (v >= 100000) return `₹${(v / 100000)?.toFixed(1)}L`
    if (v >= 1000) return `₹${(v / 1000)?.toFixed(1)}K`
    return `₹${v?.toLocaleString("en-IN")}`
}

function fmtNum(v: number): string {
    if (v >= 100000) return `${(v / 100000)?.toFixed(1)}L`
    if (v >= 1000) return `${(v / 1000)?.toFixed(1)}K`
    return v?.toLocaleString()
}

function roiColor(roi: number): string {
    if (roi > 1) return "text-emerald-600"
    if (roi > 0) return "text-amber-600"
    return "text-rose-600"
}

function roiBg(roi: number): string {
    if (roi > 1) return "bg-emerald-100 text-emerald-700"
    if (roi > 0) return "bg-amber-100 text-amber-700"
    return "bg-rose-100 text-rose-700"
}

// ───── Custom Tooltips ─────
function RevenueSpendTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null

    

        return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} className="text-gray-600">
                    {p.name}: <strong style={{ color: p.color }}>{fmt(p.value)}</strong>
                </p>
            ))}
        </div>
    )
}

function RoiTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{d?.channel || label}</p>
            <p className="text-gray-600">ROI: <strong className={roiColor(d?.roi || 0)}>{(d?.roi || 0)?.toFixed(2)}x</strong></p>
            <p className="text-gray-600">ROAS: <strong className="text-blue-600">{(d?.roas || 0)?.toFixed(2)}x</strong></p>
            <p className="text-gray-600">Revenue: <strong>{fmt(d?.total_revenue || 0)}</strong></p>
        </div>
    )
}

function TrendTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const prevDate = payload[0]?.payload?.prev_date
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} className="text-gray-600">
                    {p.name}: <strong style={{ color: p.color }}>
                        {p.name === "ROI" ? `${p.value?.toFixed(2)}x` : fmt(p.value)}
                    </strong>
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

export default function ChannelRoiPage() {
    const [data, setData] = useState<ChannelRoiData | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortKey, setSortKey] = useState<SortKey>("roi")
    const [sortAsc, setSortAsc] = useState(false)

    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<ChannelRoiData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await api.get("/channel-roi", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) setData(res.data.data)
            } catch (e) {
                console.error("Failed to load Channel ROI data", e)
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
                const res = await api.get("/channel-roi", {
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
    const channels = data?.channels || []
    const trend = data?.trend || []
    const compareTrend = compareData?.trend || []

    // Table sort
    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(!sortAsc)
        else { setSortKey(key); setSortAsc(false) }
    }

    const sorted = useMemo(() =>
        [...channels].sort((a, b) => sortAsc ? (a[sortKey] as number) - (b[sortKey] as number) : (b[sortKey] as number) - (a[sortKey] as number)),
        [channels, sortKey, sortAsc]
    )

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />
        return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
    }

    // Revenue vs Spend bar data
    const barData = useMemo(() =>
        [...channels].sort((a, b) => b.total_revenue - a.total_revenue),
        [channels]
    )

    // ROI comparison data (horizontal bar)
    const roiData = useMemo(() =>
        [...channels].sort((a, b) => b.roi - a.roi),
        [channels]
    )

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Channel ROI
                    </h1>
                    <p className="text-sm text-gray-500">
                        Track marketing channel profitability — revenue, spend, ROI & ROAS
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || channels.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Channel", key: "channel" },
                                { header: "Revenue (₹)", key: "total_revenue", format: "currency" },
                                { header: "Spend (₹)", key: "total_spend", format: "currency" },
                                { header: "ROI", key: "roi", format: "number" },
                                { header: "ROAS", key: "roas", format: "number" },
                                { header: "Orders", key: "total_orders", format: "number" },
                                { header: "Unique Users", key: "unique_users", format: "number" },
                                { header: "AOV (₹)", key: "aov", format: "currency" },
                            ]
                            exportToExcel(sorted, cols, "Channel_ROI", startDate, endDate)
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
                    endpoint="/api/channel-roi"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Channel Roi — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Revenue */}
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Revenue
                            <DollarSign className="h-4 w-4 text-emerald-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-emerald-700">
                            {loading ? "—" : fmt(summary?.total_revenue || 0)}
                        </div>
                        <p className="text-xs text-emerald-500/70 mt-1">
                            {!loading && summary ? `${fmtNum(summary.total_orders)} orders` : "—"}
                        </p>
                    
                    <DeltaLine current={summary?.total_revenue} previous={compareSummary?.total_revenue} kind="currency" />
                    </CardContent>
                </Card>

                {/* Total Spend */}
                <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 shadow-sm border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-rose-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Spend
                            <PiggyBank className="h-4 w-4 text-rose-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-rose-700">
                            {loading ? "—" : fmt(summary?.total_spend || 0)}
                        </div>
                        <p className="text-xs text-rose-500/70 mt-1">
                            Marketing investment
                        </p>
                    
                    <DeltaLine current={summary?.total_spend} previous={compareSummary?.total_spend} kind="currency" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Avg ROI */}
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Overall ROI
                            <TrendingUp className="h-4 w-4 text-blue-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-extrabold ${roiColor(summary?.overall_roi || 0)}`}>
                            {loading ? "—" : `${(summary?.overall_roi || 0)?.toFixed(2)}x`}
                        </div>
                        <p className="text-xs text-blue-500/70 mt-1">
                            ROAS: {loading ? "—" : `${(summary?.overall_roas || 0)?.toFixed(2)}x`}
                        </p>
                    
                    <DeltaLine current={summary?.overall_roi} previous={compareSummary?.overall_roi} kind="count" />
                    </CardContent>
                </Card>

                {/* Best Channel */}
                <Card className="bg-gradient-to-br from-violet-50 to-violet-100/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-violet-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Best Channel
                            <Trophy className="h-4 w-4 text-violet-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-extrabold text-violet-700 truncate">
                            {loading ? "—" : summary?.best_channel || "N/A"}
                        </div>
                        <p className="text-xs text-violet-500/70 mt-1">
                            ROI: {loading ? "—" : `${(summary?.best_channel_roi || 0)?.toFixed(2)}x`}
                        </p>
                    
                    
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Insight Card ═══════ */}
            {!loading && channels.length > 0 && (
                <Card className="bg-gradient-to-r from-slate-50 to-blue-50/30 shadow-sm border-l-4 border-l-blue-400">
                    <CardContent className="py-4">
                        <p className="text-sm text-gray-600 leading-relaxed">
                            <strong className="text-gray-800">💡 Insight:</strong>{" "}
                            {summary?.best_channel && summary.best_channel !== "N/A" ? (
                                <>
                                    <strong className="text-emerald-700">{summary.best_channel}</strong> is your best performing channel
                                    with a <strong className={roiColor(summary.best_channel_roi)}>{summary.best_channel_roi?.toFixed(2)}x ROI</strong>.
                                    {summary.total_spend > 0 ? (
                                        <> Overall, for every ₹1 spent on marketing, you're generating <strong className="text-blue-600">₹{(summary.overall_roas || 0)?.toFixed(2)}</strong> in revenue.</>
                                    ) : (
                                        <> Add spend data via the API to see ROI calculations.</>
                                    )}
                                </>
                            ) : (
                                <>No channel data available for this period. Ensure UTM attribution data exists.</>
                            )}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* ═══════ Charts Row ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Revenue vs Spend Bar Chart */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-gray-500" />
                            Revenue vs Spend by Channel
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
                        ) : barData.length === 0 ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">No data</div>
                        ) : (
                            <div className="h-[320px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={barData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="channel" tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                                        <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<RevenueSpendTooltip />} />
                                        <Legend />
                                        <Bar dataKey="total_revenue" name="Revenue" fill={BAR_REVENUE} radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="total_spend" name="Spend" fill={BAR_SPEND} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ROI Comparison (Horizontal Bar) */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-gray-500" />
                            ROI Comparison by Channel
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
                        ) : roiData.length === 0 ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">No data</div>
                        ) : (
                            <div className="h-[320px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={roiData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tickFormatter={v => `${v}x`} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="channel" width={110} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<RoiTooltip />} />
                                        <ReferenceLine x={0} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1.5} />
                                        <Bar dataKey="roi" name="ROI" radius={[0, 6, 6, 0]}>
                                            {roiData.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.roi > 0 ? (CHANNEL_COLORS[entry.channel] || "#6366f1") : "#ef4444"} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Trend Chart ═══════ */}
            {trend.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-gray-500" />
                            Daily Revenue & Spend Trend
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trend.map((row, i) => ({ ...row, prev_revenue: compareTrend[i]?.total_revenue ?? null, prev_spend: compareTrend[i]?.total_spend ?? null, prev_date: compareTrend[i]?.date ?? null }))} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<TrendTooltip />} />
                                    <Legend />
                                    <Area type="monotone" dataKey="total_revenue" name="Revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} />
                                    <Area type="monotone" dataKey="total_spend" name="Spend" stroke="#f43f5e" fill="url(#spendGrad)" strokeWidth={2} />
                                    {compare.range && (
                                        <Area type="monotone" dataKey="prev_revenue" name="Revenue (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                                    )}
                                    {compare.range && (
                                        <Area type="monotone" dataKey="prev_spend" name="Spend (previous)" stroke="#fda4af" strokeDasharray="5 5" strokeWidth={2} fill="transparent" dot={false} connectNulls />
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ═══════ Channel Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <PiggyBank className="h-4 w-4 text-gray-500" />
                        Channel Breakdown
                        <span className="text-xs text-gray-400 font-normal ml-2">Click headers to sort</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
                    ) : sorted.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">No data available</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Channel</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("total_revenue")}>
                                            <span className="inline-flex items-center gap-1">Revenue <SortIcon col="total_revenue" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("total_spend")}>
                                            <span className="inline-flex items-center gap-1">Spend <SortIcon col="total_spend" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("roi")}>
                                            <span className="inline-flex items-center gap-1">ROI <SortIcon col="roi" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("roas")}>
                                            <span className="inline-flex items-center gap-1">ROAS <SortIcon col="roas" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("total_orders")}>
                                            <span className="inline-flex items-center gap-1">Orders <SortIcon col="total_orders" /></span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((ch) => {
                                        const isBest = ch.channel === summary?.best_channel
                                        return (
                                            <tr key={ch.channel} className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${isBest ? "bg-emerald-50/30" : ""}`}>
                                                <td className="py-3 px-4 font-medium text-gray-700">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS[ch.channel] || "#6366f1" }} />
                                                        {ch.channel}
                                                        {isBest && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">BEST</span>}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right text-emerald-600 font-medium">{fmt(ch.total_revenue)}</td>
                                                <td className="py-3 px-4 text-right text-rose-600 font-medium">{fmt(ch.total_spend)}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roiBg(ch.roi)}`}>
                                                        {ch.roi?.toFixed(2)}x
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right font-medium text-blue-600">{ch.roas?.toFixed(2)}x</td>
                                                <td className="py-3 px-4 text-right text-gray-600 font-medium">{ch.total_orders?.toLocaleString()}</td>
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
