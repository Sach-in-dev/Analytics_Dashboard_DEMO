"use client"
import { ArrowUp, ArrowDown, Minus } from "lucide-react"


import { useEffect, useState } from "react"
import axios from "axios"
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

type TopItem = { product_title: string; value: number }

const getPastDate = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().split("T")[0]
}

const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val || 0)





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

export default function ProductsPage() {
    const [data, setData] = useState<TopItem[]>([])
    const [loading, setLoading] = useState(true)
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<TopItem[] | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    // Pagination & Filtration
    const [page, setPage] = useState(1)
    const [limit] = useState(15)
    const [totalPages, setTotalPages] = useState(1)
    const [metricType, setMetricType] = useState<string>("revenue")

    // Category data
    const [categoryTab, setCategoryTab] = useState<"stickiness" | "cross" | "new_trials" | null>(null)
    const [categoryData, setCategoryData] = useState<any[]>([])
    const [categoryLoading, setCategoryLoading] = useState(false)

    const fetchCategoryData = async (tab: "stickiness" | "cross" | "new_trials") => {
        try {
            setCategoryLoading(true)
            const ep = tab === "stickiness" ? "/api/products/category-stickiness" : tab === "cross" ? "/api/products/cross-category" : "/api/products/new-category-trials"
            const res = await axios.get(ep, { params: { start_date: startDate, end_date: endDate } })
            if (res.data?.success) setCategoryData(res.data.data || [])
        } catch (e) { console.error(e) } finally { setCategoryLoading(false) }
    }

    useEffect(() => {
        if (categoryTab) fetchCategoryData(categoryTab)
    }, [categoryTab, startDate, endDate])

    const fetchData = async () => {
        try {
            setLoading(true)
            const res = await axios.get(`/api/products`, {
                params: {
                    start_date: startDate,
                    end_date: endDate,
                    metric_type: metricType,
                    page,
                    limit
                }
            })
            if (res.data?.success) {
                setData(res.data.data)
                setTotalPages(res.data.meta?.lastPage || 1)
            }
        } catch (error) {
            console.error("Failed to fetch products:", error)
            setData([])
        } finally {
            setLoading(false)
        }
    }

    // Refetch on filters or page change
    useEffect(() => {
        if (startDate && endDate && metricType) {
            fetchData()
        }
    }, [startDate, endDate, metricType, page])

    // Reset pagination when dates or metric type change
    useEffect(() => {
        setPage(1)
    }, [startDate, endDate, metricType])

    // Check if showing currency based on metric_type
    const isCurrency = metricType === "revenue"
    const isSearch = metricType === "search"


    

        return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Product Performance</h1>
                    <p className="text-sm text-gray-500">Detailed paginated view of product metrics</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <Select value={metricType} onValueChange={setMetricType}>
                        <SelectTrigger className="w-[180px] bg-white text-gray-700 font-medium">
                            <SelectValue placeholder="Select Metric" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="revenue">Revenue Generated</SelectItem>
                            <SelectItem value="order">Quantity Sold</SelectItem>
                            <SelectItem value="cart">Cart Additions</SelectItem>
                            <SelectItem value="search">Searched Keywords</SelectItem>
                        </SelectContent>
                    </Select>
                    
                    <ExportButton
                        disabled={loading || data.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Product Title", key: "product_title" },
                                { header: metricType === "revenue" ? "Revenue (₹)" : metricType === "order" ? "Units Sold" : metricType === "cart" ? "Cart Drops" : "Searches", key: "value", format: metricType === "revenue" ? "currency" : "number" },
                            ]
                            exportToExcel(data, cols, "Product_Performance", startDate, endDate)
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
                    endpoint="/api/products/category-stickiness"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Products — Period Comparison"
                />
            )}


            <Card>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16">Rank</TableHead>
                                <TableHead>{isSearch ? "Keyword" : "Product Title"}</TableHead>
                                <TableHead className="text-right">
                                    {metricType === "revenue" && "Total Revenue"}
                                    {metricType === "order" && "Units Sold"}
                                    {metricType === "cart" && "Cart Drops"}
                                    {metricType === "search" && "Total Searches"}
                                </TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-10">Loading products...</TableCell>
                                </TableRow>
                            ) : data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-10 text-gray-500">No data found in this period</TableCell>
                                </TableRow>
                            ) : (
                                data.map((row, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell className="font-medium text-gray-500">{(page - 1) * limit + idx + 1}</TableCell>
                                        <TableCell className="font-medium text-gray-800">{row.product_title || "Unknown"}</TableCell>
                                        <TableCell className="text-right text-gray-600 font-semibold">
                                            {isCurrency ? formatCurrency(row.value) : row.value?.toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-end mt-4">
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious 
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                />
                            </PaginationItem>
                            
                            {/* Dynamically show up to 5 pages around the current */}
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

            {/* ─── Product Category Preference ─── */}
            <div className="mt-6">
                <h2 className="text-base font-bold text-gray-700 mb-3">Product Category Preference</h2>
                <div className="flex gap-2 mb-4 border-b border-gray-200">
                    {[
                        { key: "stickiness", label: "Category Stickiness" },
                        { key: "cross", label: "Cross-Category Migration" },
                        { key: "new_trials", label: "New Category Trials" },
                    ].map(t => (
                        <button key={t.key} onClick={() => setCategoryTab(t.key as any)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${categoryTab === t.key ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {categoryTab && (
                    <Card>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-50">
                                        <TableHead>Category</TableHead>
                                        {categoryTab === "stickiness" && <><TableHead className="text-right">Total Orders</TableHead><TableHead className="text-right">Total Revenue</TableHead></>}
                                        {categoryTab === "cross" && <><TableHead>Period</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Share %</TableHead></>}
                                        {categoryTab === "new_trials" && <><TableHead className="text-right">Current Revenue</TableHead><TableHead className="text-right">Prior Revenue</TableHead></>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {categoryLoading ? (
                                        <TableRow><TableCell colSpan={3} className="text-center py-8 text-gray-400">Loading...</TableCell></TableRow>
                                    ) : categoryData.length === 0 ? (
                                        <TableRow><TableCell colSpan={3} className="text-center py-8 text-gray-400">No category data available — category tags not yet populated in product sync.</TableCell></TableRow>
                                    ) : categoryData.map((row: any, i: number) => (
                                        <TableRow key={i} className="hover:bg-gray-50">
                                            <TableCell className="font-medium">{row.category}</TableCell>
                                            {categoryTab === "stickiness" && <>
                                                <TableCell className="text-right">{(row.total_orders||0)?.toLocaleString()}</TableCell>
                                                <TableCell className="text-right text-emerald-600 font-semibold">{formatCurrency(row.total_revenue)}</TableCell>
                                            </>}
                                            {categoryTab === "cross" && <>
                                                <TableCell>{row.period}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                                                <TableCell className="text-right"><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{row.share_pct}%</span></TableCell>
                                            </>}
                                            {categoryTab === "new_trials" && <>
                                                <TableCell className="text-right text-emerald-600 font-semibold">{formatCurrency(row.current_revenue)}</TableCell>
                                                <TableCell className="text-right text-gray-400">{formatCurrency(row.prior_revenue)}</TableCell>
                                            </>}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    )
}
