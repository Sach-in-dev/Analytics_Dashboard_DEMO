"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { api } from "@/lib/axios"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Truck, TrendingUp, Timer, Award, Package,
    ArrowUpDown, ChevronUp, ChevronDown, AlertTriangle,
    ArrowDown, Minus, ArrowUp,
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface CourierData {
    courier_partner: string
    total_orders: number
    delivered_orders: number
    rto_orders: number
    failed_orders: number
    rto_rate: number
    failure_rate: number
    avg_delivery_time: number
}

interface SummaryData {
    total_orders: number
    delivered_orders: number
    rto_orders: number
    failed_orders: number
    rto_rate: number
    failure_rate: number
    avg_delivery_time: number
}

interface CourierPerfData {
    summary: SummaryData
    couriers: CourierData[]
    best_courier: CourierData | null
    worst_courier: CourierData | null
    fastest_courier: CourierData | null
}

// ───── Constants ─────
const RTO_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16"]
const DELIVERY_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#c084fc"]

type SortKey = "total_orders" | "rto_rate" | "failure_rate" | "avg_delivery_time" | "delivered_orders"

// ───── Helpers ─────
function formatNum(v: number): string {
    if (v >= 100000) return `${(v / 100000).toFixed(1)}L`
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`
    return v.toLocaleString()
}

// ───── Custom Tooltips ─────
function RtoTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload

    

        return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{d.courier_partner}</p>
            <p className="text-gray-600">RTO Rate: <strong className="text-rose-600">{d.rto_rate}%</strong></p>
            <p className="text-gray-600">RTO Orders: <strong>{d.rto_orders}</strong></p>
            <p className="text-gray-600">Total: <strong>{d.total_orders}</strong></p>
        </div>
    )
}

function DeliveryTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{d.courier_partner}</p>
            <p className="text-gray-600">Avg Delivery: <strong className="text-blue-600">{d.avg_delivery_time} days</strong></p>
            <p className="text-gray-600">Delivered: <strong>{d.delivered_orders}</strong></p>
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

export default function CourierPerformancePage() {
    const [data, setData] = useState<CourierPerfData | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortKey, setSortKey] = useState<SortKey>("total_orders")
    const [sortAsc, setSortAsc] = useState(false)

    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<CourierPerfData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await api.get("/courier-performance", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load Courier Performance data", e)
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
                const res = await api.get("/courier-performance", {
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
    const couriers = data?.couriers || []
    const bestCourier = data?.best_courier
    const fastestCourier = data?.fastest_courier

    // Table sort
    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(!sortAsc)
        else { setSortKey(key); setSortAsc(false) }
    }

    const sortedCouriers = useMemo(() => {
        return [...couriers].sort((a, b) => {
            const va = a[sortKey]
            const vb = b[sortKey]
            return sortAsc ? va - vb : vb - va
        })
    }, [couriers, sortKey, sortAsc])

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />
        return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
    }

    // Chart data
    const rtoChartData = useMemo(() =>
        [...couriers].filter(c => c.total_orders >= 5).sort((a, b) => b.rto_rate - a.rto_rate),
        [couriers]
    )
    const deliveryChartData = useMemo(() =>
        [...couriers].filter(c => c.avg_delivery_time > 0).sort((a, b) => a.avg_delivery_time - b.avg_delivery_time),
        [couriers]
    )

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Courier Performance
                    </h1>
                    <p className="text-sm text-gray-500">
                        Evaluate logistics partners by speed, RTO &amp; failure rates
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || (data?.couriers || []).length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Courier", key: "courier_partner" },
                                { header: "Orders With Courier", key: "total_orders", format: "number" },
                                { header: "Delivered", key: "delivered_orders", format: "number" },
                                { header: "RTO Orders", key: "rto_orders", format: "number" },
                                { header: "RTO Rate (%)", key: "rto_rate", format: "percent" },
                                { header: "Failed Orders", key: "failed_orders", format: "number" },
                                { header: "Failure Rate (%)", key: "failure_rate", format: "percent" },
                                { header: "Avg Delivery Time (days)", key: "avg_delivery_time", format: "number" },
                            ]
                            exportToExcel(data?.couriers || [], cols, "Courier_Performance", startDate, endDate)
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
                    endpoint="/api/courier-performance"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Courier Performance — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Orders */}
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Orders With Courier
                            <Package className="h-4 w-4 text-blue-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-blue-700">
                            {loading ? "—" : formatNum(summary?.total_orders || 0)}
                        </div>
                        <p className="text-xs text-blue-500/70 mt-1">
                            Orders with carrier assigned
                        </p>
                    
                    <DeltaLine current={summary?.total_orders} previous={compareSummary?.total_orders} kind="count" />
                    </CardContent>
                </Card>

                {/* Avg RTO Rate */}
                <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 shadow-sm border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-rose-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Avg RTO Rate
                            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-rose-700">
                            {loading ? "—" : `${summary?.rto_rate || 0}%`}
                        </div>
                        <p className="text-xs text-rose-500/70 mt-1">
                            {!loading ? `${summary?.rto_orders || 0} RTO orders` : "—"}
                        </p>
                    
                    <DeltaLine current={summary?.rto_rate} previous={compareSummary?.rto_rate} kind="percent" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Avg Delivery Time */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-violet-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Avg Delivery Time
                            <Timer className="h-4 w-4 text-violet-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-violet-700">
                            {loading ? "—" : `${summary?.avg_delivery_time || 0} days`}
                        </div>
                        <p className="text-xs text-violet-500/70 mt-1">
                            Across all couriers
                        </p>
                    
                    <DeltaLine current={summary?.avg_delivery_time} previous={compareSummary?.avg_delivery_time} kind="days" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Best Courier */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Best Courier
                            <Award className="h-4 w-4 text-emerald-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-extrabold text-emerald-700 truncate">
                            {loading ? "—" : bestCourier?.courier_partner || "N/A"}
                        </div>
                        <p className="text-xs text-emerald-500/70 mt-1">
                            {!loading && bestCourier
                                ? `RTO: ${bestCourier.rto_rate}% · ${fastestCourier?.courier_partner === bestCourier.courier_partner ? "Fastest" : `${bestCourier.avg_delivery_time}d avg`}`
                                : "—"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Charts Row ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* RTO Rate by Courier */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-gray-500" />
                            RTO Rate by Courier
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
                        ) : rtoChartData.length === 0 ? (
                            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data</div>
                        ) : (
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={rtoChartData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="courier_partner" width={100} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<RtoTooltip />} />
                                        <Bar dataKey="rto_rate" name="RTO Rate %" radius={[0, 6, 6, 0]}>
                                            {rtoChartData.map((_, idx) => (
                                                <Cell key={idx} fill={RTO_COLORS[idx % RTO_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Delivery Time Comparison */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Timer className="h-4 w-4 text-gray-500" />
                            Delivery Time Comparison
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
                        ) : deliveryChartData.length === 0 ? (
                            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data</div>
                        ) : (
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={deliveryChartData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tickFormatter={v => `${v}d`} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="courier_partner" width={100} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<DeliveryTooltip />} />
                                        <Bar dataKey="avg_delivery_time" name="Avg Days" radius={[0, 6, 6, 0]}>
                                            {deliveryChartData.map((_, idx) => (
                                                <Cell key={idx} fill={DELIVERY_COLORS[idx % DELIVERY_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Courier Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Truck className="h-4 w-4 text-gray-500" />
                        Courier Breakdown
                        <span className="text-xs text-gray-400 font-normal ml-2">Click headers to sort</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
                    ) : sortedCouriers.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">No data available</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Courier</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("total_orders")}>
                                            <span className="inline-flex items-center gap-1">Orders <SortIcon col="total_orders" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("delivered_orders")}>
                                            <span className="inline-flex items-center gap-1">Delivered <SortIcon col="delivered_orders" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">RTO</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Failed</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("rto_rate")}>
                                            <span className="inline-flex items-center gap-1">RTO % <SortIcon col="rto_rate" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("failure_rate")}>
                                            <span className="inline-flex items-center gap-1">Fail % <SortIcon col="failure_rate" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("avg_delivery_time")}>
                                            <span className="inline-flex items-center gap-1">Avg Days <SortIcon col="avg_delivery_time" /></span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedCouriers.map((c, idx) => {
                                        const isBest = bestCourier?.courier_partner === c.courier_partner
                                        return (
                                            <tr
                                                key={c.courier_partner}
                                                className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${
                                                    isBest ? "bg-emerald-50/30" : ""
                                                }`}
                                            >
                                                <td className="py-3 px-4 font-medium text-gray-700">
                                                    <div className="flex items-center gap-2">
                                                        <Truck className="h-4 w-4 text-gray-400" />
                                                        {c.courier_partner}
                                                        {isBest && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">BEST</span>}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right text-gray-600 font-medium">{c.total_orders.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-right text-emerald-600 font-medium">{c.delivered_orders.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-right text-rose-600">{c.rto_orders.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-right text-orange-600">{c.failed_orders.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`font-semibold ${c.rto_rate > 10 ? "text-rose-600" : c.rto_rate > 5 ? "text-amber-600" : "text-emerald-600"}`}>
                                                        {c.rto_rate}%
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`font-semibold ${c.failure_rate > 10 ? "text-rose-600" : c.failure_rate > 5 ? "text-amber-600" : "text-emerald-600"}`}>
                                                        {c.failure_rate}%
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`font-semibold ${c.avg_delivery_time > 7 ? "text-rose-600" : c.avg_delivery_time > 5 ? "text-amber-600" : "text-blue-600"}`}>
                                                        {c.avg_delivery_time > 0 ? `${c.avg_delivery_time}d` : "—"}
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
