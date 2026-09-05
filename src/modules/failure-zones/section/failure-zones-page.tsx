"use client"

import { useEffect, useState } from "react"
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
    MapPin, AlertTriangle, Package, TrendingDown, ArrowUpRight, ArrowDownRight, ChevronDown, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface FailureZoneSummary {
    total_orders: number
    failed_orders: number
    rto_orders: number
    avg_failure_rate: number
    avg_rto_rate: number
}

interface ZoneItem {
    city: string
    state: string
    total_orders: number
    failed_orders: number
    rto_orders: number
    failure_rate: number
    rto_rate: number
}

interface TopRtoState {
    state: string
    total_orders: number
    rto_orders: number
    rto_rate: number
}

interface FailureZonesData {
    summary: FailureZoneSummary
    zones: ZoneItem[]
    top_failure_cities: ZoneItem[]
    top_rto_states: TopRtoState[]
}

// ───── Constants ─────
const FAILURE_ALERT_THRESHOLD = 15
const MIN_ORDERS_TABLE = 5  // Hide noise zones with fewer than 5 orders from the table

// ───── Helpers ─────
function formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
}

// Color scale for heatmap-style state grid
function getHeatColor(rate: number): string {
    if (rate >= 40) return "bg-red-600 text-white"
    if (rate >= 30) return "bg-red-500 text-white"
    if (rate >= 20) return "bg-orange-500 text-white"
    if (rate >= 15) return "bg-amber-500 text-white"
    if (rate >= 10) return "bg-amber-400 text-gray-900"
    if (rate >= 5) return "bg-yellow-300 text-gray-900"
    return "bg-green-200 text-gray-900"
}

// ───── Tooltips ─────
function BarTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{d.city || d.state}</p>
            <p className="text-gray-600">
                Failure Rate: <strong className="text-red-600">{d.failure_rate ?? d.rto_rate}%</strong>
            </p>
            <p className="text-gray-500 text-xs">
                {d.failed_orders ?? d.rto_orders} / {d.total_orders} orders
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

export default function FailureZonesPage() {
    const [data, setData] = useState<FailureZonesData | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortKey, setSortKey] = useState<"failure_rate" | "rto_rate" | "total_orders">("total_orders")
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

    // Date range (default: last 30 days)
    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<FailureZonesData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/failure-zones", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load failure zones data", e)
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
                const res = await axios.get("/api/failure-zones", {
                    params: { start_date: compare.range!.start, end_date: compare.range!.end }
                })
                if (res.data?.success) setCompareData(res.data.data)
                else setCompareData(null)
            } catch (e) {
                console.error("Failed to load failure-zones compare data", e)
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
    const topFailureCities = data?.top_failure_cities || []
    const topRtoStates = data?.top_rto_states || []
    const avgFailure = summary?.avg_failure_rate || 0
    const isHighFailure = avgFailure > FAILURE_ALERT_THRESHOLD

    

    // Sorted zones for table — filter out noise (zones with very few orders)
    const significantZones = zones.filter(z => z.total_orders >= MIN_ORDERS_TABLE)
    const sortedZones = [...significantZones].sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        return sortDir === "desc" ? bVal - aVal : aVal - bVal
    })

    const handleSort = (key: typeof sortKey) => {
        if (sortKey === key) {
            setSortDir(sortDir === "desc" ? "asc" : "desc")
        } else {
            setSortKey(key)
            setSortDir("desc")
        }
    }

    const SortIcon = ({ col }: { col: typeof sortKey }) => (
        sortKey === col ? (
            <ChevronDown className={`inline h-3 w-3 ml-0.5 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />
        ) : null
    )

    // State heatmap grid data (aggregate by state)
    const stateMap: Record<string, { total: number; failed: number }> = {}
    for (const z of zones) {
        if (!stateMap[z.state]) stateMap[z.state] = { total: 0, failed: 0 }
        stateMap[z.state].total += z.total_orders
        stateMap[z.state].failed += z.failed_orders
    }
    const stateGrid = Object.entries(stateMap)
        .map(([state, v]) => ({
            state,
            total: v.total,
            failed: v.failed,
            rate: v.total > 0 ? Math.round((v.failed / v.total) * 100 * 10) / 10 : 0,
        }))
        .sort((a, b) => b.rate - a.rate)

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Failure Zones
                    </h1>
                    <p className="text-sm text-gray-500">
                        Identify geographical areas with highest delivery failures &amp; RTO rates
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || (data?.zones || []).length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "City", key: "city" },
                                { header: "State", key: "state" },
                                { header: "Shipped Orders", key: "total_orders", format: "number" },
                                { header: "Failed Orders", key: "failed_orders", format: "number" },
                                { header: "RTO Orders", key: "rto_orders", format: "number" },
                                { header: "Failure Rate (%)", key: "failure_rate", format: "percent" },
                                { header: "RTO Rate (%)", key: "rto_rate", format: "percent" },
                            ]
                            exportToExcel(data?.zones || [], cols, "Failure_Zones", startDate, endDate)
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
                    loading={compareLoading}
                />
            )}
            {compare.range && (
                <CompareSummary
                    endpoint="/api/failure-zones"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Failure Zones — Period Comparison"
                />
            )}


            {/* ═══════ High Failure Alert Banner ═══════ */}
            {!loading && isHighFailure && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <div className="bg-red-100 rounded-full p-2 shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-red-800">
                            High Failure Rate Alert — Avg {avgFailure.toFixed(1)}%
                        </p>
                        <p className="text-xs text-red-600">
                            Average failure rate exceeds {FAILURE_ALERT_THRESHOLD}% threshold. Review logistics in top failure zones.
                        </p>
                    </div>
                </div>
            )}

            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Orders */}
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Shipped Orders
                            <Package className="h-4 w-4 text-blue-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-blue-700">
                            {loading ? "—" : (summary?.total_orders || 0).toLocaleString()}
                        </div>
                        <p className="text-xs text-blue-500/70 mt-1">
                            All shipped orders across zones
                        </p>
                        <DeltaLine current={summary?.total_orders} previous={compareSummary?.total_orders} kind="count" />
                    </CardContent>
                </Card>

                {/* Failed Orders */}
                <Card className="bg-gradient-to-br from-red-50 to-red-100/50 shadow-sm border-l-4 border-l-red-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-red-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Failed Orders
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-red-700">
                            {loading ? "—" : (summary?.failed_orders || 0).toLocaleString()}
                        </div>
                        <p className="text-xs text-red-500/70 mt-1">
                            RETURNED + FAILED statuses
                        </p>
                        <DeltaLine current={summary?.failed_orders} previous={compareSummary?.failed_orders} kind="count" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Avg Failure Rate */}
                <Card className={`shadow-sm border-l-4 ${isHighFailure
                    ? "bg-gradient-to-br from-red-50 to-red-100/50 border-l-red-600"
                    : "bg-gradient-to-br from-white to-gray-50/50 border-l-amber-500"
                }`}>
                    <CardHeader className="pb-2">
                        <CardTitle className={`text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2 ${isHighFailure ? "text-red-600" : "text-amber-600"}`}>
                            Avg Failure Rate
                            <TrendingDown className={`h-4 w-4 ${isHighFailure ? "text-red-500" : "text-amber-500"} shrink-0`} />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-4xl font-extrabold ${isHighFailure ? "text-red-700" : "text-amber-700"}`}>
                            {loading ? "—" : `${avgFailure.toFixed(1)}%`}
                        </div>
                        <p className={`text-xs mt-1 ${isHighFailure ? "text-red-500/70" : "text-amber-500/70"}`}>
                            {isHighFailure ? `⚠ Above ${FAILURE_ALERT_THRESHOLD}% threshold` : "✓ Within acceptable range"}
                        </p>
                        <DeltaLine current={summary?.avg_failure_rate} previous={compareSummary?.avg_failure_rate} kind="percent" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Avg RTO Rate */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-orange-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Avg RTO Rate
                            <MapPin className="h-4 w-4 text-orange-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-orange-600">
                            {loading ? "—" : `${(summary?.avg_rto_rate || 0).toFixed(1)}%`}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Includes post-delivery returns
                        </p>
                        <DeltaLine current={summary?.avg_rto_rate} previous={compareSummary?.avg_rto_rate} kind="percent" lowerIsBetter />
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Charts: Top Failure Cities + Top RTO States ═══════ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top 10 Failure Cities */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            Top 10 Failure Cities
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">Loading chart…</div>
                        ) : topFailureCities.length === 0 ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">No data available</div>
                        ) : (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart layout="vertical" data={topFailureCities} margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(v) => `${v}%`} />
                                        <YAxis dataKey="city" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#4b5563" }} width={90} />
                                        <Tooltip cursor={{ fill: "#f3f4f6" }} content={<BarTooltip />} />
                                        <Bar dataKey="failure_rate" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={24}>
                                            {topFailureCities.map((entry, i) => (
                                                <Cell key={i} fill={entry.failure_rate >= FAILURE_ALERT_THRESHOLD ? "#dc2626" : "#ef4444"} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Top 10 RTO States */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-orange-500" />
                            Top 10 RTO States
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">Loading chart…</div>
                        ) : topRtoStates.length === 0 ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">No data available</div>
                        ) : (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart layout="vertical" data={topRtoStates} margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(v) => `${v}%`} />
                                        <YAxis dataKey="state" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#4b5563" }} width={100} />
                                        <Tooltip cursor={{ fill: "#f3f4f6" }} content={<BarTooltip />} />
                                        <Bar dataKey="rto_rate" fill="#f97316" radius={[0, 4, 4, 0]} maxBarSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ State Heatmap Grid ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-500" />
                        State-Level Failure Heatmap
                        <span className="text-xs text-gray-400 font-normal ml-2">Color intensity = failure rate</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
                    ) : stateGrid.length === 0 ? (
                        <div className="h-32 flex items-center justify-center text-gray-400 text-sm">No data available</div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {stateGrid.map((s) => (
                                <div
                                    key={s.state}
                                    className={`rounded-lg px-3 py-2 text-xs font-semibold shadow-sm cursor-default transition-transform hover:scale-105 ${getHeatColor(s.rate)}`}
                                    title={`${s.state}: ${s.failed}/${s.total} orders failed (${s.rate}%)`}
                                >
                                    <div className="truncate max-w-[100px]">{s.state}</div>
                                    <div className="text-[10px] font-bold opacity-90">{s.rate}%</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Legend */}
                    {!loading && stateGrid.length > 0 && (
                        <div className="flex items-center gap-3 mt-4 text-[10px] text-gray-500">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200" /> &lt;5%</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-300" /> 5-10%</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> 10-15%</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500" /> 15-20%</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500" /> 20-30%</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> 30-40%</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600" /> 40%+</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Zone Breakdown Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-500" />
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
                                        <th
                                            className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors select-none"
                                            onClick={() => handleSort("total_orders")}
                                        >
                                            Shipped Orders <SortIcon col="total_orders" />
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Failed</th>
                                        <th
                                            className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer hover:text-red-600 transition-colors select-none"
                                            onClick={() => handleSort("failure_rate")}
                                        >
                                            Failure Rate <SortIcon col="failure_rate" />
                                        </th>
                                        <th
                                            className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer hover:text-orange-600 transition-colors select-none"
                                            onClick={() => handleSort("rto_rate")}
                                        >
                                            RTO Rate <SortIcon col="rto_rate" />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedZones.slice(0, 50).map((zone, i) => {
                                        const isHigh = zone.failure_rate >= FAILURE_ALERT_THRESHOLD
                                        return (
                                            <tr
                                                key={`${zone.city}-${zone.state}-${i}`}
                                                className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${isHigh ? "bg-red-50/30" : ""}`}
                                            >
                                                <td className="py-3 px-4 font-medium text-gray-700">{zone.city}</td>
                                                <td className="py-3 px-4 text-gray-500">{zone.state}</td>
                                                <td className="py-3 px-4 text-right text-gray-600">{zone.total_orders.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-right text-red-600 font-medium">{zone.failed_orders.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        isHigh ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                                                    }`}>
                                                        {isHigh ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                                        {zone.failure_rate.toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right text-orange-600 font-medium">
                                                    {zone.rto_rate.toFixed(1)}%
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                            {sortedZones.length > 50 && (
                                <p className="text-xs text-gray-400 text-center py-2">
                                    Showing top 50 of {sortedZones.length} zones
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
