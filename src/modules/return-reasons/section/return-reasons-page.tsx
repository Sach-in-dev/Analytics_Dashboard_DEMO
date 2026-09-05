"use client"

import { useEffect, useState, useMemo } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { api } from "@/lib/axios"
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Undo2, TrendingDown, AlertTriangle, DollarSign,
    ArrowUpDown, ChevronUp, ChevronDown, Package,
    ArrowDown, Minus, ArrowUp,
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface ReasonData {
    [key: string]: string | number
    reason_code: string
    reason_text: string
    total_cases: number
    total_revenue_loss: number
    percentage: number
}

interface SummaryData {
    total_returns: number
    total_revenue_loss: number
    top_reason: string
    top_reason_percentage: number
    highest_loss_reason: string
    highest_loss_amount: number
}

interface ReturnReasonData {
    summary: SummaryData
    data: ReasonData[]
}

// ───── Colors ─────
const PIE_COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
    "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
    "#14b8a6", "#a855f7",
]
const BAR_COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
    "#22c55e", "#06b6d4", "#3b82f6",
]

type SortKey = "total_cases" | "total_revenue_loss" | "percentage"

// ───── Helpers ─────
function formatCurrency(v: number): string {
    if (v >= 10000000) return `₹${(v / 10000000)?.toFixed(1)}Cr`
    if (v >= 100000) return `₹${(v / 100000)?.toFixed(1)}L`
    if (v >= 1000) return `₹${(v / 1000)?.toFixed(1)}K`
    return `₹${v?.toLocaleString("en-IN")}`
}

function formatNum(v: number): string {
    if (v >= 100000) return `${(v / 100000)?.toFixed(1)}L`
    if (v >= 1000) return `${(v / 1000)?.toFixed(1)}K`
    return v?.toLocaleString()
}

// ───── Custom Tooltips ─────
function PieTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload

    

        return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{d.reason_text}</p>
            <p className="text-gray-600">Cases: <strong>{d.total_cases}</strong></p>
            <p className="text-gray-600">Share: <strong className="text-rose-600">{d.percentage}%</strong></p>
        </div>
    )
}

function BarTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-1">{d.reason_text}</p>
            <p className="text-gray-600">Revenue Loss: <strong className="text-rose-600">{formatCurrency(d.total_revenue_loss)}</strong></p>
            <p className="text-gray-600">Cases: <strong>{d.total_cases}</strong></p>
        </div>
    )
}

// Custom label for pie
function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, reason_text }: any) {
    if (percent < 0.05) return null
    const RADIAN = Math.PI / 180
    const radius = outerRadius + 24
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const name = reason_text.length > 14 ? reason_text.slice(0, 14) + "…" : reason_text

    return (
        <text x={x} y={y} fill="#374151" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11}>
            {name} ({(percent * 100)?.toFixed(0)}%)
        </text>
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

export default function ReturnReasonsPage() {
    const [data, setData] = useState<ReturnReasonData | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortKey, setSortKey] = useState<SortKey>("total_revenue_loss")
    const [sortAsc, setSortAsc] = useState(false)

    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<ReturnReasonData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await api.get("/return-reasons", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load Return Reasons data", e)
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
                const res = await api.get("/return-reasons", {
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
    const reasons = data?.data || []

    // Table sort
    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(!sortAsc)
        else { setSortKey(key); setSortAsc(false) }
    }

    const sortedReasons = useMemo(() => {
        return [...reasons].sort((a, b) => {
            const va = a[sortKey]
            const vb = b[sortKey]
            return sortAsc ? va - vb : vb - va
        })
    }, [reasons, sortKey, sortAsc])

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />
        return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
    }

    // Pie data — top 8 + "Others"
    const pieData = useMemo(() => {
        if (reasons.length <= 8) return reasons
        const top = reasons.slice(0, 7)
        const others = reasons.slice(7)
        const otherCases = others.reduce((s, r) => s + r.total_cases, 0)
        const otherLoss = others.reduce((s, r) => s + r.total_revenue_loss, 0)
        const otherPct = others.reduce((s, r) => s + r.percentage, 0)
        return [
            ...top,
            {
                reason_code: "OTHERS",
                reason_text: "Others",
                total_cases: otherCases,
                total_revenue_loss: otherLoss,
                percentage: Math.round(otherPct * 100) / 100,
            },
        ]
    }, [reasons])

    // Bar data — sorted by revenue loss desc
    const barData = useMemo(() =>
        [...reasons].sort((a, b) => b.total_revenue_loss - a.total_revenue_loss).slice(0, 10),
        [reasons]
    )

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Return / Refund Reason Codes
                    </h1>
                    <p className="text-sm text-gray-500">
                        Analyze why orders are being returned or refunded and identify revenue loss patterns
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || (data?.data || []).length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Reason Code", key: "reason_code" },
                                { header: "Reason", key: "reason_text" },
                                { header: "Total Cases", key: "total_cases", format: "number" },
                                { header: "Revenue Loss (₹)", key: "total_revenue_loss", format: "currency" },
                                { header: "Percentage (%)", key: "percentage", format: "percent" },
                            ]
                            exportToExcel(data?.data || [], cols, "Return_Reasons", startDate, endDate)
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
                    endpoint="/api/return-reasons"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Return Reasons — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Returns */}
                <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 shadow-sm border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-rose-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Total Returns
                            <Undo2 className="h-4 w-4 text-rose-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-rose-700">
                            {loading ? "—" : formatNum(summary?.total_returns || 0)}
                        </div>
                        <p className="text-xs text-rose-500/70 mt-1">
                            Returned &amp; refunded orders
                        </p>
                    
                    <DeltaLine current={summary?.total_returns} previous={compareSummary?.total_returns} kind="count" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Total Revenue Loss */}
                <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 shadow-sm border-l-4 border-l-orange-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-orange-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Revenue Loss
                            <DollarSign className="h-4 w-4 text-orange-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-orange-700">
                            {loading ? "—" : formatCurrency(summary?.total_revenue_loss || 0)}
                        </div>
                        <p className="text-xs text-orange-500/70 mt-1">
                            Total revenue impact
                        </p>
                    
                    <DeltaLine current={summary?.total_revenue_loss} previous={compareSummary?.total_revenue_loss} kind="currency" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Top Reason */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-violet-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Top Reason
                            <AlertTriangle className="h-4 w-4 text-violet-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-extrabold text-violet-700 truncate">
                            {loading ? "—" : summary?.top_reason || "N/A"}
                        </div>
                        <p className="text-xs text-violet-500/70 mt-1">
                            {!loading && summary ? `${summary.top_reason_percentage}% of all cases` : "—"}
                        </p>
                    
                    
                    </CardContent>
                </Card>

                {/* Highest Loss Reason */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Highest Loss Reason
                            <TrendingDown className="h-4 w-4 text-amber-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-extrabold text-amber-700 truncate">
                            {loading ? "—" : summary?.highest_loss_reason || "N/A"}
                        </div>
                        <p className="text-xs text-amber-500/70 mt-1">
                            {!loading && summary ? formatCurrency(summary.highest_loss_amount) : "—"}
                        </p>
                    
                    <DeltaLine current={summary?.highest_loss_amount} previous={compareSummary?.highest_loss_amount} kind="currency" />
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Charts Row ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Pie Chart — Reason Distribution */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Undo2 className="h-4 w-4 text-gray-500" />
                            Return Reason Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
                        ) : pieData.length === 0 ? (
                            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">No data</div>
                        ) : (
                            <div className="h-[320px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="total_cases"
                                            nameKey="reason_text"
                                            label={renderCustomLabel}
                                            labelLine={false}
                                        >
                                            {pieData.map((_, idx) => (
                                                <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<PieTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Bar Chart — Revenue Loss by Reason */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-gray-500" />
                            Revenue Loss by Reason
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
                                    <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis type="number" tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="reason_text" width={120} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<BarTooltip />} />
                                        <Bar dataKey="total_revenue_loss" name="Revenue Loss" radius={[0, 6, 6, 0]}>
                                            {barData.map((_, idx) => (
                                                <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Reason Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-500" />
                        Reason Breakdown
                        <span className="text-xs text-gray-400 font-normal ml-2">Click headers to sort</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
                    ) : sortedReasons.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">No data available</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Reason</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("total_cases")}>
                                            <span className="inline-flex items-center gap-1">Cases <SortIcon col="total_cases" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("total_revenue_loss")}>
                                            <span className="inline-flex items-center gap-1">Revenue Loss <SortIcon col="total_revenue_loss" /></span>
                                        </th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("percentage")}>
                                            <span className="inline-flex items-center gap-1">Share % <SortIcon col="percentage" /></span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedReasons.map((r) => {
                                        const isTopLoss = r.reason_code === (reasons[0]?.reason_code || "")
                                        return (
                                            <tr
                                                key={r.reason_code}
                                                className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${
                                                    isTopLoss ? "bg-rose-50/30" : ""
                                                }`}
                                            >
                                                <td className="py-3 px-4 font-medium text-gray-700">
                                                    <div className="flex items-center gap-2">
                                                        <Undo2 className="h-4 w-4 text-gray-400" />
                                                        {r.reason_text}
                                                        {isTopLoss && <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-semibold">TOP LOSS</span>}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right text-gray-600 font-medium">{r.total_cases?.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-right text-rose-600 font-medium">{formatCurrency(r.total_revenue_loss)}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-rose-400 rounded-full transition-all"
                                                                style={{ width: `${Math.min(r.percentage, 100)}%` }}
                                                            />
                                                        </div>
                                                        <span className="font-semibold text-gray-700 min-w-[40px] text-right">{r.percentage}%</span>
                                                    </div>
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
