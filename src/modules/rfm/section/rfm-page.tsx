"use client"

import { useEffect, useState, useCallback } from "react"
import axios from "axios"
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Crown, Heart, UserPlus, AlertTriangle, UserX, Users, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface SegmentSummary {
    segment: string
    count: number
    percentage: number
    avg_monetary: number
    avg_frequency: number
    avg_recency_days: number
}

interface SummaryData {
    total_customers: number
    segments: SegmentSummary[]
}

interface CustomerRow {
    id: string
    email: string
    recency_days: number
    frequency: number
    monetary: number
    r_score: number
    f_score: number
    m_score: number
    segment: string
    createdAt: string
}

// ───── Segment Color & Style Map ─────
const SEGMENT_CONFIG: Record<string, {
    color: string
    bg: string
    text: string
    border: string
    icon: typeof Crown
    fill: string
}> = {
    "Champions": {
        color: "#10b981",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-l-emerald-500",
        icon: Crown,
        fill: "#10b981",
    },
    "Loyal Customers": {
        color: "#3b82f6",
        bg: "bg-blue-50",
        text: "text-blue-700",
        border: "border-l-blue-500",
        icon: Heart,
        fill: "#3b82f6",
    },
    "Potential Loyalists": {
        color: "#8b5cf6",
        bg: "bg-violet-50",
        text: "text-violet-700",
        border: "border-l-violet-500",
        icon: UserPlus,
        fill: "#8b5cf6",
    },
    "At Risk": {
        color: "#f59e0b",
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-l-amber-500",
        icon: AlertTriangle,
        fill: "#f59e0b",
    },
    "Lost Customers": {
        color: "#ef4444",
        bg: "bg-rose-50",
        text: "text-rose-700",
        border: "border-l-rose-500",
        icon: UserX,
        fill: "#ef4444",
    },
}

const getSegmentConfig = (segment: string) =>
    SEGMENT_CONFIG[segment] || {
        color: "#6b7280",
        bg: "bg-gray-50",
        text: "text-gray-700",
        border: "border-l-gray-500",
        icon: Users,
        fill: "#6b7280",
    }

const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(val || 0)

// ───── Badge Component ─────
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

// ───── Custom Tooltip for Pie ─────
function CustomPieTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const { name, value, payload: data } = payload[0]
    return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800">{name}</p>
            <p className="text-gray-500 mt-1">
                {value?.toLocaleString()} customers ({data.percentage}%)
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

export default function RfmPage() {
    // Summary state
    const [summary, setSummary] = useState<SummaryData | null>(null)
    const [summaryLoading, setSummaryLoading] = useState(true)

    // Table state
    const [customers, setCustomers] = useState<CustomerRow[]>([])
    const [tableLoading, setTableLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const limit = 20

    // Filters
    const [segmentFilter, setSegmentFilter] = useState<string>("all")
    const [sortBy, setSortBy] = useState("monetary")
    const [sortOrder, setSortOrder] = useState("desc")

    // Date range (default: last 1 year)
    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<any>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    // ── Fetch Summary ──
    useEffect(() => {
        const fetchSummary = async () => {
            try {
                setSummaryLoading(true)
                const res = await axios.get("/api/rfm-segments/summary", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setSummary(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load RFM summary", e)
            } finally {
                setSummaryLoading(false)
            }
        }
        fetchSummary()
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/rfm-segments/summary", {
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


    // ── Fetch Table ──
    const fetchCustomers = useCallback(async () => {
        try {
            setTableLoading(true)
            const params: Record<string, string | number> = {
                page,
                limit,
                sort_by: sortBy,
                sort_order: sortOrder,
                start_date: startDate,
                end_date: endDate,
            }
            if (segmentFilter !== "all") {
                params.segment = segmentFilter
            }
            const res = await axios.get("/api/rfm-segments", { params })
            if (res.data?.success) {
                setCustomers(res.data.data || [])
                setTotalPages(res.data.meta?.totalPages || 1)
                setTotal(res.data.meta?.total || 0)
            }
        } catch (e) {
            console.error("Failed to load RFM segments", e)
            setCustomers([])
        } finally {
            setTableLoading(false)
        }
    }, [page, segmentFilter, sortBy, sortOrder, startDate, endDate])

    useEffect(() => {
        fetchCustomers()
    }, [fetchCustomers])

    // Reset page when filter/sort changes
    useEffect(() => {
        setPage(1)
    }, [segmentFilter, sortBy, sortOrder, startDate, endDate])

    // ── Derived data for pie chart ──
    const pieData = (summary?.segments || []).map((s) => ({
        name: s.segment,
        value: s.count,
        percentage: s.percentage,
        fill: getSegmentConfig(s.segment).fill,
    }))

    // Ordered segment keys for KPI cards
    const segmentOrder = [
        "Champions",
        "Loyal Customers",
        "Potential Loyalists",
        "At Risk",
        "Lost Customers",
    ]

    const getSegmentFromSummary = (name: string): SegmentSummary | undefined =>
        summary?.segments.find((s) => s.segment === name)

    const getSegmentFromCompare = (name: string): SegmentSummary | undefined =>
        compareData?.segments?.find((s: any) => s.segment === name)

    
    

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Customer Segments
                    </h1>
                    <p className="text-sm text-gray-500">
                        RFM-based customer segmentation — Recency · Frequency · Monetary
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={summaryLoading || customers.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Email", key: "email" },
                                { header: "Segment", key: "segment" },
                                { header: "Recency (days)", key: "recency_days", format: "number" },
                                { header: "Frequency", key: "frequency", format: "number" },
                                { header: "Monetary (₹)", key: "monetary", format: "currency" },
                                { header: "R Score", key: "r_score", format: "number" },
                                { header: "F Score", key: "f_score", format: "number" },
                                { header: "M Score", key: "m_score", format: "number" },
                            ]
                            exportToExcel(customers, cols, "RFM_Segments", startDate, endDate)
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
                    endpoint="/api/rfm-segments/summary"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Rfm — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {/* Total Customers Card */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-gray-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Customers
                            <Users className="h-4 w-4 text-gray-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-gray-800">
                            {summaryLoading
                                ? "—"
                                : (summary?.total_customers || 0)?.toLocaleString()}
                        </div>
                        <DeltaLine current={summary?.total_customers} previous={compareData?.total_customers} kind="count" />
                    </CardContent>
                </Card>

                {/* Dynamic Segment Cards */}
                {segmentOrder.map((segName) => {
                    const seg = getSegmentFromSummary(segName)
                    const cmpSeg = getSegmentFromCompare(segName)
                    const config = getSegmentConfig(segName)
                    const Icon = config.icon
                    return (
                        <Card
                            key={segName}
                            className={`bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 ${config.border}`}
                        >
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                                    <span className="truncate">{segName}</span>
                                    <Icon
                                        className="h-4 w-4 shrink-0"
                                        style={{ color: config.color }}
                                    />
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div
                                    className="text-3xl font-extrabold"
                                    style={{ color: config.color }}
                                >
                                    {summaryLoading ? "—" : (seg?.count || 0)?.toLocaleString()}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    {summaryLoading ? "" : `${seg?.percentage || 0}%`}
                                </p>
                                <DeltaLine current={seg?.count} previous={cmpSeg?.count} kind="count" />
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* ═══════ Charts Row ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pie Chart */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700">
                            Segment Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {summaryLoading ? (
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

                {/* Segment Breakdown Stats */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700">
                            Segment Averages
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {summaryLoading ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                                Loading stats…
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {(summary?.segments || []).map((seg) => {
                                    const config = getSegmentConfig(seg.segment)
                                    return (
                                        <div
                                            key={seg.segment}
                                            className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-2 h-8 rounded-full"
                                                    style={{ backgroundColor: config.color }}
                                                />
                                                <div>
                                                    <p className="text-sm font-medium text-gray-800">
                                                        {seg.segment}
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        {seg.count?.toLocaleString()} customers
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-6 text-right">
                                                <div>
                                                    <p className="text-xs text-gray-400">Avg Spend</p>
                                                    <p className="text-sm font-semibold text-gray-700">
                                                        {formatCurrency(seg.avg_monetary)}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-400">Avg Orders</p>
                                                    <p className="text-sm font-semibold text-gray-700">
                                                        {seg.avg_frequency}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-400">Avg Recency</p>
                                                    <p className="text-sm font-semibold text-gray-700">
                                                        {seg.avg_recency_days}d
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Customer Table ═══════ */}
            <Card className="shadow-sm border">
                <CardHeader className="border-b bg-gray-50/50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <CardTitle className="text-sm font-semibold text-gray-700">
                            Customer Details
                            {!tableLoading && (
                                <span className="ml-2 text-xs font-normal text-gray-400">
                                    ({total?.toLocaleString()} customers)
                                </span>
                            )}
                        </CardTitle>

                        {/* Filters Row */}
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Segment Filter */}
                            <Select
                                value={segmentFilter}
                                onValueChange={setSegmentFilter}
                            >
                                <SelectTrigger className="w-[180px] h-9 text-xs bg-white">
                                    <SelectValue placeholder="All Segments" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Segments</SelectItem>
                                    {segmentOrder.map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {s}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Sort By */}
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="w-[150px] h-9 text-xs bg-white">
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="monetary">Monetary</SelectItem>
                                    <SelectItem value="frequency">Frequency</SelectItem>
                                    <SelectItem value="recency_days">Recency</SelectItem>
                                    <SelectItem value="r_score">R Score</SelectItem>
                                    <SelectItem value="f_score">F Score</SelectItem>
                                    <SelectItem value="m_score">M Score</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Sort Order */}
                            <Select value={sortOrder} onValueChange={setSortOrder}>
                                <SelectTrigger className="w-[110px] h-9 text-xs bg-white">
                                    <SelectValue placeholder="Order" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="desc">Desc ↓</SelectItem>
                                    <SelectItem value="asc">Asc ↑</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0 overflow-x-auto min-h-[400px]">
                    <Table className="min-w-[900px]">
                        <TableHeader>
                            <TableRow className="bg-gray-50/30">
                                <TableHead className="w-[280px]">Email</TableHead>
                                <TableHead className="text-center">Recency (days)</TableHead>
                                <TableHead className="text-center">Frequency</TableHead>
                                <TableHead className="text-right">Monetary</TableHead>
                                <TableHead className="text-center">R / F / M</TableHead>
                                <TableHead>Segment</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tableLoading ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="text-center py-16 text-gray-400"
                                    >
                                        Loading customer segments…
                                    </TableCell>
                                </TableRow>
                            ) : customers.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="text-center py-16 text-gray-400"
                                    >
                                        No customers found for the selected filter.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                customers.map((c) => (
                                    <TableRow
                                        key={c.id}
                                        className="hover:bg-sky-50/20"
                                    >
                                        <TableCell className="font-medium text-gray-800 max-w-[280px] truncate" title={c.email}>
                                            {c.email}
                                        </TableCell>
                                        <TableCell className="text-center text-gray-600">
                                            {c.recency_days?.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-center text-gray-600">
                                            {c.frequency}
                                        </TableCell>
                                        <TableCell className="text-right font-medium text-gray-700">
                                            {formatCurrency(c.monetary)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                {c.r_score} / {c.f_score} / {c.m_score}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <SegmentBadge segment={c.segment} />
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {/* Pagination Footer */}
                    {totalPages > 1 && (
                        <div className="border-t p-4 flex justify-between items-center bg-gray-50/50">
                            <div className="text-sm text-gray-500">
                                Page{" "}
                                <span className="font-medium">{page}</span> of{" "}
                                <span className="font-medium">{totalPages}</span>
                            </div>
                            <Pagination className="mx-0 justify-end w-auto">
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious
                                            onClick={() =>
                                                setPage((p) => Math.max(1, p - 1))
                                            }
                                            className={
                                                page === 1
                                                    ? "pointer-events-none opacity-50"
                                                    : "cursor-pointer"
                                            }
                                        />
                                    </PaginationItem>
                                    <PaginationItem>
                                        <PaginationNext
                                            onClick={() =>
                                                setPage((p) =>
                                                    Math.min(totalPages, p + 1)
                                                )
                                            }
                                            className={
                                                page === totalPages
                                                    ? "pointer-events-none opacity-50"
                                                    : "cursor-pointer"
                                            }
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
