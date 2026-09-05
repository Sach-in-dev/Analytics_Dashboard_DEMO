"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
    PackageOpen, AlertTriangle, IndianRupee, DatabaseBackup, Clock, ArrowUp, ArrowDown, Minus
} from "lucide-react"

const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val || 0)

export default function InventoryPage() {
    const [loading, setLoading] = useState(true)
    const [summary, setSummary] = useState<any>(null)
    
    // Tab State
    const [activeTab, setActiveTab] = useState<"dead" | "oos" | "aging" | "gaps" | "forecast">("dead")
    const [page, setPage] = useState(1)
    const limit = 12

    const [tableData, setTableData] = useState<any[]>([])
    const [totalPages, setTotalPages] = useState(1)
    const [tableLoading, setTableLoading] = useState(true)

    // Load static KPI
    useEffect(() => {
        const fetchSummary = async () => {
            try {
                const res = await axios.get('/api/inventory/summary')
                setSummary(res.data?.data)
            } catch (e) {
                console.error("Failed to load summary", e)
            }
        }
        fetchSummary()
    }, [])

    // Load active tab data
    useEffect(() => {
        const fetchTable = async () => {
            try {
                setTableLoading(true)
                let endpoint = ''
                if (activeTab === 'dead') endpoint = '/api/inventory/dead-stock'
                if (activeTab === 'oos') endpoint = '/api/inventory/stock-outs'
                if (activeTab === 'aging') endpoint = '/api/inventory/aging'
                if (activeTab === 'gaps') endpoint = '/api/inventory/merchandising-gaps'
                if (activeTab === 'forecast') endpoint = '/api/inventory/demand-forecast'

                const res = await axios.get(endpoint, { params: activeTab === 'gaps' || activeTab === 'forecast' ? {} : { page, limit } })
                setTableData(res.data?.data || [])
                setTotalPages(res.data?.meta?.lastPage || 1)
            } catch (e) {
                console.error("Failed to load table", e)
            } finally {
                setTableLoading(false)
            }
        }
        fetchTable()
    }, [activeTab, page])

    // Reset pagination when swapping tabs
    useEffect(() => {
        setPage(1)
    }, [activeTab])

    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight">Inventory Metrics</h1>
                    <p className="text-sm text-gray-500">Live operational oversight of warehouse stock distribution</p>
                </div>
                <ExportButton
                    disabled={tableLoading || tableData.length === 0}
                    onClick={() => {
                        const tabLabel = activeTab === "dead" ? "Dead_Stock" : activeTab === "oos" ? "Stock_Outs" : "Aging_Inventory"
                        const cols: ExportColumn[] = [
                            { header: "Product", key: "product_title" },
                            { header: "SKU", key: "sku" },
                            { header: "Quantity", key: "inventory_quantity", format: "number" },
                        ]
                        if (activeTab !== "oos") {
                            cols.push({ header: "Locked Value (₹)", key: "total_value", format: "currency" })
                        }
                        exportToExcel(tableData, cols, tabLabel)
                    }}
                />
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 min-w-0">
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-sky-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Total Tracked SKUs
                            <PackageOpen className="h-4 w-4 text-sky-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-gray-800">
                            {summary ? summary.total_tracked_variants.toLocaleString() : "0"}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Total Locked Capital
                            <IndianRupee className="h-4 w-4 text-indigo-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-gray-800">
                            {summary ? formatCurrency(summary.total_locked_capital) : "₹0"}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Sum value of positive stock</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Dead Stock (90 Days)
                            <DatabaseBackup className="h-4 w-4 text-rose-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-rose-600">
                            {summary ? summary.dead_stock_variants.toLocaleString() : "0"}
                        </div>
                        <p className="text-xs text-rose-400 mt-1 opacity-80">
                            Value: {summary ? formatCurrency(summary.dead_stock_value) : "₹0"}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                            Stock-Out Variants
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-amber-600">
                            {summary ? summary.total_stock_outs.toLocaleString() : "0"}
                        </div>
                        <p className="text-xs text-amber-500 mt-1 opacity-80">Requires replenishment</p>
                    </CardContent>
                </Card>
            </div>

            {/* Deep Dive Module Segment */}
            <Card className="shadow-sm border">
                <CardHeader className="border-b px-0 pt-0 pb-0 bg-gray-50/50 rounded-t-xl overflow-hidden">
                    <div className="flex text-sm font-medium text-gray-500 overflow-x-auto">
                        <button 
                            className={`px-6 py-4 flex items-center gap-2 transition-colors ${activeTab === 'dead' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'hover:bg-gray-100 hover:text-gray-700'}`}
                            onClick={() => setActiveTab('dead')}
                        >
                            <DatabaseBackup className="h-4 w-4" /> Dead Stock Warnings
                        </button>
                        <button 
                            className={`px-6 py-4 flex items-center gap-2 transition-colors ${activeTab === 'oos' ? 'text-amber-600 border-b-2 border-amber-600 bg-white' : 'hover:bg-gray-100 hover:text-gray-700'}`}
                            onClick={() => setActiveTab('oos')}
                        >
                            <AlertTriangle className="h-4 w-4" /> Stock-Out Logs
                        </button>
                        <button
                            className={`px-6 py-4 flex items-center gap-2 transition-colors ${activeTab === 'aging' ? 'text-teal-600 border-b-2 border-teal-600 bg-white' : 'hover:bg-gray-100 hover:text-gray-700'}`}
                            onClick={() => setActiveTab('aging')}
                        >
                            <Clock className="h-4 w-4" /> Aging Inventory
                        </button>
                        <button
                            className={`px-6 py-4 flex items-center gap-2 transition-colors ${activeTab === 'gaps' ? 'text-rose-600 border-b-2 border-rose-600 bg-white' : 'hover:bg-gray-100 hover:text-gray-700'}`}
                            onClick={() => setActiveTab('gaps')}
                        >
                            <AlertTriangle className="h-4 w-4" /> Merchandising Gaps
                        </button>
                        <button
                            className={`px-6 py-4 flex items-center gap-2 transition-colors ${activeTab === 'forecast' ? 'text-violet-600 border-b-2 border-violet-600 bg-white' : 'hover:bg-gray-100 hover:text-gray-700'}`}
                            onClick={() => setActiveTab('forecast')}
                        >
                            <PackageOpen className="h-4 w-4" /> Demand Forecast
                        </button>
                    </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto min-h-[400px]">
                    {(activeTab === 'gaps' || activeTab === 'forecast') ? (
                        <Table className="min-w-[700px]">
                            <TableHeader>
                                <TableRow className="bg-gray-50/30">
                                    <TableHead className="w-[300px]">Product</TableHead>
                                    {activeTab === 'gaps' && <><TableHead>SKU</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Search Demand</TableHead></>}
                                    {activeTab === 'forecast' && <><TableHead className="text-right">Daily Velocity</TableHead><TableHead className="text-right">Current Stock</TableHead><TableHead className="text-right">Days of Stock</TableHead><TableHead className="text-center">Signal</TableHead></>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tableLoading ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-16 text-gray-400">Loading...</TableCell></TableRow>
                                ) : tableData.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center py-16 text-gray-400">No data found.</TableCell></TableRow>
                                ) : tableData.map((row: any, i: number) => (
                                    <TableRow key={i} className="hover:bg-gray-50">
                                        <TableCell className="font-medium text-gray-800 max-w-[300px] truncate">{row.product_title}</TableCell>
                                        {activeTab === 'gaps' && <>
                                            <TableCell className="font-mono text-xs text-gray-500">{row.sku || "N/A"}</TableCell>
                                            <TableCell className="text-right">{row.inventory_quantity} units</TableCell>
                                            <TableCell className="text-right">
                                                {row.search_demand > 0 ? <span className="text-rose-600 font-semibold">{row.search_demand.toLocaleString()} searches</span> : <span className="text-gray-400">No demand data</span>}
                                            </TableCell>
                                        </>}
                                        {activeTab === 'forecast' && <>
                                            <TableCell className="text-right">{row.daily_velocity}/day</TableCell>
                                            <TableCell className="text-right">{row.current_stock} units</TableCell>
                                            <TableCell className="text-right font-semibold">{row.days_of_stock ?? "—"}d</TableCell>
                                            <TableCell className="text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${row.reorder_signal === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : row.reorder_signal === 'REORDER_SOON' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {row.reorder_signal}
                                                </span>
                                            </TableCell>
                                        </>}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                    <Table className="min-w-[800px]">
                        <TableHeader>
                            <TableRow className="bg-gray-50/30">
                                <TableHead className="w-[300px]">Product / Variant</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                                {activeTab !== 'oos' && <TableHead className="text-right">Locked Value</TableHead>}
                                <TableHead className="text-right">{activeTab === 'oos' ? "OOS Since (approx)" : "Date Added"}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tableLoading ? (
                                <TableRow>
                                    <TableCell colSpan={activeTab === 'oos' ? 4 : 5} className="text-center py-16 text-gray-400">Loading module aggregates...</TableCell>
                                </TableRow>
                            ) : tableData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={activeTab === 'oos' ? 4 : 5} className="text-center py-16 text-gray-400">Optimization complete, no bad inventory logs found.</TableCell>
                                </TableRow>
                            ) : tableData.map((row, i) => (
                                <TableRow key={i} className="hover:bg-sky-50/20">
                                    <TableCell className="font-medium text-gray-800 max-w-[300px] truncate" title={row.product_title}>
                                        {row.product_title || "Unknown Base Product"}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-gray-500">
                                        {row.sku || "N/A"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${row.inventory_quantity <= 0 ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-700'}`}>
                                            {row.inventory_quantity} units
                                        </span>
                                    </TableCell>
                                    {activeTab !== 'oos' && (
                                        <TableCell className="text-right text-gray-600 font-medium">
                                            {formatCurrency(row.total_value)}
                                        </TableCell>
                                    )}
                                    <TableCell className="text-right text-gray-400 text-sm whitespace-nowrap">
                                        {row.created_at || row.updated_at ? new Date(row.created_at || row.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    )}

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
