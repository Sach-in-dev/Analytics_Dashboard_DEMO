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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
    Star, MessageSquareText, MessageSquareQuote, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
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

export default function ReviewsPage() {
    const [loading, setLoading] = useState(true)
    const [paginatedLoading, setPaginatedLoading] = useState(false)
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<any>(null)
    const [compareLoading, setCompareLoading] = useState(false)
    
    // KPI Data
    const [summary, setSummary] = useState<any>(null)
    const [recentReviews, setRecentReviews] = useState<any[]>([])

    // Paginated Data
    const [page, setPage] = useState(1)
    const [limit] = useState(10)
    const [sortBy, setSortBy] = useState("highest")
    const [paginatedProducts, setPaginatedProducts] = useState<any[]>([])
    const [totalPages, setTotalPages] = useState(1)

    // Initial / Date range fetch
    const fetchGeneralData = async () => {
        try {
            setLoading(true)
            const [sumRes, recRes] = await Promise.all([
                axios.get(`/api/reviews/summary`, { params: { start_date: startDate, end_date: endDate } }),
                axios.get(`/api/reviews/recent`, { params: { start_date: startDate, end_date: endDate, limit: 10 } })
            ])
            setSummary(sumRes.data?.data)
            setRecentReviews(recRes.data?.data || [])
        } catch (error) {
            console.error("Failed to fetch reviews:", error)
        } finally {
            setLoading(false)
        }
    }

    const fetchPaginatedProducts = async () => {
        try {
            setPaginatedLoading(true)
            const res = await axios.get(`/api/reviews/product-ratings`, { 
                params: { 
                    start_date: startDate, 
                    end_date: endDate, 
                    page, 
                    limit, 
                    sort_by: sortBy 
                } 
            })
            setPaginatedProducts(res.data?.data || [])
            setTotalPages(res.data?.meta?.lastPage || 1)
        } catch (error) {
            console.error("Failed to fetch paginated ratings:", error)
        } finally {
            setPaginatedLoading(false)
        }
    }

    useEffect(() => {
        if (startDate && endDate) {
            fetchGeneralData()
            setPage(1) // Reset pagination on date bounds change
        }
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/reviews/summary", {
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
            fetchPaginatedProducts()
        }
    }, [startDate, endDate, page, sortBy])

    // Format Distribution Data for Recharts
    const distData = summary ? [
        { name: "5 Stars", count: summary.distribution["5"], fill: "#10b981" },
        { name: "4 Stars", count: summary.distribution["4"], fill: "#34d399" },
        { name: "3 Stars", count: summary.distribution["3"], fill: "#fbbf24" },
        { name: "2 Stars", count: summary.distribution["2"], fill: "#f59e0b" },
        { name: "1 Star",  count: summary.distribution["1"], fill: "#ef4444" },
    ] : []

    const compareSummary = compareData?.summary ?? compareData

    const renderStars = (rating: number) => {
        return (
            <div className="flex items-center gap-0.5 text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 ${i < rating ? "fill-amber-400" : "fill-neutral-200 text-neutral-200"}`} />
                ))}
            </div>
        )
    }
    

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">Reviews & Ratings</h1>
                    <p className="text-sm text-gray-500">Insights into product sentiment and customer feedback</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || paginatedProducts.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Product", key: "product_title" },
                                { header: "Avg Rating", key: "average_rating", format: "number" },
                                { header: "Review Count", key: "review_count", format: "number" },
                            ]
                            exportToExcel(paginatedProducts, cols, "Product_Reviews", startDate, endDate)
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
                    endpoint="/api/reviews/summary"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Product Reviews — Period Comparison"
                />
            )}


            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-w-0">
                <Card className="bg-gradient-to-br from-white to-gray-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Overall Rating
                            <Star className="h-4 w-4 text-emerald-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-gray-800">
                            {summary ? summary.average_rating.toFixed(2) : "0.00"}
                        </div>
                        <p className="text-sm text-gray-500 mt-2 font-medium">Average across period</p>
                        <DeltaLine current={summary?.average_rating} previous={compareSummary?.average_rating} kind="count" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Total Reviews
                            <MessageSquareText className="h-4 w-4 text-emerald-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-gray-800">
                            {summary ? summary.total_reviews.toLocaleString() : "0"}
                        </div>
                        <p className="text-sm text-gray-500 mt-2 font-medium">Verified submissions</p>
                        <DeltaLine current={summary?.total_reviews} previous={compareSummary?.total_reviews} kind="count" />
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Positive Sentiment
                            <MessageSquareQuote className="h-4 w-4 text-emerald-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-extrabold text-gray-800">
                            {summary && summary.total_reviews > 0 
                                ? Math.round(((summary.distribution["5"] + summary.distribution["4"]) / summary.total_reviews) * 100)
                                : 0}%
                        </div>
                        <p className="text-sm text-emerald-600 mt-2 font-medium">4 and 5 star proportion</p>
                    </CardContent>
                </Card>
            </div>

            {/* Distribution Chart and Paginated Products */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
                {/* Distribution Chart */}
                <Card className="shadow-sm h-[400px] flex flex-col min-w-0">
                    <CardHeader>
                        <CardTitle className="text-lg">Sentiment Distribution</CardTitle>
                        <CardDescription>Breakdown by star rating</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 min-w-0">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-gray-400">Loading chart...</div>
                        ) : (
                            <div className="h-full w-full overflow-hidden relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart layout="vertical" data={distData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={60} tick={{fill: '#6b7280', fontSize: 13}} axisLine={false} tickLine={false} />
                                        <Tooltip cursor={{fill: '#f3f4f6'}} formatter={(value) => [`${value} reviews`, 'Count']} />
                                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                            {distData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Paginated Products Table */}
                <Card className="shadow-sm h-[400px] flex flex-col min-w-0">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div>
                            <CardTitle className="text-lg">Product Leaderboard</CardTitle>
                            <CardDescription>Metrics spanning across catalog</CardDescription>
                        </div>
                        <Select value={sortBy} onValueChange={(val) => { setSortBy(val); setPage(1); }}>
                            <SelectTrigger className="w-[160px] bg-white h-8 text-xs">
                                <SelectValue placeholder="Sort By" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="highest">Highest Rating</SelectItem>
                                <SelectItem value="lowest">Lowest Rating</SelectItem>
                                <SelectItem value="most_reviewed">Most Reviewed</SelectItem>
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-auto border rounded-md">
                            <Table>
                                <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Rating</TableHead>
                                        <TableHead className="text-right">Reviews</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedLoading && paginatedProducts.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-8 text-gray-400">Fetching metrics...</TableCell>
                                        </TableRow>
                                    ) : paginatedProducts.map((p, i) => (
                                        <TableRow key={p.product_id || i}>
                                            <TableCell className="font-medium text-gray-800 max-w-[150px] sm:max-w-[250px] truncate" title={p.product_title || "Unknown"}>
                                                {p.product_title || "Unknown"}
                                            </TableCell>
                                            <TableCell align="right">
                                                <div className="flex justify-end items-center gap-1.5 min-w-[50px]">
                                                    <span className="font-semibold">{p.average_rating.toFixed(1)}</span>
                                                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-gray-500">{p.review_count}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {totalPages > 1 && (
                            <div className="flex justify-center mt-3 scale-90 -mb-2">
                                <Pagination>
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious 
                                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                                className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                            />
                                        </PaginationItem>
                                        <span className="text-xs text-muted-foreground mx-4">Page {page} of {totalPages}</span>
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

            {/* Recent Reviews Table */}
            <Card className="shadow-sm w-full min-w-0">
                <CardHeader>
                    <CardTitle className="text-lg">Recent Verified Reviews</CardTitle>
                    <CardDescription>Latest feedback from community submissions</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto w-full">
                    <Table className="min-w-[800px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Rating</TableHead>
                                <TableHead className="w-[200px]">Product</TableHead>
                                <TableHead className="w-[150px]">Customer</TableHead>
                                <TableHead>Comment</TableHead>
                                <TableHead className="text-right w-[120px]">Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && recentReviews.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-10 text-gray-400">Loading reviews...</TableCell>
                                </TableRow>
                            ) : recentReviews.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-10 text-gray-400">No reviews found in this range</TableCell>
                                </TableRow>
                            ) : recentReviews.map((r, i) => (
                                <TableRow key={i} className="hover:bg-gray-50/50">
                                    <TableCell>{renderStars(r.rating)}</TableCell>
                                    <TableCell className="font-medium text-gray-800 truncate max-w-[200px]" title={r.product_title}>
                                        {r.product_title || "Unknown"}
                                    </TableCell>
                                    <TableCell className="text-gray-600 truncate max-w-[150px]">
                                        {r.first_name || ""} {r.last_name || ""}
                                    </TableCell>
                                    <TableCell className="text-gray-600 min-w-[200px]">
                                        {r.title && <div className="font-medium text-gray-900 line-clamp-1">{r.title}</div>}
                                        <div className="line-clamp-2 text-sm">{r.comment || "—"}</div>
                                    </TableCell>
                                    <TableCell className="text-right text-gray-400 text-sm whitespace-nowrap">
                                        {r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
