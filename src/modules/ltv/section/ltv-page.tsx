"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, Legend
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Crown, Heart, UserPlus, AlertTriangle, UserX, Users, DollarSign, TrendingUp, BarChart3, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface SegmentLtv {
    id: string
    segment: string
    total_customers: number
    total_revenue: number
    avg_ltv: number
    createdAt: string
}

interface SummaryData {
    total_customers: number
    total_revenue: number
    avg_ltv: number
}

interface LtvData {
    summary: SummaryData
    segments: SegmentLtv[]
}

// ───── Segment Color & Style Map ─────
const SEGMENT_CONFIG: Record<string, {
    color: string
    bg: string
    text: string
    border: string
    icon: typeof Crown
    gradient: string
}> = {
    "Champions": {
        color: "#10b981",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-l-emerald-500",
        icon: Crown,
        gradient: "from-emerald-500 to-emerald-600",
    },
    "Loyal Customers": {
        color: "#3b82f6",
        bg: "bg-blue-50",
        text: "text-blue-700",
        border: "border-l-blue-500",
        icon: Heart,
        gradient: "from-blue-500 to-blue-600",
    },
    "Potential Loyalists": {
        color: "#8b5cf6",
        bg: "bg-violet-50",
        text: "text-violet-700",
        border: "border-l-violet-500",
        icon: UserPlus,
        gradient: "from-violet-500 to-violet-600",
    },
    "At Risk": {
        color: "#f59e0b",
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-l-amber-500",
        icon: AlertTriangle,
        gradient: "from-amber-500 to-amber-600",
    },
    "Lost Customers": {
        color: "#ef4444",
        bg: "bg-rose-50",
        text: "text-rose-700",
        border: "border-l-rose-500",
        icon: UserX,
        gradient: "from-rose-500 to-rose-600",
    },
}

const getSegmentConfig = (segment: string) =>
    SEGMENT_CONFIG[segment] || {
        color: "#6b7280",
        bg: "bg-gray-50",
        text: "text-gray-700",
        border: "border-l-gray-500",
        icon: Users,
        gradient: "from-gray-500 to-gray-600",
    }

const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(val || 0)

const formatCompact = (val: number) => {
    if (val >= 10000000) return `₹${(val / 10000000)?.toFixed(2)}Cr`
    if (val >= 100000) return `₹${(val / 100000)?.toFixed(2)}L`
    if (val >= 1000) return `₹${(val / 1000)?.toFixed(1)}K`
    return `₹${val?.toFixed(0)}`
}

// ───── Segment Badge ─────
function SegmentBadge({ segment }: { segment: string }) {
    const config = getSegmentConfig(segment)
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}
        >
            <config.icon className="h-3 w-3" />
            {segment}
        </span>
    )
}

// ───── Custom Bar Chart Tooltip ─────
function CustomBarTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800">{label}</p>
            {payload.map((p: any, idx: number) => (
                <p key={idx} className="text-gray-500 mt-1">
                    {p.name}: {formatCurrency(p.value)}
                </p>
            ))}
        </div>
    )
}

// ───── Custom Pie Tooltip ─────
function CustomPieTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const { name, value, payload: data } = payload[0]
    return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800">{name}</p>
            <p className="text-gray-500 mt-1">
                {value?.toLocaleString()} customers
                {data.percentage ? ` (${data.percentage}%)` : ""}
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

export default function LtvPage() {
    const [data, setData] = useState<LtvData | null>(null)
    const [loading, setLoading] = useState(true)

    // Date range (default: last 1 year) — same pattern as RFM page
    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<LtvData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/ltv-by-segment", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load LTV data", e)
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
                const res = await axios.get("/api/ltv-by-segment", {
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


    // Derived chart data
    const barData = (data?.segments || []).map((s) => ({
        name: s.segment.length > 12 ? s.segment.slice(0, 12) + "…" : s.segment,
        fullName: s.segment,
        avg_ltv: s.avg_ltv,
        total_revenue: s.total_revenue,
        fill: getSegmentConfig(s.segment).color,
    }))

    const totalCustomers = data?.summary?.total_customers || 0
    const pieData = (data?.segments || []).map((s) => ({
        name: s.segment,
        value: s.total_customers,
        percentage: totalCustomers > 0 ? ((s.total_customers / totalCustomers) * 100)?.toFixed(1) : "0",
        fill: getSegmentConfig(s.segment).color,
    }))

    // Sorted segments for the table (highest revenue first)
    const sortedSegments = [...(data?.segments || [])].sort(
        (a, b) => b.total_revenue - a.total_revenue
    )

    // Revenue contribution bars
    const totalRevenue = data?.summary?.total_revenue || 0

    
    

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Customer Lifetime Value by Segment
                    </h1>
                    <p className="text-sm text-gray-500">
                        LTV metrics grouped by RFM customer segments — revenue contribution & average value
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || (data?.segments || []).length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Segment", key: "segment" },
                                { header: "Total Customers", key: "total_customers", format: "number" },
                                { header: "Total Revenue (₹)", key: "total_revenue", format: "currency" },
                                { header: "Avg LTV (₹)", key: "avg_ltv", format: "currency" },
                            ]
                            exportToExcel(data?.segments || [], cols, "LTV_By_Segment", startDate, endDate)
                        }}
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
                    endpoint="/api/ltv-by-segment"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Ltv — Period Comparison"
                />
            )}


            {/* ═══════ Top KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Total Customers */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-gray-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Customers
                            <Users className="h-4 w-4 text-gray-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-gray-800">
                            {loading ? "—" : (data?.summary?.total_customers || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Across all segments
                        </p>
                    
                    <DeltaLine current={data?.summary?.total_customers} previous={compareData?.summary?.total_customers} kind="count" />
                    </CardContent>
                </Card>

                {/* Total Revenue */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Lifetime Revenue
                            <DollarSign className="h-4 w-4 text-emerald-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-emerald-700">
                            {loading ? "—" : formatCompact(data?.summary?.total_revenue || 0)}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            {loading ? "" : formatCurrency(data?.summary?.total_revenue || 0)}
                        </p>
                    
                    <DeltaLine current={data?.summary?.total_revenue} previous={compareData?.summary?.total_revenue} kind="currency" />
                    </CardContent>
                </Card>

                {/* Overall Avg LTV */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Average LTV
                            <TrendingUp className="h-4 w-4 text-blue-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-blue-700">
                            {loading ? "—" : formatCurrency(data?.summary?.avg_ltv || 0)}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Revenue per customer
                        </p>
                    
                    <DeltaLine current={data?.summary?.avg_ltv} previous={compareData?.summary?.avg_ltv} kind="currency" />
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Charts Row ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Average LTV Bar Chart */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-gray-500" />
                            Average LTV by Segment
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                                Loading chart…
                            </div>
                        ) : (
                            <div className="h-72 w-full" style={{ minHeight: 288 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={barData}
                                        margin={{ top: 5, right: 20, left: 10, bottom: 40 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fill: "#6b7280", fontSize: 11 }}
                                            angle={-25}
                                            textAnchor="end"
                                            height={60}
                                        />
                                        <YAxis
                                            tick={{ fill: "#6b7280", fontSize: 11 }}
                                            tickFormatter={(v) => formatCompact(v)}
                                        />
                                        <Tooltip content={<CustomBarTooltip />} />
                                        <Bar
                                            dataKey="avg_ltv"
                                            name="Avg LTV"
                                            radius={[6, 6, 0, 0]}
                                            maxBarSize={60}
                                        >
                                            {barData.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Customer Distribution Pie */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Users className="h-4 w-4 text-gray-500" />
                            Customer Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                                Loading chart…
                            </div>
                        ) : (
                            <div className="h-72 w-full" style={{ minHeight: 288 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={100}
                                            innerRadius={55}
                                            paddingAngle={3}
                                            strokeWidth={2}
                                            stroke="#fff"
                                        >
                                            {pieData.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomPieTooltip />} />
                                        <Legend
                                            verticalAlign="bottom"
                                            iconType="circle"
                                            iconSize={8}
                                            formatter={(value: string) => (
                                                <span className="text-xs text-gray-600">
                                                    {value}
                                                </span>
                                            )}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Revenue Contribution Bars ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-500" />
                        Revenue Contribution by Segment
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
                            Loading…
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {sortedSegments.map((seg) => {
                                const config = getSegmentConfig(seg.segment)
                                const pct = totalRevenue > 0
                                    ? ((seg.total_revenue / totalRevenue) * 100)
                                    : 0
                                return (
                                    <div key={seg.segment} className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-2.5 h-2.5 rounded-full"
                                                    style={{ backgroundColor: config.color }}
                                                />
                                                <span className="text-sm font-medium text-gray-800">
                                                    {seg.segment}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm font-semibold text-gray-700">
                                                    {formatCurrency(seg.total_revenue)}
                                                </span>
                                                <span className="text-xs text-gray-400 w-12 text-right">
                                                    {pct?.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                            <div
                                                className="h-2.5 rounded-full transition-all duration-700 ease-out"
                                                style={{
                                                    width: `${Math.max(pct, 0.5)}%`,
                                                    backgroundColor: config.color,
                                                }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Segment Breakdown Table ═══════ */}
            <Card className="shadow-sm border">
                <CardHeader className="border-b bg-gray-50/50">
                    <CardTitle className="text-sm font-semibold text-gray-700">
                        Segment Breakdown
                        {!loading && (
                            <span className="ml-2 text-xs font-normal text-gray-400">
                                ({(data?.segments || []).length} segments)
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>

                <CardContent className="p-0 overflow-x-auto">
                    <Table className="min-w-[700px]">
                        <TableHeader>
                            <TableRow className="bg-gray-50/30">
                                <TableHead className="w-[220px]">Segment</TableHead>
                                <TableHead className="text-center">Customers</TableHead>
                                <TableHead className="text-right">Total Revenue</TableHead>
                                <TableHead className="text-right">Avg LTV</TableHead>
                                <TableHead className="text-right">Revenue Share</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="text-center py-16 text-gray-400"
                                    >
                                        Loading LTV data…
                                    </TableCell>
                                </TableRow>
                            ) : sortedSegments.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="text-center py-16 text-gray-400"
                                    >
                                        No LTV data available. Run the LTV cron job first.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sortedSegments.map((seg) => {
                                    const pct = totalRevenue > 0
                                        ? ((seg.total_revenue / totalRevenue) * 100)?.toFixed(1)
                                        : "0.0"
                                    return (
                                        <TableRow key={seg.id} className="hover:bg-sky-50/20">
                                            <TableCell>
                                                <SegmentBadge segment={seg.segment} />
                                            </TableCell>
                                            <TableCell className="text-center text-gray-600 font-medium">
                                                {seg.total_customers?.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right font-medium text-gray-700">
                                                {formatCurrency(seg.total_revenue)}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-gray-800">
                                                {formatCurrency(seg.avg_ltv)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                                    {pct}%
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
