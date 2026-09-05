"use client"

import { useEffect, useState, useMemo } from "react"
import axios from "axios"
import { Card } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import {
    ChevronLeft, ChevronRight, List, TrendingUp, TrendingDown, Search, BarChart3, Tag, Layers, Users, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import { useDateRange } from "@/hooks/use-date-range"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line
} from "recharts"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"
import { CompareChartTooltip } from "@/components/ui/compare-chart-tooltip"

type SearchData = {
    date: string
    total_searches: number
    unique_searchers: number
    with_results: number
    zero_results: number
    interval: string
}

type KeywordData = { keyword: string; count: number }

type AnalyticsData = {
    snapshot_date: string | null
    top_keywords: any[]
    zero_result: any[]
    low_result: any[]
    high_exit: any[]
    brand_volume: any[]
    category_demand: any[]
    attributes_frequency: any[]
    new_vs_returning: any[]
    high_intent_demand: any[]
    not_purchased_products: any[]
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

export default function SearchesPage() {
    const [data, setData] = useState<SearchData[]>([])
    const [keywords, setKeywords] = useState<KeywordData[]>([])
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<SearchData[] | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    const fetchData = async () => {
        try {
            setLoading(true)
            const [res, keywordRes, analyticsRes] = await Promise.all([
                axios.get(`/api/searches`, { params: { start_date: startDate, end_date: endDate } }),
                axios.get(`/api/searches/keywords`, { params: { start_date: startDate, end_date: endDate } }),
                axios.get(`/api/searches/analytics`),
            ])
            if (res.data?.success) setData(res.data.data || [])
            if (keywordRes.data?.success) setKeywords(keywordRes.data.data || [])
            if (analyticsRes.data?.success) setAnalytics(analyticsRes.data.data || null)
        } catch (error) {
            console.error("Failed to fetch searches:", error)
            setData([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { if (startDate && endDate) fetchData() }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/searches", {
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


    const totals = useMemo(() => {
        return data.reduce((acc, d) => ({
            total_searches: acc.total_searches + d.total_searches,
            unique_searchers: acc.unique_searchers + d.unique_searchers,
            with_results: acc.with_results + d.with_results,
            zero_results: acc.zero_results + d.zero_results,
        }), { total_searches: 0, unique_searchers: 0, with_results: 0, zero_results: 0 })
    }, [data])

    const compareTotals = useMemo(() => {
        if (!compareData || !Array.isArray(compareData) || compareData.length === 0) return null
        return (compareData as any[]).reduce((acc: any, d: any) => ({
            total_searches: acc.total_searches + d.total_searches,
            unique_searchers: acc.unique_searchers + d.unique_searchers,
            with_results: acc.with_results + d.with_results,
            zero_results: acc.zero_results + d.zero_results,
        }), { total_searches: 0, unique_searchers: 0, with_results: 0, zero_results: 0 })
    }, [compareData])

    const chartData = useMemo(() => {
        const cmpData = Array.isArray(compareData) ? compareData : []
        return data.map((d, i) => ({
            date: d.interval === "monthly" ? d.date : d.date.slice(5),
            "With Results": d.with_results,
            "Zero Results": d.zero_results,
            "Total": d.total_searches,
            "prev_total": cmpData[i]?.total_searches ?? null,
            "prev_date": cmpData[i]?.date ?? null,
        }))
    }, [data, compareData])


    

        return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Search Metrics</h1>
                    <p className="text-sm text-gray-500">Tracking aggregate customer searches dynamically</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || data.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Date", key: "date" },
                                { header: "Total Searches", key: "total_searches", format: "number" },
                                { header: "Unique Searchers", key: "unique_searchers", format: "number" },
                                { header: "With Results", key: "with_results", format: "number" },
                                { header: "Zero Results", key: "zero_results", format: "number" },
                            ]
                            exportToExcel(data, cols, "Search_Metrics", startDate, endDate)
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
                    endpoint="/api/searches"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Searches — Period Comparison"
                />
            )}


            {loading && data.length === 0 ? (
                <div className="text-sm text-gray-500 py-10">Loading search data...</div>
            ) : data.length === 0 ? (
                <div className="text-sm text-gray-500 py-10 text-center">No search data available for this date range.</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="p-6">
                            <h3 className="text-sm font-medium text-gray-400">Total Searches</h3>
                            <div className="mt-1 text-2xl font-bold text-gray-800">{totals.total_searches?.toLocaleString()}</div>
                            <DeltaLine current={totals.total_searches} previous={compareTotals?.total_searches} kind="count" />
                        </Card>
                        <Card className="p-6">
                            <h3 className="text-sm font-medium text-gray-400">Unique Searchers</h3>
                            <div className="mt-1 text-2xl font-bold text-gray-800">{totals.unique_searchers?.toLocaleString()}</div>
                            <DeltaLine current={totals.unique_searchers} previous={compareTotals?.unique_searchers} kind="count" />
                        </Card>
                        <Card className="p-6">
                            <h3 className="text-sm font-medium text-gray-400">With Results</h3>
                            <div className="mt-1 text-2xl font-bold text-emerald-600">{totals.with_results?.toLocaleString()}</div>
                            <DeltaLine current={totals.with_results} previous={compareTotals?.with_results} kind="count" />
                        </Card>
                        <Card className="p-6">
                            <h3 className="text-sm font-medium text-gray-400">Zero Results</h3>
                            <div className="mt-1 text-2xl font-bold text-rose-500">{totals.zero_results?.toLocaleString()}</div>
                            <DeltaLine current={totals.zero_results} previous={compareTotals?.zero_results} kind="count" lowerIsBetter />
                        </Card>
                    </div>

                    <Card className="mt-6">
                        <div className="p-4 border-b border-gray-100">
                            <h3 className="font-semibold text-gray-700">Top 10 Most Searched Keywords</h3>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {keywords.length > 0 ? keywords.map((k, idx) => (
                                    <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border border-gray-100 ${idx === 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white text-xs font-bold text-rose-500 shadow-sm">
                                                {idx + 1}
                                            </span>
                                            <span className="font-medium text-sm text-gray-800">{k.keyword}</span>
                                        </div>
                                        <span className="text-sm text-gray-500 font-medium">{k.count?.toLocaleString()}</span>
                                    </div>
                                )) : (
                                    <div className="col-span-full text-sm text-gray-500 py-4 text-center">No keyword data found</div>
                                )}
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6 mt-6">
                        <h3 className="text-sm font-semibold text-gray-600 mb-6">Search Query Trend ({data.length} intervals)</h3>
                        <div className="h-80 w-full overflow-hidden">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip content={<CompareChartTooltip />} />
                                    <Legend />
                                    <Bar dataKey="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="With Results" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Zero Results" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                    {compare.range && (
                                        <Line type="monotone" dataKey="prev_total" name="Total (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* ═══════ Analytics Sections ═══════ */}
                    {analytics && (
                        <>
                            {/* 1. Top Searched Keywords (Enhanced) */}
                            <SectionTable
                                title="Top Searched Keywords"
                                subtitle="Trending keywords with week-over-week comparison"
                                icon={<TrendingUp size={18} />}
                                color="blue"
                                headers={["Search Keyword", "Top Search Volume Last Week", "Rank by Count", "Volume Last Week 2", "Trending % Change", "Sum of Total Results", "Count of Search Keywords"]}
                                rows={analytics.top_keywords}
                                renderRow={(row: any) => (
                                    <>
                                        <TableCell className="font-medium text-gray-800">{row.keyword}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.top_search_volume_last_week?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.rank_by_count}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.top_search_volume_last_week_2?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right">
                                            <span className={`inline-flex items-center gap-1 text-sm font-medium ${row.trending_pct_change > 0 ? 'text-emerald-600' : row.trending_pct_change < 0 ? 'text-rose-500' : 'text-gray-400'}`}>
                                                {row.trending_pct_change > 0 ? <TrendingUp size={14} /> : row.trending_pct_change < 0 ? <TrendingDown size={14} /> : null}
                                                {row.trending_pct_change}%
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{row.sum_total_results?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.count_search_keywords?.toLocaleString()}</TableCell>
                                    </>
                                )}
                            />

                            {/* 2. Zero-Result Searches */}
                            <SectionTable
                                title="Zero-Result Searches"
                                subtitle="Keywords returning no results — potential catalog gaps"
                                icon={<Search size={18} />}
                                color="rose"
                                headers={["Search Keyword", "Sum of Total Results", "Top Search Volume Last Week", "Count of Search Keywords"]}
                                rows={analytics.zero_result}
                                renderRow={(row: any) => (
                                    <>
                                        <TableCell className="font-medium text-gray-800">{row.keyword}</TableCell>
                                        <TableCell className="text-right tabular-nums text-rose-500">{row.sum_total_results?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.top_search_volume_last_week?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.count_search_keywords?.toLocaleString()}</TableCell>
                                    </>
                                )}
                            />

                            {/* 3. Low-Result Searches */}
                            <SectionTable
                                title="Low-Result Searches"
                                subtitle="Keywords with fewer than 3 results — improve product mapping"
                                icon={<Search size={18} />}
                                color="amber"
                                headers={["Search Keyword", "Sum of Total Results", "Top Search Volume Last Week", "Count of Search Keywords"]}
                                rows={analytics.low_result}
                                renderRow={(row: any) => (
                                    <>
                                        <TableCell className="font-medium text-gray-800">{row.keyword}</TableCell>
                                        <TableCell className="text-right tabular-nums text-amber-600">{row.sum_total_results?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.top_search_volume_last_week?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.count_search_keywords?.toLocaleString()}</TableCell>
                                    </>
                                )}
                            />

                            {/* 4. High Exit Searches */}
                            <SectionTable
                                title="High Exit Searches"
                                subtitle="Keywords with high search volume but potential drop-off"
                                icon={<BarChart3 size={18} />}
                                color="purple"
                                headers={["Search Keyword", "Rank Exit Keywords", "Exit Search Count", "Sum of Total Results"]}
                                rows={analytics.high_exit}
                                renderRow={(row: any) => (
                                    <>
                                        <TableCell className="font-medium text-gray-800">{row.keyword}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.rank_exit_keywords}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.exit_search_count?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.sum_total_results?.toLocaleString()}</TableCell>
                                    </>
                                )}
                            />

                            {/* 5. Brand Search Volume */}
                            <SectionTable
                                title="Brand Search Volume"
                                subtitle="Search demand by brand"
                                icon={<Tag size={18} />}
                                color="indigo"
                                headers={["Brand", "Sum of Total Results", "Top Search Volume Last Week", "Count of Search Keywords"]}
                                rows={analytics.brand_volume}
                                renderRow={(row: any) => (
                                    <>
                                        <TableCell className="font-medium text-gray-800">{row.brand}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.sum_total_results?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.top_search_volume_last_week?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.count_search_keywords?.toLocaleString()}</TableCell>
                                    </>
                                )}
                            />

                            {/* 6. Category Demand */}
                            <SectionTable
                                title="Category Demand"
                                subtitle="Search demand by product category"
                                icon={<Layers size={18} />}
                                color="teal"
                                headers={["Category", "Sum of Total Results", "Top Search Volume Last Week", "Count of Search Keywords"]}
                                rows={analytics.category_demand}
                                renderRow={(row: any) => (
                                    <>
                                        <TableCell className="font-medium text-gray-800">{row.category}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.sum_total_results?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.top_search_volume_last_week?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.count_search_keywords?.toLocaleString()}</TableCell>
                                    </>
                                )}
                            />

                            {/* 7. Attributes Frequency */}
                            <SectionTable
                                title="Attributes Frequency"
                                subtitle="Search frequency by product attributes (skin type, concern, etc.)"
                                icon={<Layers size={18} />}
                                color="cyan"
                                headers={["Attributes", "Top Search Volume Last Week", "Sum of Total Results", "Count of Search Keywords"]}
                                rows={analytics.attributes_frequency}
                                renderRow={(row: any) => (
                                    <>
                                        <TableCell className="font-medium text-gray-800 max-w-xs truncate">{row.attributes}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.top_search_volume_last_week?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.sum_total_results?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.count_search_keywords?.toLocaleString()}</TableCell>
                                    </>
                                )}
                            />

                            {/* 8. New VS Returning Customers */}
                            {analytics.new_vs_returning.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
                                    <div className="flex items-center gap-2 p-5 border-b bg-violet-50/50 text-violet-600 font-bold">
                                        <Users size={18} /><span>New VS Returning Customers</span>
                                        <span className="text-xs font-normal text-gray-400 ml-2">Search behavior by customer type</span>
                                    </div>
                                    <div className="p-0 overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="text-xs uppercase tracking-wider">
                                                    <TableHead>User Type</TableHead>
                                                    <TableHead className="text-right">Brand Searches</TableHead>
                                                    <TableHead className="text-right">Brand Search %</TableHead>
                                                    <TableHead className="text-right">Concern Searches</TableHead>
                                                    <TableHead className="text-right">Concern Search %</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {analytics.new_vs_returning.map((row: any, idx: number) => (
                                                    <TableRow key={idx} className="hover:bg-violet-50/20 transition-colors">
                                                        <TableCell className="font-bold text-gray-700">{row.user_type}</TableCell>
                                                        <TableCell className="text-right tabular-nums">{row.brand_searches?.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right tabular-nums">{row.brand_search_pct}%</TableCell>
                                                        <TableCell className="text-right tabular-nums">{row.concern_searches?.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right tabular-nums">{row.concern_search_pct}%</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )}


                            {/* 9. High-Intent Demand Patterns */}
                            <SectionTable
                                title="High-Intent Demand Patterns"
                                subtitle="Keywords with high volume + good results — strong purchase intent signals"
                                icon={<TrendingUp size={18} />}
                                color="teal"
                                headers={["Keyword", "Category", "Brand", "Search Count", "Avg Results", "Last 7d"]}
                                rows={analytics.high_intent_demand || []}
                                renderRow={(row: any) => (
                                    <>
                                        <TableCell className="font-medium text-gray-800">{row.keyword}</TableCell>
                                        <TableCell className="text-gray-500 text-sm">{row.category || "—"}</TableCell>
                                        <TableCell className="text-gray-500 text-sm">{row.brand || "—"}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.search_count?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.avg_results}</TableCell>
                                        <TableCell className="text-right tabular-nums font-semibold text-teal-600">{row.last_7d_searches?.toLocaleString()}</TableCell>
                                    </>
                                )}
                            />

                            {/* 10. Products Frequently Searched but Not Purchased */}
                            <SectionTable
                                title="Searched but Not Purchased"
                                subtitle="High search volume with very low purchase conversion — unmet demand or merchandising gaps"
                                icon={<Search size={18} />}
                                color="rose"
                                headers={["Keyword", "Search Volume", "Last 7d Searches", "Purchases", "Purchase / Search %"]}
                                rows={analytics.not_purchased_products || []}
                                renderRow={(row: any) => (
                                    <>
                                        <TableCell className="font-medium text-gray-800">{row.keyword}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.search_volume?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">{row.last_7d_searches?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums text-rose-500">{row.purchase_count?.toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{row.purchase_to_search_pct}%</span>
                                        </TableCell>
                                    </>
                                )}
                            />
                        </>
                    )}

                    {/* ═══════ Tabular Data ═══════ */}
                    <SearchDataTable rows={data} />
                </>
            )}
        </div>
    )
}

/* ═══════ Reusable Section Table ═══════ */
const SECTION_PAGE_SIZE = 10
const colorMap: Record<string, string> = {
    blue: "bg-blue-50/50 text-blue-600",
    rose: "bg-rose-50/50 text-rose-600",
    amber: "bg-amber-50/50 text-amber-600",
    purple: "bg-purple-50/50 text-purple-600",
    indigo: "bg-indigo-50/50 text-indigo-600",
    teal: "bg-teal-50/50 text-teal-600",
    cyan: "bg-cyan-50/50 text-cyan-600",
}

function SectionTable({ title, subtitle, icon, color, headers, rows, renderRow }: {
    title: string; subtitle: string; icon: React.ReactNode; color: string;
    headers: string[]; rows: any[]; renderRow: (row: any) => React.ReactNode
}) {
    const [page, setPage] = useState(1)
    const totalPages = Math.ceil((rows?.length || 0) / SECTION_PAGE_SIZE) || 1
    const paginatedRows = (rows || []).slice((page - 1) * SECTION_PAGE_SIZE, page * SECTION_PAGE_SIZE)

    if (!rows || rows.length === 0) return null

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
            <div className={`flex items-center gap-2 p-5 border-b font-bold ${colorMap[color] || colorMap.blue}`}>
                {icon}<span>{title}</span>
                <span className="text-xs font-normal text-gray-400 ml-2">{subtitle}</span>
            </div>
            <div className="p-0 overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="text-xs uppercase tracking-wider">
                            {headers.map((h, i) => (
                                <TableHead key={i} className={i > 0 ? "text-right" : ""}>{h}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedRows.map((row: any, idx: number) => (
                            <TableRow key={idx} className="hover:bg-gray-50/50 transition-colors">
                                {renderRow(row)}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-400">Page {page} of {totalPages} ({rows.length} rows)</p>
                    <div className="flex gap-2">
                        <button disabled={page === 1} onClick={() => setPage(page - 1)} className="p-2 border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-30 shadow-sm"><ChevronLeft size={18} /></button>
                        <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="p-2 border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-30 shadow-sm"><ChevronRight size={18} /></button>
                    </div>
                </div>
            )}
        </div>
    )
}

/* ═══════ Original Tabular Data ═══════ */
const SEARCH_PAGE_SIZE = 10

function SearchDataTable({ rows }: { rows: SearchData[] }) {
    const [page, setPage] = useState(1)
    const sorted = useMemo(() => [...rows].reverse(), [rows])
    const totalPages = Math.ceil(sorted.length / SEARCH_PAGE_SIZE) || 1
    const paginatedRows = sorted.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE)

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
            <div className="flex items-center gap-2 p-5 border-b bg-gray-50/50 text-blue-600 font-bold">
                <List size={20} /><span>Tabular Data</span>
            </div>
            <div className="p-0 overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="text-xs uppercase tracking-wider">
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Total Searches</TableHead>
                            <TableHead className="text-right">Unique Searchers</TableHead>
                            <TableHead className="text-right">With Results</TableHead>
                            <TableHead className="text-right">Zero Results</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedRows.map(row => (
                            <TableRow key={row.date} className="hover:bg-blue-50/20 transition-colors">
                                <TableCell className="font-bold text-gray-700">{row.date}</TableCell>
                                <TableCell className="text-right tabular-nums text-gray-600">{row.total_searches?.toLocaleString()}</TableCell>
                                <TableCell className="text-right tabular-nums text-gray-600">{row.unique_searchers?.toLocaleString()}</TableCell>
                                <TableCell className="text-right tabular-nums text-emerald-600 font-medium">{row.with_results?.toLocaleString()}</TableCell>
                                <TableCell className="text-right tabular-nums text-rose-500 font-medium">{row.zero_results?.toLocaleString()}</TableCell>
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
