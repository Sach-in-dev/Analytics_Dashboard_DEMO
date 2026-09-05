"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
    Network, ShoppingBag, Layers, Percent, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

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

export default function CorrelationsPage() {
    const [loading, setLoading] = useState(true)
    const [summary, setSummary] = useState<any>(null)
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<any>(null)
    const [compareLoading, setCompareLoading] = useState(false)
    
    // Paginated Data
    const [page, setPage] = useState(1)
    const limit = 15
    const [tableData, setTableData] = useState<any[]>([])
    const [totalPages, setTotalPages] = useState(1)

    // Initial KPI Fetches
    useEffect(() => {
        const fetchSummary = async () => {
            if (!startDate || !endDate) return
            try {
                const res = await axios.get('/api/correlations/summary', { params: { start_date: startDate, end_date: endDate } })
                setSummary(res.data?.data)
            } catch (e) {
                console.error("Failed to load summary", e)
            }
        }
        fetchSummary()
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/correlations/summary", {
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


    // Load table data
    useEffect(() => {
        const fetchTable = async () => {
            if (!startDate || !endDate) return
            try {
                setLoading(true)
                const res = await axios.get('/api/correlations/frequent-pairs', { 
                    params: { start_date: startDate, end_date: endDate, page, limit } 
                })
                setTableData(res.data?.data || [])
                setTotalPages(res.data?.meta?.lastPage || 1)
            } catch (e) {
                console.error("Failed to load table", e)
            } finally {
                setLoading(false)
            }
        }
        fetchTable()
    }, [startDate, endDate, page])

    // Reset pagination on date change
    useEffect(() => {
        setPage(1)
    }, [startDate, endDate])


    

        return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">Market Basket Analysis</h1>
                    <p className="text-sm text-gray-500">Discover which product ecosystems are naturally bought together</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || tableData.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Product A", key: "product_a" },
                                { header: "Product B", key: "product_b" },
                                { header: "Co-Occurrences", key: "co_occurrences", format: "number" },
                            ]
                            exportToExcel(tableData, cols, "What_Sells_Together", startDate, endDate)
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
                    endpoint="/api/correlations/summary"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Correlations — Period Comparison"
                />
            )}


            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-w-0">
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Total Carts Evaluated
                            <ShoppingBag className="h-4 w-4 text-violet-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-gray-800">
                            {summary ? summary.total_active_orders.toLocaleString() : "0"}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Found within date bounds</p>
                        <DeltaLine current={summary?.total_active_orders} previous={compareData?.total_active_orders} kind="count" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-sky-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Multi-Item Carts
                            <Layers className="h-4 w-4 text-sky-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-gray-800">
                            {summary ? summary.multi_item_orders.toLocaleString() : "0"}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Carts containing {">"}1 unique item</p>
                        <DeltaLine current={summary?.multi_item_orders} previous={compareData?.multi_item_orders} kind="count" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Bundling Propensity
                            <Percent className="h-4 w-4 text-emerald-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-emerald-600">
                            {summary ? summary.bundling_percentage : "0"}%
                        </div>
                        <p className="text-xs text-emerald-500 mt-1 opacity-80">Cart combination scale</p>
                        <DeltaLine current={summary ? Number(summary.bundling_percentage) : undefined} previous={compareData ? Number(compareData.bundling_percentage) : undefined} kind="percent" />
                    </CardContent>
                </Card>
            </div>

            {/* Heavy Analysis Data Grid */}
            <Card className="shadow-sm border">
                <CardHeader className="border-b bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <Network className="h-5 w-5 text-gray-400" />
                        <div>
                            <CardTitle className="text-lg text-gray-800">Frequent SKU Pairs</CardTitle>
                            <CardDescription>Items that consistently occur within the same checkout basket</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto min-h-[400px]">
                    <Table className="min-w-[800px]">
                        <TableHeader className="bg-gray-50/30">
                            <TableRow>
                                <TableHead className="w-16">Rank</TableHead>
                                <TableHead className="w-[40%]">Primary Product (A)</TableHead>
                                <TableHead className="w-[40%]">Secondary Product (B)</TableHead>
                                <TableHead className="text-right">Co-Occurrences</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-16 text-gray-400">Executing cluster analysis...</TableCell>
                                </TableRow>
                            ) : tableData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-16 text-gray-400">No multi-item carts detected in this timeframe.</TableCell>
                                </TableRow>
                            ) : tableData.map((row, i) => (
                                <TableRow key={i} className="hover:bg-violet-50/20">
                                    <TableCell className="font-medium text-gray-400 text-xs">#{((page - 1) * limit) + i + 1}</TableCell>
                                    <TableCell className="font-medium text-gray-800 max-w-[250px] truncate" title={row.product_a}>
                                        {row.product_a}
                                    </TableCell>
                                    <TableCell className="font-medium text-gray-800 max-w-[250px] truncate border-l border-dashed border-gray-200" title={row.product_b}>
                                        {row.product_b}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <span className="inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded bg-violet-100 text-violet-800 text-xs font-bold">
                                            {row.co_occurrences} 🛒
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* Footer Pagination */}
                    {totalPages > 1 && (
                        <div className="border-t p-4 flex justify-between items-center bg-gray-50/50">
                            <div className="text-sm text-gray-500">
                                Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span>
                            </div>
                            <Pagination className="mx-0 justify-end w-auto">
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious 
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                        />
                                    </PaginationItem>
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
                </CardContent>
            </Card>
        </div>
    )
}
