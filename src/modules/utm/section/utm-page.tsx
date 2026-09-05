"use client"

import { useEffect, useState, useMemo } from "react"
import axios from "axios"
import {
    List, PieChart as PieChartIcon, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

type UtmRow = {
  key: string
  views: number
  percentage?: number // We can calculate locally
}

const COLORS = [
  "#2563EB", "#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE",
  "#10B981", "#34D399", "#6EE7B7", "#A7F3D0", "#D1FAE5",
  "#F59E0B", "#FBBF24", "#FCD34D", "#FDE68A", "#FEF3C7",
  "#EF4444", "#F87171", "#FCA5A5", "#FECACA", "#FEE2E2",
  "#8B5CF6", "#A78BFA", "#C4B5FD", "#DDD6FE", "#EDE9FE",
]

const getPastDate = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().split("T")[0]
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

export default function UtmPage() {
    const [data, setData] = useState<UtmRow[]>([])
    const [loading, setLoading] = useState(true)
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<UtmRow[] | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)
    
    // Pagination & Settings
    const [page, setPage] = useState(1)
    const [limit] = useState(15)
    const [totalPages, setTotalPages] = useState(1)
    const [utmType, setUtmType] = useState<string>("source")
    const [viewMode, setViewMode] = useState<"table" | "chart">("table")

    const fetchData = async () => {
        try {
            setLoading(true)
            const res = await axios.get(`/api/utm`, {
                params: {
                    start_date: startDate,
                    end_date: endDate,
                    utm_type: utmType,
                    page,
                    limit
                }
            })
            if (res.data?.success) {
                // Calculate percentage based on total views of this page for the chart
                const rawData = res.data.data as UtmRow[]
                const totalPageViews = rawData.reduce((sum, item) => sum + item.views, 0)
                const processed = rawData.map(item => ({
                    ...item,
                    percentage: totalPageViews > 0 ? Number(((item.views / totalPageViews) * 100).toFixed(1)) : 0
                }))
                
                setData(processed)
                setTotalPages(res.data.meta?.lastPage || 1)
            }
        } catch (error) {
            console.error("Failed to fetch UTM data:", error)
            setData([])
        } finally {
            setLoading(false)
        }
    }

    // Refetch
    useEffect(() => {
        if (startDate && endDate) {
            fetchData()
        }
    }, [startDate, endDate, utmType, page])

    // Reset pagination
    useEffect(() => {
        setPage(1)
    }, [startDate, endDate, utmType])

    // Display Name mapping
    const typeNames: Record<string, string> = {
        source: "UTM Source",
        medium: "UTM Medium",
        campaign: "UTM Campaign",
        term: "UTM Term",
        content: "UTM Content"
    }

    const chartData = useMemo(() => {
        return data.map(item => ({ 
            name: item.key === "None" || !item.key ? "Direct" : item.key, 
            value: item.views, 
            percentage: item.percentage 
        }))
    }, [data])

    const totalViews = chartData.reduce((sum, d) => sum + d.value, 0)


    

        return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">UTM Analytics</h1>
                    <p className="text-sm text-gray-500">Track and evaluate marketing campaigns via UTM parameters.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <Select value={utmType} onValueChange={setUtmType}>
                        <SelectTrigger className="w-[180px] bg-white text-gray-700 font-medium">
                            <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(typeNames).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    
                    <ExportButton
                        disabled={loading || data.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Parameter", key: "key" },
                                { header: "Views", key: "views", format: "number" },
                                { header: "Share (%)", key: "percentage", format: "percent" },
                            ]
                            exportToExcel(data, cols, `UTM_${utmType}`, startDate, endDate)
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
                    endpoint="/api/utm"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Utm — Period Comparison"
                />
            )}


            <Card className="overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b bg-gray-50/50">
                    <h2 className="text-lg font-semibold text-gray-700">{typeNames[utmType]} Performance</h2>
                    <div className="flex items-center gap-1 bg-gray-200 p-1 rounded-lg">
                        <button onClick={() => setViewMode("table")} className={`p-1.5 rounded-md transition-all ${viewMode === "table" ? "bg-white shadow-sm text-blue-600" : "text-gray-500"}`}>
                            <List size={18} />
                        </button>
                        <button onClick={() => setViewMode("chart")} className={`p-1.5 rounded-md transition-all ${viewMode === "chart" ? "bg-white shadow-sm text-blue-600" : "text-gray-500"}`}>
                            <PieChartIcon size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="py-10 text-center text-gray-500">Loading {typeNames[utmType]} data...</div>
                    ) : data.length === 0 ? (
                        <div className="py-10 text-center text-gray-500 italic">No data available for this range.</div>
                    ) : viewMode === "table" ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-16">Rank</TableHead>
                                        <TableHead>Parameter Name</TableHead>
                                        <TableHead className="text-right">Total Views</TableHead>
                                        <TableHead className="text-right">Share (%)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((row, idx) => (
                                        <TableRow key={`${row.key}-${idx}`}>
                                            <TableCell className="font-medium text-gray-500">{(page - 1) * limit + idx + 1}</TableCell>
                                            <TableCell className="font-medium text-gray-800">
                                                {row.key === "None" || !row.key ? "Direct / None" : row.key}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-gray-600">{row.views.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">
                                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">{row.percentage}%</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center w-full">
                            <div className="relative h-[360px] w-full max-w-[420px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={chartData} cx="50%" cy="50%" innerRadius={90} outerRadius={130} paddingAngle={0} dataKey="value" stroke="none" isAnimationActive={chartData.length <= 50} animationDuration={600}>
                                            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-xs text-gray-400 uppercase">Page Views</span>
                                    <span className="text-2xl font-bold text-gray-800">{totalViews.toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="mt-6 max-h-[280px] overflow-y-auto pr-2 w-full">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-3 text-sm">
                                    {chartData.map((item, i) => (
                                        <div key={`${item.name}-${i}`} className="flex items-start gap-2 min-w-0">
                                            <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-700 truncate" title={item.name}>{item.name}</div>
                                                <div className="text-xs text-gray-500">{item.value.toLocaleString()} • {item.percentage}%</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    {totalPages > 1 && viewMode === "table" && (
                        <div className="flex justify-end mt-6 pt-4 border-t border-gray-100">
                            <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious 
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                        />
                                    </PaginationItem>
                                    
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || (p >= page - 2 && p <= page + 2))
                                        .map((p, i, arr) => (
                                            <div key={p} className="flex items-center">
                                                {i > 0 && arr[i - 1] !== p - 1 && <span className="px-2 text-gray-400">...</span>}
                                                <PaginationItem>
                                                    <PaginationLink 
                                                        isActive={page === p} 
                                                        onClick={() => setPage(p)}
                                                        className="cursor-pointer"
                                                    >
                                                        {p}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            </div>
                                        ))
                                    }

                                    <PaginationItem>
                                        <PaginationNext 
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    )
}
