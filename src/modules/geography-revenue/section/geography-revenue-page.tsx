"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    MapPin, TrendingUp, DollarSign, Users, Package,
    ArrowUpDown, ChevronUp, ChevronDown,
    ArrowDown, Minus, ArrowUp,
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface ZoneData {
    city: string
    state: string
    total_orders: number
    total_revenue: number
    avg_order_value: number
    unique_customers: number
}

interface StateSummary {
    state: string
    total_orders: number
    total_revenue: number
    avg_order_value: number
    unique_customers: number
}

interface GeoSummary {
    total_orders: number
    total_revenue: number
    avg_order_value: number
    unique_customers: number
}

interface GeoData {
    summary: GeoSummary
    zones: ZoneData[]
    top_cities: ZoneData[]
    top_states: StateSummary[]
    top_city: ZoneData | null
}

// ───── Constants ─────
const BAR_COLORS = [
    "#059669", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0",
    "#047857", "#0d9488", "#14b8a6", "#2dd4bf", "#5eead4",
]

type SortKey = "total_revenue" | "total_orders" | "avg_order_value" | "unique_customers"

// ───── Helpers ─────
function formatCurrency(value: number): string {
    if (typeof value !== "number" || isNaN(value)) return "₹0";
    if (value >= 10000000) return `₹${(value / 10000000)?.toFixed(1)}Cr`
    if (value >= 100000) return `₹${(value / 100000)?.toFixed(1)}L`
    if (value >= 1000) return `₹${(value / 1000)?.toFixed(1)}K`
    return `₹${value?.toFixed(0)}`
}

// ───── Custom Bar Tooltip ─────
function BarTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{d.city}, {d.state}</p>
            <p className="text-gray-600">Revenue: <strong className="text-emerald-700">{formatCurrency(d.total_revenue)}</strong></p>
            <p className="text-gray-600">Orders: <strong>{d.total_orders?.toLocaleString()}</strong></p>
            <p className="text-gray-600">AOV: <strong>{formatCurrency(d.avg_order_value)}</strong></p>
        </div>
    )
}

// ═══════════════════════════════════════════
//  STATE-LEVEL HEATMAP (same pattern as failure zones)
// ═══════════════════════════════════════════
function StateRevenueHeatmap({ states }: { states: StateSummary[] }) {
    if (!states.length) return null

    const maxRev = Math.max(...states.map(s => s.total_revenue))

    function getColor(revenue: number): string {
        const pct = maxRev > 0 ? revenue / maxRev : 0
        if (pct > 0.6) return "bg-emerald-800 text-white"
        if (pct > 0.4) return "bg-emerald-700 text-white"
        if (pct > 0.25) return "bg-emerald-600 text-white"
        if (pct > 0.1) return "bg-emerald-200 text-emerald-900"
        if (pct > 0.05) return "bg-emerald-100 text-emerald-900"
        return "bg-emerald-50 text-emerald-800"
    }

    // Sort by revenue desc
    const sorted = [...states].sort((a, b) => b.total_revenue - a.total_revenue)

    return (
        <Card className="shadow-sm">
            <CardHeader>
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    State-Level Revenue Heatmap
                    <span className="text-xs text-gray-400 font-normal ml-2">Color intensity = revenue share</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-2">
                    {sorted.map(s => (
                        <div
                            key={s.state}
                            className={`rounded-lg px-4 py-3 text-sm font-bold min-w-[110px] text-center ${getColor(s.total_revenue)}`}
                            title={`${s.state}: ${formatCurrency(s.total_revenue)} revenue, ${s.total_orders} orders`}
                        >
                            <div className="truncate">{s.state}</div>
                            <div className="text-[10px] font-normal opacity-80">{formatCurrency(s.total_revenue)}</div>
                        </div>
                    ))}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 mt-4 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 inline-block" /> Low</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-300 inline-block" /> Medium</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> High</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-700 inline-block" /> Top</span>
                </div>
            </CardContent>
        </Card>
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

export default function GeographyRevenuePage() {
    const [data, setData] = useState<GeoData | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortKey, setSortKey] = useState<SortKey>("total_revenue")
    const [sortAsc, setSortAsc] = useState(false)

    // Date range (default: last 30 days)
    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<GeoData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/geography-revenue", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load Geography Revenue data", e)
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
                const res = await axios.get("/api/geography-revenue", {
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
    const zones = data?.zones || []
    const topCities = data?.top_cities || []
    const topStates = data?.top_states || []
    const topCity = data?.top_city

    // Table sort
    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortAsc(!sortAsc)
        } else {
            setSortKey(key)
            setSortAsc(false)
        }
    }

    const MIN_ORDERS_TABLE = 3
    const sortedZones = useMemo(() => {
        const filtered = zones.filter(z => z.total_orders >= MIN_ORDERS_TABLE)
        return [...filtered].sort((a, b) => {
            const va = a[sortKey]
            const vb = b[sortKey]
            return sortAsc ? va - vb : vb - va
        })
    }, [zones, sortKey, sortAsc])

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />
        return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
    }

    
    

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Geography-Level Revenue
                    </h1>
                    <p className="text-sm text-gray-500">
                        Revenue distribution across cities &amp; states
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || (data?.zones || []).length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "City", key: "city" },
                                { header: "State", key: "state" },
                                { header: "Total Orders", key: "total_orders", format: "number" },
                                { header: "Total Revenue (₹)", key: "total_revenue", format: "currency" },
                                { header: "AOV (₹)", key: "avg_order_value", format: "currency" },
                                { header: "Unique Customers", key: "unique_customers", format: "number" },
                            ]
                            exportToExcel(data?.zones || [], cols, "Geography_Revenue", startDate, endDate)
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
                    endpoint="/api/geography-revenue"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Geography Revenue — Period Comparison"
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
                        <div className="text-4xl font-extrabold text-emerald-700">
                            {loading ? "—" : formatCurrency(summary?.total_revenue || 0)}
                        </div>
                        <p className="text-xs text-emerald-500/70 mt-1">
                            Across all zones in period
                        </p>
                    
                    <DeltaLine current={summary?.total_revenue} previous={compareSummary?.total_revenue} kind="currency" />
                    </CardContent>
                </Card>

                {/* Total Orders */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Orders
                            <Package className="h-4 w-4 text-blue-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-blue-700">
                            {loading ? "—" : (summary?.total_orders || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-blue-500/70 mt-1">
                            Paid/completed orders
                        </p>
                    
                    <DeltaLine current={summary?.total_orders} previous={compareSummary?.total_orders} kind="count" />
                    </CardContent>
                </Card>

                {/* AOV */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-violet-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Avg Order Value
                            <TrendingUp className="h-4 w-4 text-violet-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-violet-700">
                            {loading ? "—" : formatCurrency(summary?.avg_order_value || 0)}
                        </div>
                        <p className="text-xs text-violet-500/70 mt-1">
                            Revenue ÷ Orders
                        </p>
                    
                    <DeltaLine current={summary?.avg_order_value} previous={compareSummary?.avg_order_value} kind="currency" />
                    </CardContent>
                </Card>

                {/* Top City */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Top Revenue City
                            <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-extrabold text-amber-700 truncate">
                            {loading ? "—" : topCity?.city || "N/A"}
                        </div>
                        <p className="text-xs text-amber-500/70 mt-1">
                            {!loading && topCity ? `${formatCurrency(topCity.total_revenue)} · ${topCity.total_orders} orders` : "—"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Top 10 Cities Bar Chart ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-gray-500" />
                        Top 10 Cities by Revenue
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 text-sm">Loading chart…</div>
                    ) : topCities.length === 0 ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 text-sm">No data available</div>
                    ) : (
                        <div className="h-80 w-full" style={{ minHeight: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={topCities}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        type="number"
                                        tickFormatter={(v) => formatCurrency(v)}
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="city"
                                        width={120}
                                        tick={{ fontSize: 11, fill: "#374151" }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip content={<BarTooltip />} />
                                    <Bar dataKey="total_revenue" name="Revenue" radius={[0, 6, 6, 0]}>
                                        {topCities.map((_, idx) => (
                                            <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ State Heatmap ═══════ */}
            {!loading && <StateRevenueHeatmap states={topStates.length > 0 ? topStates : []} />}

            {/* ═══════ All Zones Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-500" />
                        All Zones Breakdown
                        <span className="text-xs text-gray-400 font-normal ml-2">Min {MIN_ORDERS_TABLE} orders · Click headers to sort</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
                    ) : sortedZones.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">No data available</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">City</th>
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">State</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("total_orders")}>
                                            <span className="inline-flex items-center gap-1">Orders <SortIcon col="total_orders" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("total_revenue")}>
                                            <span className="inline-flex items-center gap-1">Revenue <SortIcon col="total_revenue" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("avg_order_value")}>
                                            <span className="inline-flex items-center gap-1">AOV <SortIcon col="avg_order_value" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("unique_customers")}>
                                            <span className="inline-flex items-center gap-1">Customers <SortIcon col="unique_customers" /></span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedZones.map((row, idx) => {
                                        const isTop = idx < 3
                                        return (
                                            <tr
                                                key={`${row.city}-${row.state}`}
                                                className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${
                                                    isTop ? "bg-emerald-50/30" : ""
                                                }`}
                                            >
                                                <td className="py-3 px-4 font-medium text-gray-700">{row.city}</td>
                                                <td className="py-3 px-4 text-gray-500">{row.state}</td>
                                                <td className="py-3 px-4 text-right text-gray-600">
                                                    {row.total_orders?.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className="font-semibold text-emerald-700">{formatCurrency(row.total_revenue)}</span>
                                                </td>
                                                <td className="py-3 px-4 text-right text-violet-600 font-medium">
                                                    {formatCurrency(row.avg_order_value)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-gray-600">
                                                    {row.unique_customers?.toLocaleString()}
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
