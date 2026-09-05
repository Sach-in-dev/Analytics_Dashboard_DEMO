"use client"

import { useEffect, useState, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2, Activity, Eye, ShoppingCart, MousePointerClick,
  Zap, ShoppingBag, CreditCard, Search, UserPlus, MousePointer, Globe
} from "lucide-react"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"

/* ─────── Types ─────── */
interface EventMetric {
  eventName: string
  count: number
  percentage: number
}

interface EventsResponse {
  success: boolean
  data: EventMetric[]
  count: number
  totalEvents: number
  stats: {
    pageviews: number
    visitors: number
    visits: number
    bounces: number
    totaltime: number
  } | null
}

interface MetaEvent {
  event_name: string
  action_type: string
  total_count: number
  total_value: number
  percentage: number
  daily: { date: string; count: number; value: number }[]
}

interface MetaEventsResponse {
  success: boolean
  data: {
    events: MetaEvent[]
    summary: {
      total_events: number
      total_event_types: number
      total_value: number
      purchases: number
      add_to_cart: number
      view_content: number
      date_range: { start: string; end: string }
    }
  }
}

type DateFilter =
  | "all"
  | "today"
  | "24h"
  | "7d"
  | "30d"
  | "this-month"
  | "this-year"

type ActiveTab = "website" | "meta"

/* ─────── Helpers ─────── */
function getDateRange(filter: DateFilter) {
  const now = Date.now()
  switch (filter) {
    case "today": {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return { startAt: d.getTime(), endAt: now }
    }
    case "24h":
      return { startAt: now - 86400000, endAt: now }
    case "7d":
      return { startAt: now - 7 * 86400000, endAt: now }
    case "30d":
      return { startAt: now - 30 * 86400000, endAt: now }
    case "this-month": {
      const d = new Date()
      return {
        startAt: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
        endAt: now,
      }
    }
    case "this-year": {
      const d = new Date()
      return {
        startAt: new Date(d.getFullYear(), 0, 1).getTime(),
        endAt: now,
      }
    }
    default:
      return { startAt: now - 30 * 86400000, endAt: now }
  }
}

function filterToDateStrings(filter: DateFilter) {
  const { startAt, endAt } = getDateRange(filter)
  const fmt = (ms: number) => new Date(ms).toISOString().split("T")[0]
  return { start_date: fmt(startAt), end_date: fmt(endAt) }
}

/* ─────── Color & icon maps ─────── */
const EVENT_COLORS: Record<string, string> = {
  "Viewed Product": "#3b82f6",
  "Added to Cart": "#10b981",
  "Started Checkout": "#f59e0b",
  "Placed Order": "#8b5cf6",
  "Removed from Cart": "#ef4444",
  "Coupon Applied": "#06b6d4",
  "Coupon Apply Failed": "#f97316",
  "Coupon Removed": "#ec4899",
  "Increased Cart Quantity": "#84cc16",
  "Decreased Cart Quantity": "#f43f5e",
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  "Viewed Product": <Eye size={16} />,
  "Added to Cart": <ShoppingCart size={16} />,
  "Started Checkout": <MousePointerClick size={16} />,
  "Placed Order": <Activity size={16} />,
}

const META_EVENT_COLORS: Record<string, string> = {
  "Purchases": "#10b981",
  "Add to Cart": "#3b82f6",
  "Initiate Checkout": "#f59e0b",
  "View Content": "#8b5cf6",
  "Search": "#06b6d4",
  "Add Payment Info": "#ec4899",
  "Leads": "#f97316",
  "Complete Registration": "#84cc16",
  "Link Clicks": "#6366f1",
  "Landing Page Views": "#14b8a6",
  "Page Engagement": "#a855f7",
  "Post Engagement": "#f43f5e",
  "Video Views": "#eab308",
  "Conversations Started": "#0ea5e9",
}

const META_EVENT_ICONS: Record<string, React.ReactNode> = {
  "Purchases": <ShoppingBag size={16} />,
  "Add to Cart": <ShoppingCart size={16} />,
  "Initiate Checkout": <CreditCard size={16} />,
  "View Content": <Eye size={16} />,
  "Search": <Search size={16} />,
  "Link Clicks": <MousePointer size={16} />,
  "Landing Page Views": <Globe size={16} />,
  "Leads": <UserPlus size={16} />,
}

/* ═════════════════════════════════════════════
   MAIN COMPONENT
   ═════════════════════════════════════════════ */
export default function EventsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("website")

  // ── Umami state ──
  const [data, setData] = useState<EventMetric[]>([])
  const [stats, setStats] = useState<EventsResponse["stats"]>(null)
  const [totalEvents, setTotalEvents] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState<DateFilter>("30d")

  // ── Meta state ──
  const [metaEvents, setMetaEvents] = useState<MetaEvent[]>([])
  const [metaSummary, setMetaSummary] = useState<MetaEventsResponse["data"]["summary"] | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)

  /* ── Umami fetch ── */
  const fetchEvents = async () => {
    setLoading(true)
    const { startAt, endAt } = getDateRange(dateFilter)
    try {
      const res = await fetch(
        `/api/analytics/umami/events?startAt=${startAt}&endAt=${endAt}`,
        { cache: "no-store" }
      )
      const json = await res.json()
      if (json.success) {
        setData(json.data ?? [])
        setTotalEvents(json.totalEvents ?? 0)
        setStats(json.stats ?? null)
      } else {
        setData([]); setTotalEvents(0); setStats(null)
      }
    } catch {
      setData([]); setTotalEvents(0); setStats(null)
    } finally {
      setLoading(false)
    }
  }

  /* ── Meta fetch ── */
  const fetchMetaEvents = async () => {
    setMetaLoading(true)
    const { start_date, end_date } = filterToDateStrings(dateFilter)
    try {
      const res = await fetch(
        `/api/meta-events?start_date=${start_date}&end_date=${end_date}`,
        { cache: "no-store" }
      )
      const json = await res.json()
      if (json.success && json.data) {
        setMetaEvents(json.data.events ?? [])
        setMetaSummary(json.data.summary ?? null)
      } else {
        setMetaEvents([]); setMetaSummary(null)
      }
    } catch {
      setMetaEvents([]); setMetaSummary(null)
    } finally {
      setMetaLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === "website") fetchEvents()
    else fetchMetaEvents()
  }, [dateFilter, activeTab])

  /* ── Umami chart data ── */
  const chartData = useMemo(() => {
    return data.slice(0, 10).map(d => ({
      name: d.eventName.length > 18 ? d.eventName.slice(0, 18) + "…" : d.eventName,
      count: d.count,
      fill: EVENT_COLORS[d.eventName] || "#6366f1",
    }))
  }, [data])

  /* ── Meta chart data ── */
  const metaChartData = useMemo(() => {
    return metaEvents.map(e => ({
      name: e.event_name.length > 18 ? e.event_name.slice(0, 18) + "…" : e.event_name,
      count: e.total_count,
      fill: META_EVENT_COLORS[e.event_name] || "#6366f1",
    }))
  }, [metaEvents])

  const isLoading = activeTab === "website" ? loading : metaLoading

  return (
    <div className="max-w-7xl mx-auto space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 border-gray-100">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Events Metrics</h1>
          <p className="text-sm text-gray-500">
            {activeTab === "website"
              ? "Real-time event tracking from Umami Analytics"
              : "Meta Pixel conversion events from Facebook Ads"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ExportButton
            disabled={isLoading || (activeTab === "website" ? data.length === 0 : metaEvents.length === 0)}
            onClick={() => {
              if (activeTab === "website") {
                const cols: ExportColumn[] = [
                  { header: "Event Name", key: "eventName" },
                  { header: "Count", key: "count", format: "number" },
                  { header: "Percentage", key: "percentage", format: "number" },
                ]
                exportToExcel(data, cols, "Events")
              } else {
                const cols: ExportColumn[] = [
                  { header: "Event Name", key: "event_name" },
                  { header: "Count", key: "total_count", format: "number" },
                  { header: "Value (₹)", key: "total_value", format: "currency" },
                  { header: "Share (%)", key: "percentage", format: "number" },
                ]
                exportToExcel(metaEvents, cols, "Meta_Events")
              }
            }}
          />
          <Select
            value={dateFilter}
            onValueChange={(v) => setDateFilter(v as DateFilter)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="this-month">This month</SelectItem>
              <SelectItem value="this-year">This year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("website")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "website"
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Activity size={16} />
          Website Events
        </button>
        <button
          onClick={() => setActiveTab("meta")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "meta"
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Zap size={16} />
          Meta Pixel Events
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-blue-500" size={32} />
          <span className="ml-3 text-gray-500">
            Loading {activeTab === "website" ? "Umami" : "Meta"} events...
          </span>
        </div>
      ) : activeTab === "website" ? (
        <WebsiteEventsView
          data={data}
          stats={stats}
          totalEvents={totalEvents}
          chartData={chartData}
        />
      ) : (
        <MetaEventsView
          events={metaEvents}
          summary={metaSummary}
          chartData={metaChartData}
        />
      )}
    </div>
  )
}


/* ═════════════════════════════════════════════
   WEBSITE EVENTS VIEW (Umami — existing)
   ═════════════════════════════════════════════ */
function WebsiteEventsView({
  data,
  stats,
  totalEvents,
  chartData,
}: {
  data: EventMetric[]
  stats: EventsResponse["stats"]
  totalEvents: number
  chartData: any[]
}) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-10 text-center">
        No events recorded for this time period.
      </div>
    )
  }

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPICard title="TOTAL EVENTS" value={totalEvents?.toLocaleString()} color="bg-blue-500" />
        <KPICard title="EVENT TYPES" value={data.length.toString()} color="bg-emerald-500" />
        <KPICard title="PAGEVIEWS" value={stats?.pageviews?.toLocaleString() ?? "—"} color="bg-amber-500" />
        <KPICard title="UNIQUE VISITORS" value={stats?.visitors?.toLocaleString() ?? "—"} color="bg-purple-500" />
      </div>

      {/* Chart */}
      <Card className="p-8">
        <h2 className="text-lg font-bold text-gray-600 mb-8 uppercase tracking-tight">
          Event Distribution
        </h2>
        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 30, left: 120, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                tickFormatter={(v) => v?.toLocaleString()}
              />
              <YAxis
                dataKey="name"
                type="category"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }}
                width={120}
              />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                }}
                formatter={(value: number | string | undefined) => [Number(value ?? 0)?.toLocaleString(), "Events"]}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Data Table */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 p-5 border-b bg-gray-50/50 text-blue-600 font-bold">
          <Activity size={20} />
          <span>Event Breakdown</span>
          <span className="ml-auto text-xs font-medium text-gray-400">
            {totalEvents?.toLocaleString()} total events
          </span>
        </div>
        <div className="p-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold uppercase tracking-wider text-xs text-gray-400">Event Name</TableHead>
                <TableHead className="text-right font-semibold uppercase tracking-wider text-xs text-gray-400">Count</TableHead>
                <TableHead className="text-right font-semibold uppercase tracking-wider text-xs text-gray-400">Share</TableHead>
                <TableHead className="w-[200px] font-semibold uppercase tracking-wider text-xs text-gray-400">Distribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((event) => (
                <TableRow key={event.eventName} className="hover:bg-blue-50/20 transition-colors">
                  <TableCell className="font-bold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                        style={{ backgroundColor: EVENT_COLORS[event.eventName] || "#6366f1" }}
                      />
                      {EVENT_ICONS[event.eventName] && (
                        <span className="text-gray-400">{EVENT_ICONS[event.eventName]}</span>
                      )}
                      {event.eventName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-blue-600">
                    {event.count?.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-gray-600">
                    {event.percentage}%
                  </TableCell>
                  <TableCell>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full transition-all"
                        style={{
                          width: `${event.percentage}%`,
                          backgroundColor: EVENT_COLORS[event.eventName] || "#6366f1",
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  )
}


/* ═════════════════════════════════════════════
   META PIXEL EVENTS VIEW (new)
   ═════════════════════════════════════════════ */
function MetaEventsView({
  events,
  summary,
  chartData,
}: {
  events: MetaEvent[]
  summary: MetaEventsResponse["data"]["summary"] | null
  chartData: any[]
}) {
  if (events.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-10 text-center">
        No Meta Pixel events found. Ensure META_ADS_ACCESS_TOKEN and META_ADS_ACCOUNT_ID are configured.
      </div>
    )
  }

  const totalEvents = summary?.total_events ?? 0

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPICard
          title="TOTAL CONVERSIONS"
          value={totalEvents?.toLocaleString()}
          color="bg-blue-500"
        />
        <KPICard
          title="PURCHASES"
          value={(summary?.purchases ?? 0)?.toLocaleString()}
          color="bg-emerald-500"
        />
        <KPICard
          title="ADD TO CART"
          value={(summary?.add_to_cart ?? 0)?.toLocaleString()}
          color="bg-amber-500"
        />
        <KPICard
          title="VIEW CONTENT"
          value={(summary?.view_content ?? 0)?.toLocaleString()}
          color="bg-purple-500"
        />
      </div>

      {/* Conversion Value KPI */}
      {(summary?.total_value ?? 0) > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 rounded-full p-2.5">
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 tracking-widest uppercase">Total Conversion Value</p>
              <p className="text-3xl font-bold text-gray-900">₹{(summary?.total_value ?? 0)?.toLocaleString()}</p>
            </div>
            <div className="ml-auto text-xs text-gray-500">
              {summary?.date_range?.start} → {summary?.date_range?.end}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <Card className="p-8">
        <h2 className="text-lg font-bold text-gray-600 mb-8 uppercase tracking-tight">
          Meta Pixel Event Distribution
        </h2>
        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 30, left: 140, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                tickFormatter={(v) => v?.toLocaleString()}
              />
              <YAxis
                dataKey="name"
                type="category"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }}
                width={140}
              />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                contentStyle={{
                  borderRadius: "12px",
                  border: "none",
                  boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                }}
                formatter={(value: any) => [Number(value ?? 0)?.toLocaleString(), "Events"]}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Data Table */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 p-5 border-b bg-gray-50/50 text-indigo-600 font-bold">
          <Zap size={20} />
          <span>Meta Pixel Events Breakdown</span>
          <span className="ml-auto text-xs font-medium text-gray-400">
            {totalEvents?.toLocaleString()} total conversions
          </span>
        </div>
        <div className="p-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold uppercase tracking-wider text-xs text-gray-400">Event</TableHead>
                <TableHead className="text-right font-semibold uppercase tracking-wider text-xs text-gray-400">Count</TableHead>
                <TableHead className="text-right font-semibold uppercase tracking-wider text-xs text-gray-400">Value (₹)</TableHead>
                <TableHead className="text-right font-semibold uppercase tracking-wider text-xs text-gray-400">Share</TableHead>
                <TableHead className="w-[180px] font-semibold uppercase tracking-wider text-xs text-gray-400">Distribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.action_type} className="hover:bg-indigo-50/20 transition-colors">
                  <TableCell className="font-bold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                        style={{ backgroundColor: META_EVENT_COLORS[event.event_name] || "#6366f1" }}
                      />
                      {META_EVENT_ICONS[event.event_name] && (
                        <span className="text-gray-400">{META_EVENT_ICONS[event.event_name]}</span>
                      )}
                      {event.event_name}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-indigo-600">
                    {event.total_count?.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 font-medium">
                    {event.total_value > 0 ? `₹${event.total_value?.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-gray-600">
                    {event.percentage}%
                  </TableCell>
                  <TableCell>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full transition-all"
                        style={{
                          width: `${Math.min(event.percentage, 100)}%`,
                          backgroundColor: META_EVENT_COLORS[event.event_name] || "#6366f1",
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  )
}


/* ─────── Shared KPI Card ─────── */
function KPICard({
  title,
  value,
  color,
}: {
  title: string
  value: string
  color: string
}) {
  return (
    <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-full h-1.5 ${color}`} />
      <p className="text-xs font-bold text-gray-400 tracking-widest mb-4 uppercase">
        {title}
      </p>
      <p className="text-4xl font-bold text-gray-900 tracking-tight">{value}</p>
    </div>
  )
}
