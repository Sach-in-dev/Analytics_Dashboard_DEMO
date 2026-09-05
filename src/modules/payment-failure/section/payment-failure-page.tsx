"use client"

import { useEffect, useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ExportButton } from "@/components/ui/export-button"
import { exportToExcel, ExportColumn } from "@/lib/export-utils"
import axios from "axios"
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, BarChart, Bar, Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDateRange } from "@/hooks/use-date-range"
import { useCompareRange, pctChange } from "@/hooks/use-compare-range"
import { CompareControl, CompareBanner } from "@/components/ui/compare-control"
import {
    CreditCard, AlertTriangle, TrendingDown, DollarSign, Users, ArrowUpRight, ArrowDownRight, Info, ShoppingCart, ArrowUp, ArrowDown, Minus, RefreshCw
} from "lucide-react"

// ───── Types ─────
interface PaymentFailureSummary {
    total_attempts: number
    failed_payments: number
    failure_rate: number
    lost_gmv: number
    affected_customers: number
    recovered_orders: number
    recovered_gmv: number
    recovery_rate: number
}

interface PaymentFailureTrend {
    date: string
    total_attempts: number
    failed_payments: number
    failure_rate: number
    lost_gmv: number
    affected_customers: number
}

interface PaymentFailureByMethod {
    provider: string
    payment_mode: string
    label: string
    attempts: number
    failed: number
    lost_gmv: number
    failure_rate: number
}

interface PaymentFailureByReason {
    error_code: string
    failed: number
    lost_gmv: number
    affected_customers: number
    share_pct: number
}

interface PaymentFailureData {
    summary: PaymentFailureSummary
    trend: PaymentFailureTrend[]
    by_method?: PaymentFailureByMethod[]
    by_reason?: PaymentFailureByReason[]
}

// ───── Human-readable error-code labels ─────
const REASON_LABELS: Record<string, string> = {
    TXN_NOT_COMPLETED: "Transaction abandoned",
    TXN_CANCELLED: "Transaction cancelled by user",
    TRANSACTION_DECLINED: "Bank declined transaction",
    DEVICE_FINGERPRINT_MISMATCH: "Device fingerprint mismatch",
    ONLINE_TRANSACTIONS_DISABLED: "Online transactions disabled on card",
    INSUFFICIENT_BALANCE: "Insufficient balance",
    TXN_LIMIT_BREACHED: "Transaction limit breached",
    INVALID_MPIN: "Invalid UPI MPIN",
    TXN_FAILED: "Transaction failed at gateway",
    TXN_BLOCKED: "Transaction blocked",
    TXN_AUTO_FAILED: "Auto-failed (timeout)",
    BANK_NOT_ABLE_TO_PROCESS: "Bank unable to process",
    TXN_NOT_ALLOWED: "Transaction not allowed",
    MPIN_LIMIT_BREACHED: "MPIN attempt limit breached",
    BANK_TECHNICAL_ISSUE: "Bank technical issue",
    OTHERS: "Other",
    UNKNOWN: "Unknown / not reported",
}
const reasonLabel = (code: string) => REASON_LABELS[code] || code.replace(/_/g, " ")

// ───── Constants ─────
const FAILURE_ALERT_THRESHOLD = 15 // If Failure Rate > 15%, show red alert

// ───── Helpers ─────
function formatCurrency(value: number): string {
    if (typeof value !== "number" || isNaN(value)) return "₹0";
    if (value >= 10000000) return `₹${(value / 10000000)?.toFixed(1)}Cr`
    if (value >= 100000) return `₹${(value / 100000)?.toFixed(1)}L`
    if (value >= 1000) return `₹${(value / 1000)?.toFixed(1)}K`
    return `₹${value?.toFixed(0)}`
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
}

// ───── Custom Tooltip ─────
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const prevDate = payload[0]?.payload?.prev_date
    return (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg px-4 py-3 text-sm">
            <p className="font-semibold text-gray-800 mb-2">{formatDate(label)}</p>
            {payload.map((entry: any, idx: number) => (
                <p key={idx} className="text-gray-600 flex items-center gap-2">
                    <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}:{" "}
                    <span className="font-medium">
                        {entry.name === "Failure Rate (%)"
                            ? `${entry.value}%`
                            : entry.name === "Lost GMV"
                            ? formatCurrency(entry.value)
                            : entry.value?.toLocaleString()}
                    </span>
                </p>
            ))}
            {prevDate && (
                <p className="mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] text-gray-400">
                    previous-period day: {prevDate}
                </p>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════


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

export default function PaymentFailurePage() {
    const [data, setData] = useState<PaymentFailureData | null>(null)
    const [loading, setLoading] = useState(true)

    const getPastDate = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split("T")[0]
    }
    const [startDate, endDate, setDates] = useDateRange()

    // ── Compare period ──
    const compare = useCompareRange(startDate, endDate)
    const [compareData, setCompareData] = useState<PaymentFailureData | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                const res = await axios.get("/api/payment-failure", {
                    params: { start_date: startDate, end_date: endDate }
                })
                if (res.data?.success) {
                    setData(res.data.data)
                }
            } catch (e) {
                console.error("Failed to load payment failure data", e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [startDate, endDate])

    useEffect(() => {
        if (!compare.range) { setCompareData(null); return }
        const fetchCompare = async () => {
            try {
                setCompareLoading(true)
                const res = await axios.get("/api/payment-failure", {
                    params: { start_date: compare.range!.start, end_date: compare.range!.end }
                })
                if (res.data?.success) setCompareData(res.data.data)
                else setCompareData(null)
            } catch (e) {
                console.error("Failed to load payment-failure compare data", e)
                setCompareData(null)
            } finally {
                setCompareLoading(false)
            }
        }
        fetchCompare()
    }, [compare.range?.start, compare.range?.end])

    const summary = data?.summary
    const compareSummary = compareData?.summary
    const compareTrend = compareData?.trend || []
    const trend = data?.trend || []
    const byMethod = data?.by_method || []
    const byReason = data?.by_reason || []
    const failureRate = summary?.failure_rate || 0
    const isHighFailure = failureRate > FAILURE_ALERT_THRESHOLD

    // Render a small delta line under a KPI value. `lowerIsBetter` flips the colour.
    

    // Build aligned (current/previous) chart data so prev overlays by index.
    const trendChartData = trend.map((row, i) => ({
        ...row,
        prev_failure_rate: compareTrend[i]?.failure_rate ?? null,
        prev_date: compareTrend[i]?.date ?? null,
    }))

    // ───────────── RENDER ─────────────
    return (
        <div className="space-y-6 mb-8 w-full max-w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 tracking-tight flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-rose-600" />
                        Payment Failure Analytics
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Track checkout sessions where payment was not captured — lost GMV and affected customers
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton
                        disabled={loading || trend.length === 0}
                        onClick={() => {
                            const cols: ExportColumn[] = [
                                { header: "Date", key: "date" },
                                { header: "Total Checkout Attempts", key: "total_attempts", format: "number" },
                                { header: "Failed Payments", key: "failed_payments", format: "number" },
                                { header: "Failure Rate (%)", key: "failure_rate", format: "percent" },
                                { header: "Lost GMV (₹)", key: "lost_gmv", format: "currency" },
                                { header: "Affected Customers", key: "affected_customers", format: "number" },
                            ]
                            exportToExcel(trend, cols, "Payment_Failure", startDate, endDate)
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
                        onChange={(start, end) => { setDates(start, end) }}
                    />
                </div>
            </div>

            {/* Compare period summary banner */}
            {compare.range && (
                <CompareBanner
                    current={{ start: startDate, end: endDate }}
                    compare={compare.range}
                    mode={compare.mode}
                    loading={compareLoading}
                />
            )}

            {/* ═══════ Alert Banner ═══════ */}
            {!loading && isHighFailure && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 animate-pulse">
                    <div className="bg-red-100 rounded-full p-2 shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-red-800">
                            High Payment Failure Alert — {failureRate}%
                        </p>
                        <p className="text-xs text-red-600">
                            Payment failure rate exceeds {FAILURE_ALERT_THRESHOLD}% threshold. Review payment gateway and checkout UX.
                        </p>
                    </div>
                </div>
            )}

            {/* ═══════ KPI Cards ═══════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {/* Failure Rate — Hero Card */}
                <Card className={`shadow-sm border-l-4 ${isHighFailure
                    ? "bg-gradient-to-br from-red-50 to-red-100/50 border-l-red-500"
                    : "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-l-emerald-500"
                }`}>
                    <CardHeader className="pb-2">
                        <CardTitle className={`text-xs font-semibold uppercase tracking-widest flex items-center justify-between gap-2 ${
                            isHighFailure ? "text-red-600" : "text-emerald-600"
                        }`}>
                            Failure Rate
                            {isHighFailure
                                ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                                : <TrendingDown className="h-4 w-4 text-emerald-500 shrink-0" />
                            }
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-4xl font-extrabold ${isHighFailure ? "text-red-700" : "text-emerald-700"}`}>
                            {loading ? "—" : `${failureRate}%`}
                        </div>
                        <p className={`text-xs mt-1 ${isHighFailure ? "text-red-500/70" : "text-emerald-500/70"}`}>
                            {isHighFailure ? "⚠ Above threshold" : "✓ Within range"}
                        </p>
                        <DeltaLine current={summary?.failure_rate} previous={compareSummary?.failure_rate} kind="percent" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Total Checkout Attempts */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-gray-700">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Checkout Attempts
                            <ShoppingCart className="h-4 w-4 text-gray-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-gray-800">
                            {loading ? "—" : (summary?.total_attempts || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Total orders initiated</p>
                        <DeltaLine current={summary?.total_attempts} previous={compareSummary?.total_attempts} kind="count" />
                    </CardContent>
                </Card>

                {/* Failed Payments */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-rose-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Failed Payments
                            <CreditCard className="h-4 w-4 text-rose-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-rose-600">
                            {loading ? "—" : (summary?.failed_payments || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Payment not captured</p>
                        <DeltaLine current={summary?.failed_payments} previous={compareSummary?.failed_payments} kind="count" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Lost GMV */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Lost GMV
                            <DollarSign className="h-4 w-4 text-amber-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-amber-600">
                            {loading ? "—" : formatCurrency(summary?.lost_gmv || 0)}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Revenue not collected</p>
                        <DeltaLine current={summary?.lost_gmv} previous={compareSummary?.lost_gmv} kind="currency" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Affected Customers */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Affected Users
                            <Users className="h-4 w-4 text-violet-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-violet-600">
                            {loading ? "—" : (summary?.affected_customers || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Unique customers impacted</p>
                        <DeltaLine current={summary?.affected_customers} previous={compareSummary?.affected_customers} kind="count" lowerIsBetter />
                    </CardContent>
                </Card>

                {/* Recovered Orders */}
                <Card className="bg-gradient-to-br from-white to-gray-50/50 shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex items-center justify-between gap-2">
                            Recovered
                            <RefreshCw className="h-4 w-4 text-emerald-600 shrink-0" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-extrabold text-emerald-600">
                            {loading ? "—" : (summary?.recovered_orders || 0)?.toLocaleString()}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            {loading ? "" : `${summary?.recovery_rate || 0}% of failures retried & paid`}
                        </p>
                        {!loading && summary && summary.recovered_gmv > 0 && (
                            <p className="text-xs text-emerald-600 font-medium mt-1">
                                {formatCurrency(summary.recovered_gmv)} recovered
                            </p>
                        )}
                        <DeltaLine current={summary?.recovered_orders} previous={compareSummary?.recovered_orders} kind="count" />
                    </CardContent>
                </Card>
            </div>

            {/* ═══════ Insight Card ═══════ */}
            {!loading && summary && (
                <Card className="shadow-sm border bg-gradient-to-r from-gray-50 to-white">
                    <CardContent className="py-5">
                        <div className="flex items-start gap-3">
                            <div className={`rounded-full p-2 shrink-0 ${isHighFailure ? "bg-red-100" : "bg-blue-100"}`}>
                                <Info className={`h-5 w-5 ${isHighFailure ? "text-red-600" : "text-blue-600"}`} />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800 mb-1">Key Insight</h3>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    Out of <strong>{summary.total_attempts?.toLocaleString()}</strong> checkout attempts,{" "}
                                    <strong className="text-rose-600">{summary.failed_payments?.toLocaleString()}</strong> ({failureRate}%)
                                    were payment failures, resulting in{" "}
                                    <strong className="text-amber-600">{formatCurrency(summary.lost_gmv)}</strong> in lost GMV
                                    affecting <strong className="text-violet-600">{summary.affected_customers?.toLocaleString()}</strong> customers.
                                    {summary.recovered_orders > 0 && (
                                        <>
                                            {" "}Of these, <strong className="text-emerald-600">{summary.recovered_orders?.toLocaleString()}</strong> orders
                                            ({summary.recovery_rate}%) were later paid successfully,
                                            recovering <strong className="text-emerald-600">{formatCurrency(summary.recovered_gmv)}</strong>.
                                            {summary.recovery_rate < 30 && (
                                                <span className="text-amber-600"> Low recovery rate suggests users are abandoning rather than retrying — consider payment retry nudges.</span>
                                            )}
                                        </>
                                    )}
                                    {isHighFailure ? (
                                        <span className="text-red-600 font-medium">
                                            {" "}This is above the {FAILURE_ALERT_THRESHOLD}% threshold — investigate payment gateway errors, bank declines, and session timeouts.
                                        </span>
                                    ) : (
                                        <span className="text-emerald-600">
                                            {" "}Payment failure rate is within the acceptable range.
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ═══════ Failure Rate Trend Chart ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-gray-500" />
                        Payment Failure Rate Trend
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 text-sm">Loading chart…</div>
                    ) : trend.length === 0 ? (
                        <div className="h-80 flex items-center justify-center text-gray-400 text-sm">No data available for the selected range</div>
                    ) : (
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="failureGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatDate}
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(v) => `${v}%`}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                    <ReferenceLine
                                        y={FAILURE_ALERT_THRESHOLD}
                                        stroke="#ef4444"
                                        strokeDasharray="6 4"
                                        strokeWidth={1.5}
                                        label={{
                                            value: `${FAILURE_ALERT_THRESHOLD}% threshold`,
                                            position: "insideTopRight",
                                            fill: "#ef4444",
                                            fontSize: 11,
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="failure_rate"
                                        name="Failure Rate (%)"
                                        stroke="#f43f5e"
                                        strokeWidth={2.5}
                                        fill="url(#failureGradient)"
                                        dot={{ r: 3, fill: "#f43f5e", strokeWidth: 0 }}
                                        activeDot={{ r: 5, fill: "#f43f5e", strokeWidth: 2, stroke: "#fff" }}
                                    />
                                    {compare.range && (
                                        <Area
                                            type="monotone"
                                            dataKey="prev_failure_rate"
                                            name="Failure Rate (previous)"
                                            stroke="#94a3b8"
                                            strokeDasharray="5 5"
                                            strokeWidth={2}
                                            fill="transparent"
                                            dot={false}
                                            connectNulls
                                        />
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Volume Chart (Attempts vs Failures) ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-gray-500" />
                        Checkout Attempts vs Failed Payments
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-72 flex items-center justify-center text-gray-400 text-sm">Loading chart…</div>
                    ) : trend.length === 0 ? (
                        <div className="h-72 flex items-center justify-center text-gray-400 text-sm">No data available</div>
                    ) : (
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatDate}
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend
                                        wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                                    />
                                    <Bar dataKey="total_attempts" name="Total Attempts" fill="#6366f1" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="failed_payments" name="Failed Payments" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Failures by Payment Method ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-gray-500" />
                        Failures by Payment Method
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">
                        Per-gateway + per-instrument breakdown of failed and pending payment attempts.
                    </p>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
                    ) : byMethod.length === 0 ? (
                        <div className="py-10 text-center text-gray-400 text-sm">No method data for this range.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Gateway</th>
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Mode</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Attempts</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Failed</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Failure Rate</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Lost GMV</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {byMethod.map((row) => {
                                        const isHigh = row.failure_rate > FAILURE_ALERT_THRESHOLD
                                        return (
                                            <tr key={`${row.provider}-${row.payment_mode}`} className="border-b border-gray-50 hover:bg-gray-50/80">
                                                <td className="py-3 px-4 font-medium text-gray-700 capitalize">{row.provider}</td>
                                                <td className="py-3 px-4 text-gray-600">{row.payment_mode}</td>
                                                <td className="py-3 px-4 text-right text-gray-600">{row.attempts?.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-right text-rose-600 font-medium">{row.failed?.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        isHigh ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                                                    }`}>
                                                        {row.failure_rate}%
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right text-amber-600 font-medium">{formatCurrency(row.lost_gmv)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Failures by Reason ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-gray-500" />
                        Failures by Reason
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">
                        Root-cause distribution from the payment gateway error codes (FAILED + PENDING).
                    </p>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
                    ) : byReason.length === 0 ? (
                        <div className="py-10 text-center text-gray-400 text-sm">No reason data for this range.</div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Chart */}
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={byReason.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                        <YAxis
                                            type="category"
                                            dataKey="error_code"
                                            tick={{ fontSize: 11, fill: "#6b7280" }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={140}
                                            tickFormatter={(v: string) => reasonLabel(v).slice(0, 22)}
                                        />
                                        <Tooltip
                                            formatter={(value: any, _name: any, props: any) => [
                                                `${value?.toLocaleString()} failures (${props.payload.share_pct}%)`,
                                                reasonLabel(props.payload.error_code),
                                            ]}
                                        />
                                        <Bar dataKey="failed" fill="#f43f5e" radius={[0, 3, 3, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Reason</th>
                                            <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Failed</th>
                                            <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Share</th>
                                            <th className="text-right py-3 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Lost GMV</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {byReason.map((row) => (
                                            <tr key={row.error_code} className="border-b border-gray-50 hover:bg-gray-50/80">
                                                <td className="py-2.5 px-3 text-gray-700">
                                                    <div className="font-medium leading-tight">{reasonLabel(row.error_code)}</div>
                                                    <div className="text-[10px] uppercase text-gray-400 tracking-wider">{row.error_code}</div>
                                                </td>
                                                <td className="py-2.5 px-3 text-right text-rose-600 font-medium">{row.failed?.toLocaleString()}</td>
                                                <td className="py-2.5 px-3 text-right text-gray-600">{row.share_pct}%</td>
                                                <td className="py-2.5 px-3 text-right text-amber-600">{formatCurrency(row.lost_gmv)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════ Daily Breakdown Table ═══════ */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-gray-500" />
                        Daily Breakdown
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
                    ) : trend.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">No data available</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Date</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Attempts</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Failed</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Failure Rate</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Lost GMV</th>
                                        <th className="text-right py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Customers</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...trend].reverse().map((row) => {
                                        const isHigh = row.failure_rate > FAILURE_ALERT_THRESHOLD
                                        return (
                                            <tr
                                                key={row.date}
                                                className={`border-b border-gray-50 transition-colors hover:bg-gray-50/80 ${
                                                    isHigh ? "bg-red-50/30" : ""
                                                }`}
                                            >
                                                <td className="py-3 px-4 font-medium text-gray-700">
                                                    {formatDate(row.date)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-gray-600">
                                                    {row.total_attempts?.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right text-rose-600 font-medium">
                                                    {row.failed_payments?.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                        isHigh
                                                            ? "bg-red-100 text-red-700"
                                                            : "bg-emerald-100 text-emerald-700"
                                                    }`}>
                                                        {isHigh
                                                            ? <ArrowUpRight className="h-3 w-3" />
                                                            : <ArrowDownRight className="h-3 w-3" />
                                                        }
                                                        {row.failure_rate}%
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right text-amber-600 font-medium">
                                                    {formatCurrency(row.lost_gmv)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-violet-600">
                                                    {row.affected_customers?.toLocaleString()}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
