"use client"

import { useEffect, useState, useMemo } from "react"
import axios from "axios"
import {
    List, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus
} from "lucide-react"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line
} from "recharts"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import { CompareSummary } from "@/components/ui/compare-summary"
import { CompareChartTooltip } from "@/components/ui/compare-chart-tooltip"

const PAGE_SIZE = 10

type ActiveUserData = {
    date: string
    searches: number
    visitors: number
    orders: number
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

export default function ActiveUsersPage() {
    const [data, setData] = useState<ActiveUserData[]>([])
    const [userTypeSummary, setUserTypeSummary] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [startDate, endDate, setDates] = useDateRange()
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<ActiveUserData[] | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    const fetchData = async () => {
        try {
            setLoading(true)
            const res = await axios.get(`/api/active-users`, {
                params: {
                    start_date: startDate,
                    end_date: endDate,
                }
            })
            if (res.data?.success) {
                setData(res.data.data || [])
                setUserTypeSummary(res.data.meta?.user_type_summary || [])
            }
        } catch (error) {
            console.error("Failed to fetch active users:", error)
            setData([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (startDate && endDate) {
            fetchData()
        }
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/active-users", {
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
            searches: acc.searches + d.searches,
            visitors: acc.visitors + d.visitors,
            orders: acc.orders + d.orders,
        }), { searches: 0, visitors: 0, orders: 0 })
    }, [data])

    const compareTotals = useMemo(() => {
        if (!compareData || !Array.isArray(compareData) || compareData.length === 0) return null
        return (compareData as any[]).reduce((acc: any, d: any) => ({
            searches: acc.searches + d.searches,
            visitors: acc.visitors + d.visitors,
            orders: acc.orders + d.orders,
        }), { searches: 0, visitors: 0, orders: 0 })
    }, [compareData])

    const chartData = useMemo(() => {
        const cmpData = Array.isArray(compareData) ? compareData : []
        return data.map((d, i) => ({
            day: d.date.slice(5),
            searches: d.searches,
            visitors: d.visitors,
            orders: d.orders,
            prev_visitors: cmpData[i]?.visitors ?? null,
            prev_date: cmpData[i]?.date ?? null,
        }))
    }, [data, compareData])

    const tableRows = useMemo(() => [...data].reverse(), [data])


    

        return (
        <div className="max-w-7xl mx-auto space-y-6 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 border-gray-100">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Active Users</h1>
                    <p className="text-sm text-gray-500">Track user engagement via searches, visits, and orders.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || data.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Date", key: "date" },
                                { header: "Searches", key: "searches", format: "number" },
                                { header: "Visitors", key: "visitors", format: "number" },
                                { header: "Orders", key: "orders", format: "number" },
                            ]
                            exportToExcel(data, cols, "Active_Users", startDate, endDate)
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
                    endpoint="/api/active-users"
                    currentRange={{ start: startDate, end: endDate }}
                    compareRange={compare.range}
                    title="Active Users — Period Comparison"
                />
            )}


            {loading && data.length === 0 ? (
                <div className="text-sm text-gray-500 py-10">Loading active users...</div>
            ) : data.length === 0 ? (
                <div className="text-sm text-gray-500 py-10 text-center">No active users data available for this date range.</div>
            ) : (
                <>
                    {/* Metric Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <MetricCard title="TOTAL ACTIVE USERS (SEARCHES)" value={totals.searches} color="bg-rose-500">
                            <DeltaLine current={totals.searches} previous={compareTotals?.searches} kind="count" />
                        </MetricCard>
                        <MetricCard title="TOTAL ACTIVE USERS (VISITS)" value={totals.visitors} color="bg-pink-500">
                            <DeltaLine current={totals.visitors} previous={compareTotals?.visitors} kind="count" />
                        </MetricCard>
                        <MetricCard title="TOTAL ACTIVE USERS (ORDERS)" value={totals.orders} color="bg-fuchsia-400">
                            <DeltaLine current={totals.orders} previous={compareTotals?.orders} kind="count" />
                        </MetricCard>
                    </div>

                    {/* Chart */}
                    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-600 mb-10 uppercase tracking-tight">
                            Active Users Trend ({data.length} days)
                        </h2>
                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={val => val?.toLocaleString()} />
                                    <Tooltip cursor={{ fill: '#f8fafc' }} content={<CompareChartTooltip />} />
                                    <Legend verticalAlign="top" align="center" iconType="rect" wrapperStyle={{ paddingBottom: '20px' }} />
                                    <Bar dataKey="searches" name="Searches" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="visitors" name="Visits" fill="#ec4899" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="orders" name="Orders" fill="#e879f9" radius={[4, 4, 0, 0]} />
                                    {compare.range && (
                                        <Line type="monotone" dataKey="prev_visitors" name="Visits (previous)" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* User Type: Brand & Concern Search Breakdown */}
                    {userTypeSummary.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
                            <div className="flex items-center gap-2 p-5 border-b bg-violet-50/50 text-violet-700 font-bold">
                                <span>🔍 User Type — Brand & Concern Search Behaviour</span>
                                <span className="text-xs font-normal text-gray-400 ml-2">New vs Returning customers' search patterns (last 30 days)</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-gray-400 border-b text-left text-xs uppercase tracking-wider">
                                            <th className="px-5 py-3 font-semibold">User Type</th>
                                            <th className="px-5 py-3 text-right font-semibold">Brand Searches</th>
                                            <th className="px-5 py-3 text-right font-semibold">Brand Search %</th>
                                            <th className="px-5 py-3 text-right font-semibold">Concern Searches</th>
                                            <th className="px-5 py-3 text-right font-semibold">Concern Search %</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {userTypeSummary.map((row: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-violet-50/20 transition-colors">
                                                <td className="px-5 py-4 font-bold text-gray-800">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${row.user_type === 'New' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {row.user_type}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-right tabular-nums font-medium">{(row.brand_searches || 0)?.toLocaleString()}</td>
                                                <td className="px-5 py-4 text-right tabular-nums">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${row.brand_search_pct || 0}%` }} />
                                                        </div>
                                                        <span className="font-semibold text-indigo-600">{row.brand_search_pct || 0}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-right tabular-nums font-medium">{(row.concern_searches || 0)?.toLocaleString()}</td>
                                                <td className="px-5 py-4 text-right tabular-nums">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${row.concern_search_pct || 0}%` }} />
                                                        </div>
                                                        <span className="font-semibold text-amber-600">{row.concern_search_pct || 0}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Data Table */}
                    <DataTable rows={tableRows} />
                </>
            )}
        </div>
    )
}

function MetricCard({ title, value, color, children }: { title: string; value: number; color: string; children?: React.ReactNode }) {
    return (
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1.5 ${color}`} />
            <p className="text-xs font-bold text-gray-400 tracking-widest mb-4 uppercase">{title}</p>
            <p className="text-4xl font-bold text-gray-900 tracking-tight">{value?.toLocaleString()}</p>
            {children}
        </div>
    )
}

function DataTable({ rows }: { rows: any[] }) {
    const [page, setPage] = useState(1)
    const totalPages = Math.ceil(rows.length / PAGE_SIZE) || 1
    const paginatedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-6">
            <div className="flex items-center gap-2 p-5 border-b bg-gray-50/50 text-blue-600 font-bold">
                <List size={20} /><span>Activity Logs</span>
            </div>
            <div className="p-6 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-400 border-b text-left">
                            <th className="pb-4 font-semibold uppercase tracking-wider text-xs">Date</th>
                            <th className="pb-4 text-right font-semibold uppercase tracking-wider text-xs">Searches</th>
                            <th className="pb-4 text-right font-semibold uppercase tracking-wider text-xs">Visits</th>
                            <th className="pb-4 text-right font-semibold uppercase tracking-wider text-xs">Orders</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {paginatedRows.map(row => (
                            <tr key={row.date} className="hover:bg-blue-50/20 transition-colors">
                                <td className="py-4 font-bold text-gray-700">{row.date}</td>
                                <td className="py-4 text-right tabular-nums text-gray-600">{row.searches?.toLocaleString()}</td>
                                <td className="py-4 text-right tabular-nums text-gray-600">{row.visitors?.toLocaleString()}</td>
                                <td className="py-4 text-right tabular-nums font-bold text-blue-600">{row.orders?.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-400">Page {page} of {totalPages}</p>
                        <div className="flex gap-2">
                            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="p-2 border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-30 shadow-sm"><ChevronLeft size={18} /></button>
                            <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="p-2 border rounded-lg bg-white hover:bg-gray-50 disabled:opacity-30 shadow-sm"><ChevronRight size={18} /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
