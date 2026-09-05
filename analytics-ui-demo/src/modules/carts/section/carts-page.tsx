"use client"

import { useEffect, useState, useMemo } from "react"
import axios from "axios"
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import { Card } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import {
    ChevronLeft, ChevronRight, List, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"
import { CompareChartTooltip } from "@/components/ui/compare-chart-tooltip"

type CartData = {
    date: string
    total_carts: number
    completed_carts: number
    abandoned_carts: number
    total_cart_value: number
    completed_cart_value: number
    abandoned_cart_value: number
    interval: string
}

type AbandonedProductData = {
    title: string
    count: number
}

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

export default function CartsPage() {
    const [tableData, setTableData] = useState<CartData[]>([])
    const [abandonedProducts, setAbandonedProducts] = useState<AbandonedProductData[]>([])
    const [page, setPage] = useState(1)
    const [totalProducts, setTotalProducts] = useState(0)
    const [loading, setLoading] = useState(true)
    const limit = 10
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<any>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    const fetchKPIs = async () => {
        try {
            setLoading(true)
            const res = await axios.get(`/api/carts`, {
                params: { start_date: startDate, end_date: endDate }
            })
            if (res.data?.success) {
                setTableData(res.data.data)
            }
        } catch (error) {
            console.error("Failed to fetch carts:", error)
            setTableData([])
        } finally {
            setLoading(false)
        }
    }

    const fetchAbandonedProducts = async () => {
        try {
            const prodRes = await axios.get(`/api/carts/abandoned-products`, {
                params: { start_date: startDate, end_date: endDate, page, limit }
            })
            if (prodRes.data?.success) {
                setAbandonedProducts(prodRes.data.data.items || [])
                setTotalProducts(prodRes.data.data.total || 0)
            }
        } catch (error) {
            console.error("Failed to fetch abandoned products:", error)
            setAbandonedProducts([])
        }
    }

    useEffect(() => {
        if (startDate && endDate) {
            fetchKPIs()
            setPage(1)
        }
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/carts", {
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


    useEffect(() => {
        if (startDate && endDate) {
            fetchAbandonedProducts()
        }
    }, [startDate, endDate, page])

    const totals = useMemo(() => {
        return tableData.reduce(
            (acc, row) => ({
                total_carts: acc.total_carts + row.total_carts,
                completed_carts: acc.completed_carts + row.completed_carts,
                abandoned_carts: acc.abandoned_carts + row.abandoned_carts,
                total_cart_value: acc.total_cart_value + (row.total_cart_value || 0),
                completed_cart_value: acc.completed_cart_value + (row.completed_cart_value || 0),
                abandoned_cart_value: acc.abandoned_cart_value + (row.abandoned_cart_value || 0),
            }),
            { total_carts: 0, completed_carts: 0, abandoned_carts: 0, total_cart_value: 0, completed_cart_value: 0, abandoned_cart_value: 0 }
        )
    }, [tableData])

    const compareTotals = useMemo(() => {
        if (!compareData || !Array.isArray(compareData) || compareData.length === 0) return null
        return (compareData as any[]).reduce(
            (acc: any, row: any) => ({
                total_carts: acc.total_carts + row.total_carts,
                completed_carts: acc.completed_carts + row.completed_carts,
                abandoned_carts: acc.abandoned_carts + row.abandoned_carts,
                total_cart_value: acc.total_cart_value + (row.total_cart_value || 0),
                completed_cart_value: acc.completed_cart_value + (row.completed_cart_value || 0),
                abandoned_cart_value: acc.abandoned_cart_value + (row.abandoned_cart_value || 0),
            }),
            { total_carts: 0, completed_carts: 0, abandoned_carts: 0, total_cart_value: 0, completed_cart_value: 0, abandoned_cart_value: 0 }
        )
    }, [compareData])

    const compareArr = Array.isArray(compareData) ? compareData : []
    const chartData = useMemo(() => {
        return tableData.map((d, i) => ({
            date: d.interval === "monthly" ? d.date : d.date.slice(5), // MM-DD or YYYY-MM
            "Total Carts": d.total_carts,
            "Completed": d.completed_carts,
            "Abandoned": d.abandoned_carts,
            prev_total_carts: compareArr[i]?.total_carts ?? null,
            prev_abandoned: compareArr[i]?.abandoned_carts ?? null,
            prev_date: compareArr[i]?.date ?? null,
        }))
    }, [tableData, compareArr])

    const formatNum = (n: number) => n.toLocaleString()
    const formatCurrency = (value: number) => {
        const rupees = value
        if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(2)} Cr`
        if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2)} L`
        if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`
        return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    }

    const abandonRate = totals.total_carts > 0 
        ? ((totals.abandoned_carts / totals.total_carts) * 100).toFixed(2) 
        : "0.00"

    const cmpAbandonRate = compareTotals?.total_carts > 0
        ? Number(((compareTotals.abandoned_carts / compareTotals.total_carts) * 100).toFixed(2))
        : undefined


    

        return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Cart Metrics</h1>
                    <p className="text-sm text-gray-500">Cart abandonment and completion overview</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || tableData.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Date", key: "date" },
                                { header: "Total Carts", key: "total_carts", format: "number" },
                                { header: "Completed Carts", key: "completed_carts", format: "number" },
                                { header: "Abandoned Carts", key: "abandoned_carts", format: "number" },
                                { header: "Total Cart Value (₹)", key: "total_cart_value", format: "currency" },
                                { header: "Completed Value (₹)", key: "completed_cart_value", format: "currency" },
                                { header: "Abandoned Value (₹)", key: "abandoned_cart_value", format: "currency" },
                            ]
                            exportToExcel(tableData, cols, "Cart_Metrics", startDate, endDate)
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
                    endpoint="/api/carts"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Carts — Period Comparison"
                />
            )}


            {loading && tableData.length === 0 ? (
                <div className="text-sm text-gray-500 py-10">Loading cart data...</div>
            ) : (
                <>
                    {/* Row 1: Count-based KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        <Card className="p-6 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">
                                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0L5 21h14M7 13v8" /></svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-400">Total Carts</h3>
                                <div className="mt-1 text-2xl font-bold text-gray-800">{formatNum(totals.total_carts)}</div>
                                <DeltaLine current={totals.total_carts} previous={compareTotals?.total_carts} kind="count" />
                            </div>
                        </Card>
                        <Card className="p-6 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500">
                                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-400">Completed Carts</h3>
                                <div className="mt-1 text-2xl font-bold text-emerald-600">{formatNum(totals.completed_carts)}</div>
                                <DeltaLine current={totals.completed_carts} previous={compareTotals?.completed_carts} kind="count" />
                            </div>
                        </Card>
                        <Card className="p-6 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center text-rose-500">
                                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-400">Abandoned Carts</h3>
                                <div className="mt-1 text-2xl font-bold text-rose-500">{formatNum(totals.abandoned_carts)}</div>
                                <DeltaLine current={totals.abandoned_carts} previous={compareTotals?.abandoned_carts} kind="count" lowerIsBetter />
                            </div>
                        </Card>
                        <Card className="p-6 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
                                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-400">Abandonment Rate</h3>
                                <div className="mt-1 text-2xl font-bold text-gray-800">{abandonRate}%</div>
                                <DeltaLine current={Number(abandonRate)} previous={cmpAbandonRate} kind="percent" lowerIsBetter />
                            </div>
                        </Card>
                        <Card className="p-6 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center text-rose-500">
                                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-400">Abandoned Value</h3>
                                <div className="mt-1 text-2xl font-bold text-rose-500">{formatCurrency(totals.abandoned_cart_value)}</div>
                                <DeltaLine current={totals.abandoned_cart_value} previous={compareTotals?.abandoned_cart_value} kind="currency" lowerIsBetter />
                            </div>
                        </Card>
                    </div>

                    <Card className="mt-6">
                        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                            <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                            <h3 className="font-semibold text-gray-700">Most Abandoned Products</h3>
                        </div>
                        <div className="p-6">
                            <div className="flex flex-col gap-3">
                                {abandonedProducts.length > 0 ? abandonedProducts.map((p, idx) => (
                                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <span className="text-rose-400 font-bold text-sm min-w-5">{(page - 1) * limit + idx + 1}</span>
                                            <span className="font-medium text-gray-800 leading-tight">{p.title}</span>
                                        </div>
                                        <span className="text-sm bg-white border border-gray-100 shadow-sm px-3 py-1 rounded-full text-gray-600 font-medium whitespace-nowrap mt-3 sm:mt-0">
                                            {formatNum(p.count)} abandoned
                                        </span>
                                    </div>
                                )) : (
                                    <div className="text-sm text-gray-500 py-4 text-center">No abandoned products found</div>
                                )}
                            </div>
                            
                            {/* Pagination Controls */}
                            {totalProducts > limit && (
                                <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-6">
                                    <button 
                                        disabled={page === 1}
                                        onClick={() => setPage(page - 1)}
                                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Previous
                                    </button>
                                    <span className="text-sm text-gray-500">
                                        Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalProducts)} of {formatNum(totalProducts)}
                                    </span>
                                    <button 
                                        disabled={page * limit >= totalProducts}
                                        onClick={() => setPage(page + 1)}
                                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    </Card>

                    <Card className="p-6">
                        <h3 className="text-sm font-semibold text-gray-600 mb-6">Cart Trend ({tableData.length} intervals)</h3>
                        <div className="h-80 w-full overflow-hidden">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip content={<CompareChartTooltip />} />
                                    <Legend />
                                    <Bar dataKey="Total Carts" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Abandoned" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                    {compare.range && (
                                        <Line type="monotone" dataKey="prev_total_carts" name="Total Carts (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                                    )}
                                    {compare.range && (
                                        <Line type="monotone" dataKey="prev_abandoned" name="Abandoned (previous)" stroke="#fda4af" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* ═══════ Tabular Data ═══════ */}
                    <CartDataTable rows={tableData} formatCurrency={formatCurrency} />
                </>
            )}
        </div>
    )
}

const CART_PAGE_SIZE = 10

function CartDataTable({ rows, formatCurrency }: { rows: CartData[]; formatCurrency: (v: number) => string }) {
    const [page, setPage] = useState(1)
    const sorted = useMemo(() => [...rows].reverse(), [rows])
    const totalPages = Math.ceil(sorted.length / CART_PAGE_SIZE) || 1
    const paginatedRows = sorted.slice((page - 1) * CART_PAGE_SIZE, page * CART_PAGE_SIZE)

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 p-5 border-b bg-gray-50/50 text-blue-600 font-bold">
                <List size={20} /><span>Tabular Data</span>
            </div>
            <div className="p-0 overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="text-xs uppercase tracking-wider">
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Total Carts</TableHead>
                            <TableHead className="text-right">Completed</TableHead>
                            <TableHead className="text-right">Abandoned</TableHead>
                            <TableHead className="text-right">Total Value</TableHead>
                            <TableHead className="text-right">Completed Value</TableHead>
                            <TableHead className="text-right">Abandoned Value</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedRows.map(row => (
                            <TableRow key={row.date} className="hover:bg-blue-50/20 transition-colors">
                                <TableCell className="font-bold text-gray-700">{row.date}</TableCell>
                                <TableCell className="text-right tabular-nums text-gray-600">{row.total_carts.toLocaleString()}</TableCell>
                                <TableCell className="text-right tabular-nums text-emerald-600 font-medium">{row.completed_carts.toLocaleString()}</TableCell>
                                <TableCell className="text-right tabular-nums text-rose-500 font-medium">{row.abandoned_carts.toLocaleString()}</TableCell>
                                <TableCell className="text-right tabular-nums text-gray-600">{formatCurrency(row.total_cart_value)}</TableCell>
                                <TableCell className="text-right tabular-nums text-emerald-600">{formatCurrency(row.completed_cart_value)}</TableCell>
                                <TableCell className="text-right tabular-nums text-rose-500">{formatCurrency(row.abandoned_cart_value)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-400">Page {page} of {totalPages}</p>
                    <div className="flex gap-2">
                        <button disabled={page === 1} onClick={() => setPage(page - 1)} className="p-2 border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-30 shadow-sm"><ChevronLeft size={18} /></button>
                        <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="p-2 border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-30 shadow-sm"><ChevronRight size={18} /></button>
                    </div>
                </div>
            )}
        </div>
    )
}
