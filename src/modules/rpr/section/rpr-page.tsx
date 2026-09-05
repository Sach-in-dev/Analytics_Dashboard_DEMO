"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useDateRange } from "@/hooks/use-date-range"
import {
    Users, Repeat, UserCheck, UserX, TrendingUp, Percent, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

// ───── Types ─────
interface RprData {
    total_customers: number
    repeat_customers: number
    rpr_percentage: number
    one_time_customers: number
    createdAt: string | null
}

// ───── Helpers ─────
const COLORS = {
    repeat: "#10b981",   // emerald
    oneTime: "#f59e0b",  // amber
}

// ───── Custom Pie Tooltip ─────
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

export default function RprPage() {
    const [data, setData] = useState<RprData | null>(null)
    const [loading, setLoading] = useState(true)

    // Date range (default: last 1 year) — same pattern as RFM/LTV pages
    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<RprData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/repeat-purchase-rate", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load RPR data", e)
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
                const res = await axios.get("/api/repeat-purchase-rate", {
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


    // Derived data
    const totalCustomers = data?.total_customers || 0
    const repeatCustomers = data?.repeat_customers || 0
    const oneTimeCustomers = data?.one_time_customers || 0
    const rprPercentage = data?.rpr_percentage || 0
    const oneTimePercentage = totalCustomers > 0
        ? round((oneTimeCustomers / totalCustomers) * 100)
        : 0

    // Compare-derived vars
    const cmpTotalCustomers = compareData?.total_customers
    const cmpRepeatCustomers = compareData?.repeat_customers
    const cmpOneTimeCustomers = compareData?.one_time_customers
    const cmpRprPercentage = compareData?.rpr_percentage

    const pieData = totalCustomers > 0 ? [
        {
            name: "Repeat Customers",
            value: repeatCustomers,
            percentage: rprPercentage?.toFixed(1),
            fill: COLORS.repeat,
        },
        {
            name: "One-Time Customers",
            value: oneTimeCustomers,
            percentage: oneTimePercentage?.toFixed(1),
            fill: COLORS.oneTime,
        },
    ] : []

    
    

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">
                        Repeat Purchase Rate
                    </h1>
                    <p className="text-sm text-gray-500">
                        Measures the percentage of customers who have placed more than one order
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || !data}
                        onClick={() => {
                            if (!data) return
                            const cols: ExportColumn[] = [
                                { header: "Total Customers", key: "total_customers", format: "number" },
                                { header: "Repeat Customers", key: "repeat_customers", format: "number" },
                                { header: "One-Time Customers", key: "one_time_customers", format: "number" },
                                { header: "RPR (%)", key: "rpr_percentage", format: "percent" },
                            ]
                            exportToExcel([data], cols, "Repeat_Purchase_Rate", startDate, endDate)
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
                    endpoint="/api/repeat-purchase-rate"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Rpr — Period Comparison"
                />
            )}


            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* RPR % — Hero Card */}
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest flex items-center justify-between gap-2">
                            Repeat Purchase Rate
                            <Percent className="h-4 w-4 text-emerald-500 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-emerald-700">
                            {loading ? "—" : `${rprPercentage}%`}
                        </div>
                        <p className="text-xs text-emerald-500/70 mt-1">
                            of all customers are repeat buyers
                        </p>
                        <DeltaLine current={rprPercentage} previous={cmpRprPercentage} kind="percent" />
                    </CardContent>
                </Card>

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
                            {loading ? "—" : totalCustomers?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Unique email addresses
                        </p>
                        <DeltaLine current={totalCustomers} previous={cmpTotalCustomers} kind="count" />
                    </CardContent>
                </Card>

                {/* Repeat Customers */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Repeat Customers
                            <Repeat className="h-4 w-4 text-emerald-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-emerald-700">
                            {loading ? "—" : repeatCustomers?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Placed 2+ orders
                        </p>
                        <DeltaLine current={repeatCustomers} previous={cmpRepeatCustomers} kind="count" />
                    </CardContent>
                </Card>

                {/* One-Time Customers */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            One-Time Customers
                            <UserX className="h-4 w-4 text-amber-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-amber-600">
                            {loading ? "—" : oneTimeCustomers?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Placed only 1 order
                        </p>
                        <DeltaLine current={oneTimeCustomers} previous={cmpOneTimeCustomers} kind="count" lowerIsBetter />
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Charts Row ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Donut Chart */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Users className="h-4 w-4 text-gray-500" />
                            Customer Breakdown
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                                Loading chart…
                            </div>
                        ) : pieData.length === 0 ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                                No data available
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
                                            innerRadius={60}
                                            paddingAngle={4}
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

                {/* RPR Visual Gauge */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-gray-500" />
                            RPR Overview
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                                Loading…
                            </div>
                        ) : (
                            <div className="h-72 flex flex-col justify-center space-y-6">
                                {/* Large RPR display */}
                                <div className="text-center">
                                    <div className="text-6xl font-black text-emerald-600">
                                        {rprPercentage}%
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2">
                                        Repeat Purchase Rate
                                    </p>
                                </div>

                                {/* Progress bar */}
                                <div className="space-y-2">
                                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                                        <div
                                            className="h-4 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-1000 ease-out"
                                            style={{ width: `${Math.min(rprPercentage, 100)}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>0%</span>
                                        <span>50%</span>
                                        <span>100%</span>
                                    </div>
                                </div>

                                {/* Stats row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-emerald-50 rounded-lg p-3 text-center">
                                        <div className="flex items-center justify-center gap-1.5 mb-1">
                                            <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                            <span className="text-xs font-semibold text-emerald-700">Repeat</span>
                                        </div>
                                        <span className="text-lg font-bold text-emerald-700">
                                            {repeatCustomers?.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="bg-amber-50 rounded-lg p-3 text-center">
                                        <div className="flex items-center justify-center gap-1.5 mb-1">
                                            <UserX className="h-3.5 w-3.5 text-amber-600" />
                                            <span className="text-xs font-semibold text-amber-700">One-Time</span>
                                        </div>
                                        <span className="text-lg font-bold text-amber-700">
                                            {oneTimeCustomers?.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Summary Table ═══════ */}
            {!loading && data && (
                <Card className="shadow-sm border overflow-hidden">
                    <div className="p-4 border-b bg-gray-50/50">
                        <h3 className="font-semibold text-gray-700">Tabular Data</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Metric</TableHead>
                                    <TableHead className="text-right">Count</TableHead>
                                    <TableHead className="text-right">Percentage</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow className="hover:bg-gray-50/50">
                                    <TableCell className="font-medium text-gray-800">Total Customers</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-gray-800">{totalCustomers?.toLocaleString()}</TableCell>
                                    <TableCell className="text-right tabular-nums text-gray-500">100%</TableCell>
                                </TableRow>
                                <TableRow className="hover:bg-emerald-50/30">
                                    <TableCell className="font-medium text-emerald-700">Repeat Customers</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-emerald-700">{repeatCustomers?.toLocaleString()}</TableCell>
                                    <TableCell className="text-right tabular-nums text-emerald-600">{rprPercentage}%</TableCell>
                                </TableRow>
                                <TableRow className="hover:bg-amber-50/30">
                                    <TableCell className="font-medium text-amber-700">One-Time Customers</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-amber-700">{oneTimeCustomers?.toLocaleString()}</TableCell>
                                    <TableCell className="text-right tabular-nums text-amber-600">{oneTimePercentage?.toFixed(1)}%</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            )}
        </div>
    )
}

function round(n: number, decimals = 2) {
    return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals)
}
