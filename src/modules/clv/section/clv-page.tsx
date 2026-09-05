"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Users, DollarSign, ShoppingBag, TrendingUp, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Minus
} from "lucide-react"

function fmt(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`
  return `₹${v.toLocaleString("en-IN")}`
}

export default function ClvPage() {
  const [data, setData] = useState<any[]>([])
  const [meta, setMeta] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState("total_spend")
  const [sortOrder, setSortOrder] = useState("desc")
  const limit = 20

  const fetchData = async (p: number, sb: string, so: string) => {
    try {
      setLoading(true)
      const r = await api.get("/clv", { params: { page: p, limit, sort_by: sb, sort_order: so } })
      if (r.data?.success) { setData(r.data.data); setMeta(r.data.meta) }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { fetchData(page, sortBy, sortOrder) }, [page, sortBy, sortOrder])

  const handleSort = (col: string) => {
    if (sortBy === col) { setSortOrder(so => so === "desc" ? "asc" : "desc"); setPage(1) }
    else { setSortBy(col); setSortOrder("desc"); setPage(1) }
  }

  const SortIcon = ({ col }: { col: string }) => (
    <ArrowUpDown className={`h-3 w-3 ml-1 inline ${sortBy === col ? "text-indigo-500" : "text-gray-300"}`} />
  )

  const s = meta?.summary

  return (
    <div className="space-y-6 mb-8 w-full max-w-full">
      <div>
        <h1 className="text-xl font-bold text-gray-800 tracking-tight">Customer Lifetime Value</h1>
        <p className="text-sm text-gray-500">Total spend, purchase history, and MoM growth per customer</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Customers", value: s ? s.total_customers.toLocaleString() : "—", icon: Users, color: "from-indigo-50 to-indigo-100/50 border-l-indigo-500 text-indigo-700", sub: "With purchase history" },
          { label: "Total Revenue", value: s ? fmt(s.total_revenue) : "—", icon: DollarSign, color: "from-emerald-50 to-emerald-100/50 border-l-emerald-500 text-emerald-700", sub: "All-time paid orders" },
          { label: "Avg AOV", value: s ? fmt(s.avg_order_value) : "—", icon: ShoppingBag, color: "from-amber-50 to-amber-100/50 border-l-amber-500 text-amber-700", sub: "Average order value" },
          { label: "Avg Orders / Customer", value: s ? s.avg_orders_per_customer.toFixed(1) : "—", icon: TrendingUp, color: "from-violet-50 to-violet-100/50 border-l-violet-500 text-violet-700", sub: "Purchase frequency" },
        ].map(k => (
          <Card key={k.label} className={`bg-gradient-to-br ${k.color} shadow-sm border-l-4`}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2">{k.label}<k.icon className="h-4 w-4 shrink-0 opacity-70" /></CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-extrabold">{loading && !s ? "—" : k.value}</div><p className="text-xs opacity-70 mt-1">{k.sub}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Sort by:</span>
        <Select value={sortBy} onValueChange={v => { setSortBy(v); setPage(1) }}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="total_spend">Total Spend</SelectItem>
            <SelectItem value="order_count">Order Count</SelectItem>
            <SelectItem value="avg_order_value">AOV</SelectItem>
            <SelectItem value="mom_growth_pct">MoM Growth</SelectItem>
            <SelectItem value="first_purchase_date">First Purchase</SelectItem>
            <SelectItem value="last_purchase_date">Last Purchase</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={v => { setSortOrder(v); setPage(1) }}>
          <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">High → Low</SelectItem>
            <SelectItem value="asc">Low → High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("total_spend")}>Total Spend<SortIcon col="total_spend" /></TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("order_count")}>Orders<SortIcon col="order_count" /></TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("avg_order_value")}>AOV<SortIcon col="avg_order_value" /></TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("first_purchase_date")}>First Purchase<SortIcon col="first_purchase_date" /></TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("last_purchase_date")}>Last Purchase<SortIcon col="last_purchase_date" /></TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("mom_growth_pct")}>MoM Growth<SortIcon col="mom_growth_pct" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-12">Loading…</TableCell></TableRow>
                ) : data.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-12">No customer data</TableCell></TableRow>
                ) : data.map((c: any, i: number) => (
                  <TableRow key={c.customer_id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{c.customer_name || "—"}</TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[180px] truncate">{c.email || "—"}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">{fmt(c.total_spend)}</TableCell>
                    <TableCell className="text-right">{c.order_count}</TableCell>
                    <TableCell className="text-right">{fmt(c.avg_order_value)}</TableCell>
                    <TableCell className="text-right text-sm text-gray-500">{c.first_purchase_date || "—"}</TableCell>
                    <TableCell className="text-right text-sm text-gray-500">{c.last_purchase_date || "—"}</TableCell>
                    <TableCell className="text-right">
                      {c.mom_growth_pct != null ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.mom_growth_pct > 0 ? "bg-emerald-100 text-emerald-700" : c.mom_growth_pct < 0 ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-500"}`}>
                          {c.mom_growth_pct > 0 ? "+" : ""}{c.mom_growth_pct}%
                        </span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.lastPage > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, meta.total)} of {meta.total.toLocaleString()} customers</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-medium text-gray-700">Page {page} of {meta.lastPage}</span>
            <button onClick={() => setPage(p => Math.min(meta.lastPage, p + 1))} disabled={page === meta.lastPage} className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}
