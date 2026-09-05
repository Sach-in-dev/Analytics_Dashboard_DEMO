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
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"

type SingleCouponMetrics = {
    coupon_code: string
    coupon_name: string
    discount_type: string
    total_orders: number
    total_discount: number
    total_revenue: number
    total_subtotal_amount: number
    average_order_value: number
    redeemed_points: string
}

type CouponData = {
    coupon_code: string
    coupon_name: string
    discount_type: string
    usage_count: number
    total_discount: number
    total_revenue: number
}

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

export default function CouponsPage() {
    const [data, setData] = useState<CouponData[]>([])
    const [selectedCoupon, setSelectedCoupon] = useState<string | null>(null)
    const [metricData, setMetricData] = useState<SingleCouponMetrics | null>(null)
    const [loading, setLoading] = useState(true)
    const [metricLoading, setMetricLoading] = useState(false)
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<CouponData[] | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)
    
    // Pagination for the coupon pill list
    const [page, setPage] = useState(1)
    const [limit] = useState(15)
    const [totalPages, setTotalPages] = useState(1)

    const fetchData = async () => {
        try {
            setLoading(true)
            const res = await axios.get(`/api/coupons`, {
                params: {
                    start_date: startDate,
                    end_date: endDate,
                    page,
                    limit
                }
            })
            if (res.data?.success) {
                const coupons = res.data.data
                setData(coupons)
                setTotalPages(res.data.meta?.lastPage || 1)
                if (coupons.length > 0 && !selectedCoupon) {
                    setSelectedCoupon(coupons[0].coupon_code)
                }
            }
        } catch (error) {
            console.error("Failed to fetch coupons:", error)
            setData([])
        } finally {
            setLoading(false)
        }
    }

    // Fetch Single Coupon Metrics
    useEffect(() => {
        const fetchMetrics = async () => {
            if (!selectedCoupon || !startDate || !endDate) return
            try {
                setMetricLoading(true)
                const res = await axios.get(`/api/coupons/${selectedCoupon}`, {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setMetricData(res.data.data)
                }
            } catch (error) {
                console.error("Failed to fetch single coupon metrics:", error)
            } finally {
                setMetricLoading(false)
            }
        }
        fetchMetrics()
    }, [selectedCoupon, startDate, endDate])

    // Refetch list on filters or page change
    useEffect(() => {
        if (startDate && endDate) {
            fetchData()
        }
    }, [startDate, endDate, page])

    // Reset pagination when dates change
    useEffect(() => {
        setPage(1)
        // do not reset selected coupon so it retains stickiness if possible, else it defaults to first
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/coupons", {
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



    

        return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Coupon Metrics</h1>
                    <p className="text-sm text-gray-500">Detailed paginated usage of coupons</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || data.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Coupon Code", key: "coupon_code" },
                                { header: "Coupon Name", key: "coupon_name" },
                                { header: "Discount Type", key: "discount_type" },
                                { header: "Usage Count", key: "usage_count", format: "number" },
                                { header: "Total Discount (₹)", key: "total_discount", format: "currency" },
                                { header: "Total Revenue (₹)", key: "total_revenue", format: "currency" },
                            ]
                            exportToExcel(data, cols, "Coupon_Metrics", startDate, endDate)
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
                    endpoint="/api/coupons"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Coupons — Period Comparison"
                />
            )}


            {data.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                    {data.map((c, i) => {
                        const isSelected = selectedCoupon === c.coupon_code
                        return (
                            <button
                                key={i}
                                onClick={() => setSelectedCoupon(c.coupon_code)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                                    isSelected 
                                    ? 'bg-rose-500 text-white border-rose-500 shadow-md transform scale-105' 
                                    : 'bg-white text-rose-400 border-rose-200 hover:border-rose-300 hover:bg-rose-50'
                                }`}
                            >
                                {c.coupon_code}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-end -mt-2">
                    {/* Minimal Pagination */}
                    <div className="flex gap-1 items-center bg-white border border-gray-200 rounded-lg p-1">
                        <button 
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className={`px-3 py-1 text-sm rounded ${page === 1 ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Prev
                        </button>
                        <span className="text-sm font-medium text-gray-700 px-3 border-x border-gray-100">
                            {page} / {totalPages}
                        </span>
                        <button 
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className={`px-3 py-1 text-sm rounded ${page === totalPages ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {metricLoading ? (
                <div className="py-20 text-center text-gray-400 text-sm">Loading coupon metrics...</div>
            ) : metricData ? (
                <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-6 mt-4 shadow-sm">
                    <div className="flex flex-col md:flex-row gap-6 md:items-center text-sm">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-700">Coupon Name:</span>
                            <span className="text-gray-500">{metricData.coupon_name || 'N/A'}</span>
                        </div>
                        <div className="hidden md:block w-px h-4 bg-gray-200"></div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-700">Discount Type:</span>
                            <span className="text-gray-500">{metricData.discount_type || 'N/A'}</span>
                        </div>
                    </div>

                    {(() => {
                        const cmpMetric = compareData ? compareData.find((c: any) => c.coupon_code === selectedCoupon) : null;
                        return (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Card className="p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="text-sm font-semibold text-gray-400">Total Orders</h3>
                            <div className="mt-4 text-3xl font-bold text-gray-800">{metricData.total_orders.toLocaleString()}</div>
                            <DeltaLine current={metricData.total_orders} previous={cmpMetric?.usage_count} kind="count" />
                        </Card>
                        <Card className="p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                            <h3 className="text-sm font-semibold text-gray-400">Average Order Value</h3>
                            <div className="mt-4 text-3xl font-bold text-gray-800">{formatCurrency(metricData.average_order_value)}</div>
                            <DeltaLine current={metricData.average_order_value} previous={cmpMetric ? cmpMetric.total_revenue / (cmpMetric.usage_count || 1) : undefined} kind="currency" />
                        </Card>
                        <Card className="p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative">
                            <h3 className="text-sm font-semibold text-gray-400">Total Revenue</h3>
                            <div className="mt-4 text-3xl font-bold text-gray-800">{formatCurrency(metricData.total_revenue)}</div>
                            <DeltaLine current={metricData.total_revenue} previous={cmpMetric?.total_revenue} kind="currency" />
                        </Card>
                        <Card className="p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                            <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                15
                            </div>
                            <h3 className="text-sm font-semibold text-gray-400">Total Discount</h3>
                            <div className="mt-4 text-3xl font-bold text-gray-800">{formatCurrency(metricData.total_discount)}</div>
                            <DeltaLine current={metricData.total_discount} previous={cmpMetric?.total_discount} kind="currency" />
                        </Card>
                        <Card className="p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative">
                            <h3 className="text-sm font-semibold text-gray-400">Total Subtotal Amount</h3>
                            <div className="mt-4 text-3xl font-bold text-gray-800">{formatCurrency(metricData.total_subtotal_amount)}</div>
                            <DeltaLine current={metricData.total_subtotal_amount} previous={undefined} kind="currency" />
                        </Card>
                        <Card className="p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative">
                            <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                15
                            </div>
                            <h3 className="text-sm font-semibold text-gray-400">Redeemed Points</h3>
                            <div className="mt-4 text-3xl font-bold text-gray-800">{metricData.redeemed_points}</div>

                        </Card>
                    </div>
                    ); })()}
                </div>
            ) : null}

            {/* ═══════ Coupon Summary Table ═══════ */}
            {data.length > 0 && (
                <Card className="overflow-hidden mt-2">
                    <div className="p-4 border-b bg-gray-50/50">
                        <h3 className="font-semibold text-gray-700">Coupon Performance Summary</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Coupon Code</TableHead>
                                    <TableHead>Coupon Name</TableHead>
                                    <TableHead>Discount Type</TableHead>
                                    <TableHead className="text-right">Usage Count</TableHead>
                                    <TableHead className="text-right">Total Discount</TableHead>
                                    <TableHead className="text-right">Total Revenue</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((c, i) => (
                                    <TableRow key={i} className={`hover:bg-gray-50/50 cursor-pointer transition-colors ${selectedCoupon === c.coupon_code ? 'bg-rose-50/50' : ''}`} onClick={() => setSelectedCoupon(c.coupon_code)}>
                                        <TableCell className="font-semibold text-rose-600">{c.coupon_code}</TableCell>
                                        <TableCell className="text-gray-700">{c.coupon_name || 'N/A'}</TableCell>
                                        <TableCell className="text-gray-500 text-xs uppercase">{c.discount_type || '—'}</TableCell>
                                        <TableCell className="text-right tabular-nums font-medium text-gray-800">{c.usage_count.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums text-gray-600">{formatCurrency(c.total_discount)}</TableCell>
                                        <TableCell className="text-right tabular-nums font-semibold text-emerald-600">{formatCurrency(c.total_revenue)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            )}

        </div>
    )
}
