"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
    ResponsiveContainer, Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    TrendingUp, DollarSign, ShoppingCart, Target, Megaphone, ArrowUpDown,
    ArrowDown, Minus, ArrowUp,
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface UtmComboRow {
    utm_source: string
    utm_medium: string
    utm_campaign: string
    utm_term: string
    utm_content: string
    users: number
    sessions: number
    orders: number
    revenue: number
    conversion_rate: number
    aov: number
}

interface SourceRow {
    source: string
    users: number
    sessions: number
    orders: number
    revenue: number
    conversion_rate: number
    aov: number
}

interface CampaignRow {
    campaign: string
    users: number
    sessions: number
    orders: number
    revenue: number
    conversion_rate: number
    aov: number
}

interface Summary {
    total_users: number
    total_sessions: number
    total_orders: number
    total_revenue: number
    avg_conversion_rate: number
    avg_aov: number
    top_source: SourceRow | null
    top_campaign: CampaignRow | null
}

interface AttrData {
    data: UtmComboRow[]
    by_source: SourceRow[]
    by_campaign: CampaignRow[]
    summary: Summary
    last_updated: string | null
}

// ───── Helpers ─────
function formatCurrency(value: number): string {
    if (typeof value !== "number" || isNaN(value)) return "₹0";
    if (value >= 10000000) return `₹${(value / 10000000)?.toFixed(2)}Cr`
    if (value >= 100000) return `₹${(value / 100000)?.toFixed(2)}L`
    if (value >= 1000) return `₹${(value / 1000)?.toFixed(1)}K`
    return `₹${value?.toFixed(0)}`
}

const BAR_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
]

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null

    

        return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} className="text-gray-600">
                    {p.name}: {formatCurrency(p.value)}
                </p>
            ))}
        </div>
    )
}

// ═══════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════




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

export default function UtmAttributionPage() {
    const [data, setData] = useState<AttrData | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortField, setSortField] = useState<string>("revenue")
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<AttrData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/utm-attribution", {
                    params: { start_date: startDate, end_date: endDate },
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load UTM attribution", e)
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
                const res = await axios.get("/api/utm-attribution", {
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


    const summary = data?.summary || {
        total_users: 0, total_sessions: 0, total_orders: 0,
        total_revenue: 0, avg_conversion_rate: 0, avg_aov: 0,
        top_source: null, top_campaign: null,
    }
    const compareSummary = compareData?.summary || {
        total_users: 0, total_sessions: 0, total_orders: 0,
        total_revenue: 0, avg_conversion_rate: 0, avg_aov: 0,
        top_source: null, top_campaign: null,
    }

    const sortedData = useMemo(() => {
        if (!data?.data) return []
        const sorted = [...data.data]
        sorted.sort((a, b) => {
            const va = (a as any)[sortField] ?? 0
            const vb = (b as any)[sortField] ?? 0
            return sortDir === "desc" ? vb - va : va - vb
        })
        return sorted
    }, [data, sortField, sortDir])

    const toggleSort = (field: string) => {
        if (sortField === field) {
            setSortDir(sortDir === "desc" ? "asc" : "desc")
        } else {
            setSortField(field)
            setSortDir("desc")
        }
    }

    const SortHeader = ({ field, label }: { field: string; label: string }) => (
        <th
            className="px-3 py-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-800 select-none whitespace-nowrap"
            onClick={() => toggleSort(field)}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                {sortField === field && (
                    <ArrowUpDown className="h-3 w-3 text-blue-500" />
                )}
            </span>
        </th>
    )

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        UTM Attribution
                    </h1>
                    <p className="text-sm text-gray-500">
                        Track marketing channel performance — which campaigns and sources drive revenue
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || sortedData.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Source", key: "utm_source" },
                                { header: "Medium", key: "utm_medium" },
                                { header: "Campaign", key: "utm_campaign" },
                                { header: "Users", key: "users", format: "number" },
                                { header: "Sessions", key: "sessions", format: "number" },
                                { header: "Orders", key: "orders", format: "number" },
                                { header: "Revenue (₹)", key: "revenue", format: "currency" },
                                { header: "Conv Rate (%)", key: "conversion_rate", format: "percent" },
                                { header: "AOV (₹)", key: "aov", format: "currency" },
                            ]
                            exportToExcel(sortedData, cols, "UTM_Attribution", startDate, endDate)
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
                    endpoint="/api/utm-attribution"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Utm Attribution — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                        <p className="text-xs text-blue-500/70 mt-1">across all channels</p>
                    
                    <DeltaLine current={summary?.total_revenue} previous={compareSummary?.total_revenue} kind="currency" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Orders
                            <ShoppingCart className="h-4 w-4 text-emerald-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-emerald-700">
                            {loading ? "—" : (summary?.total_orders || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            {summary.total_sessions?.toLocaleString()} sessions
                        </p>
                    
                    <DeltaLine current={summary?.total_orders} previous={compareSummary?.total_orders} kind="count" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Avg Conversion
                            <Target className="h-4 w-4 text-amber-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-amber-600">
                            {loading ? "—" : `${summary.avg_conversion_rate}%`}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            AOV: {formatCurrency(summary.avg_aov)}
                        </p>
                    
                    <DeltaLine current={summary?.avg_conversion_rate} previous={compareSummary?.avg_conversion_rate} kind="percent" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Top Channel
                            <Megaphone className="h-4 w-4 text-violet-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-3xl font-extrabold text-gray-800">—</div>
                        ) : summary.top_source ? (
                            <>
                                <div className="text-2xl font-extrabold text-violet-700 capitalize">
                                    {summary.top_source.source}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    {formatCurrency(summary.top_source.revenue)} · {summary.top_source.orders?.toLocaleString()} orders
                                </p>
                            </>
                        ) : (
                            <div className="text-sm text-gray-400">No data</div>
                        )}
                    
                    
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Revenue by Source Chart ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-gray-500" />
                            Revenue by Source
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading || !data?.by_source?.length ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                                {loading ? "Loading…" : "No data"}
                            </div>
                        ) : (
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.by_source.slice(0, 10)} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
                                        <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={90} />
                                        <ReTooltip content={<ChartTooltip />} />
                                        <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                                            {data.by_source.slice(0, 10).map((_, i) => (
                                                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Revenue by Campaign */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Megaphone className="h-4 w-4 text-gray-500" />
                            Revenue by Campaign
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading || !data?.by_campaign?.length ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                                {loading ? "Loading…" : "No campaigns with attributed revenue"}
                            </div>
                        ) : (
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.by_campaign.slice(0, 10)} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
                                        <YAxis type="category" dataKey="campaign" tick={{ fontSize: 11 }} width={120} />
                                        <ReTooltip content={<ChartTooltip />} />
                                        <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                                            {data.by_campaign.slice(0, 10).map((_, i) => (
                                                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Detailed Attribution Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-gray-500" />
                        Attribution Breakdown
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
                    ) : sortedData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left px-3 py-2 font-semibold text-gray-600">Source</th>
                                        <th className="text-left px-3 py-2 font-semibold text-gray-600">Medium</th>
                                        <th className="text-left px-3 py-2 font-semibold text-gray-600">Campaign</th>
                                        <SortHeader field="sessions" label="Sessions" />
                                        <SortHeader field="orders" label="Orders" />
                                        <SortHeader field="revenue" label="Revenue" />
                                        <SortHeader field="conversion_rate" label="Conv %" />
                                        <SortHeader field="aov" label="AOV" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedData.slice(0, 50).map((row, idx) => (
                                        <tr
                                            key={`${row.utm_source}-${row.utm_medium}-${row.utm_campaign}-${idx}`}
                                            className="border-b border-gray-100 hover:bg-gray-50"
                                        >
                                            <td className="px-3 py-2 font-medium text-gray-800 capitalize">
                                                {row.utm_source}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600 capitalize">
                                                {row.utm_medium === "none" ? "—" : row.utm_medium}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">
                                                {row.utm_campaign === "none" ? "—" : row.utm_campaign}
                                            </td>
                                            <td className="px-3 py-2 text-center text-gray-700">
                                                {row.sessions?.toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-center text-gray-700">
                                                {row.orders?.toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium text-blue-700">
                                                {formatCurrency(row.revenue)}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    row.conversion_rate >= 50 ? "bg-emerald-100 text-emerald-700" :
                                                    row.conversion_rate >= 20 ? "bg-blue-100 text-blue-700" :
                                                    row.conversion_rate >= 5 ? "bg-amber-100 text-amber-700" :
                                                    "bg-gray-100 text-gray-600"
                                                }`}>
                                                    {row.conversion_rate}%
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-700">
                                                {formatCurrency(row.aov)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Source Leaderboard ═══════ */}
            {!loading && data?.by_source && data.by_source.length > 0 && (
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Target className="h-4 w-4 text-gray-500" />
                            Channel Performance Leaderboard
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {data.by_source.slice(0, 6).map((src, idx) => (
                                <div
                                    key={src.source}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors"
                                >
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                                        style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }}
                                    >
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-800 capitalize truncate">
                                            {src.source}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {src.orders?.toLocaleString()} orders · {src.conversion_rate}% conv
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-bold text-blue-700 text-sm">
                                            {formatCurrency(src.revenue)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
