import { useEffect, useMemo, useState } from "react"

/**
 * Shared compare-period state used by metric dashboards.
 *
 *   off       — no comparison; KPIs and charts show only the current period.
 *   standard  — Previous Period (PoP): immediately-preceding window of identical length.
 *   dod       — Day over Day: same window shifted back 1 day.
 *   wow       — Week over Week: same window shifted back 7 days.
 *   mom       — Month over Month: same window shifted back 1 calendar month.
 *   qoq       — Quarter over Quarter: same window shifted back 3 calendar months.
 *   yoy       — Year over Year / Same Period Last Year: shifted back 1 calendar year.
 *   p7d/p30d/p90d — fixed 7/30/90-day block immediately before the current start
 *                   (7D vs P7D / R7D families).
 *   ttm       — Trailing/Last Twelve Months: the 12 months before the current start.
 *   custom    — user-picked start/end (defaults to standard suggestion).
 *
 * The selected current window drives every comparison, so a to-date selection
 * automatically yields the matching prior to-date window (YTD→PYTD, MTD→PMTD, …).
 * Today's data is excluded application-wide, so all suggestions cap at yesterday.
 */
export type CompareMode =
    | "off"
    | "standard"
    | "dod"
    | "wow"
    | "mom"
    | "qoq"
    | "yoy"
    | "p7d"
    | "p30d"
    | "p90d"
    | "ttm"
    | "custom"

export const addDays = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00")
    d.setDate(d.getDate() + n)
    // Format from LOCAL calendar parts — timezone-safe. Using toISOString() here
    // rolled the date back a day in non-UTC browsers (e.g. IST), which made the
    // "Compared to" start/end display the wrong dates for standard/custom windows.
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

/** Format a Date from its LOCAL Y-M-D parts — timezone-safe, avoiding the
 * UTC rollover that toISOString() causes in non-UTC browsers (e.g. IST). */
const toLocalISO = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

/** Shift an ISO date by n days (timezone-safe). */
export const shiftDays = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00")
    d.setDate(d.getDate() + n)
    return toLocalISO(d)
}

/** Shift an ISO date by n calendar months, clamping to the last valid day (timezone-safe). */
export const addMonths = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00")
    const targetDay = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + n)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(targetDay, lastDay))
    return toLocalISO(d)
}

export const daysBetween = (a: string, b: string) => {
    const da = new Date(a + "T00:00:00")
    const db = new Date(b + "T00:00:00")
    return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

/** Compute the compare (previous) window for a given mode + current window. */
export const computeCompareRange = (
    mode: CompareMode,
    currentStart: string,
    currentEnd: string,
    customStart = "",
    customEnd = "",
): CompareRange | null => {
    switch (mode) {
        case "off":
            return null
        case "custom":
            return customStart && customEnd ? { start: customStart, end: customEnd } : null
        case "standard": {
            const span = daysBetween(currentStart, currentEnd)
            const end = addDays(currentStart, -1)
            const start = addDays(end, -span)
            return { start, end }
        }
        case "dod":
            return { start: shiftDays(currentStart, -1), end: shiftDays(currentEnd, -1) }
        case "wow":
            return { start: shiftDays(currentStart, -7), end: shiftDays(currentEnd, -7) }
        case "mom":
            return { start: addMonths(currentStart, -1), end: addMonths(currentEnd, -1) }
        case "qoq":
            return { start: addMonths(currentStart, -3), end: addMonths(currentEnd, -3) }
        case "yoy":
            return { start: addMonths(currentStart, -12), end: addMonths(currentEnd, -12) }
        // Rolling-period comparisons — the fixed-length block immediately
        // preceding the current window's start. Pair with a matching current
        // selection to get "latest N vs previous N" (7D vs P7D, R7D, …).
        case "p7d":
            return { start: shiftDays(currentStart, -7), end: shiftDays(currentStart, -1) }
        case "p30d":
            return { start: shiftDays(currentStart, -30), end: shiftDays(currentStart, -1) }
        case "p90d":
            return { start: shiftDays(currentStart, -90), end: shiftDays(currentStart, -1) }
        case "ttm":
            return { start: addMonths(currentStart, -12), end: shiftDays(currentStart, -1) }
        default:
            return null
    }
}

/** Natural period-to-date window (period start → yesterday) for the
 * period-granularity modes. Used to "snap" the current window when the user
 * picks Day/Week/Month/Quarter/Year, so the comparison is period-to-date vs
 * the prior equivalent (e.g. MTD→PMTD, YTD→PYTD). Returns null for every
 * other mode (they leave the current window untouched). */
export const periodToDate = (mode: CompareMode): CompareRange | null => {
    const y = new Date()
    y.setDate(y.getDate() - 1) // yesterday — latest available day (today is excluded app-wide)
    const end = toLocalISO(y)
    const yr = y.getFullYear()
    const mo = y.getMonth()
    switch (mode) {
        case "dod":
            return { start: end, end } // the single latest day
        case "wow": {
            const dow = (y.getDay() + 6) % 7 // Mon=0 … Sun=6 (ISO week start)
            const s = new Date(y)
            s.setDate(y.getDate() - dow)
            return { start: toLocalISO(s), end }
        }
        case "mom":
            return { start: toLocalISO(new Date(yr, mo, 1)), end }
        case "qoq":
            return { start: toLocalISO(new Date(yr, Math.floor(mo / 3) * 3, 1)), end }
        case "yoy":
            return { start: toLocalISO(new Date(yr, 0, 1)), end }
        // Rolling modes snap to the latest N days / 12 months ending yesterday,
        // so the compare window lands on the immediately-preceding equal block.
        case "p7d":
        case "p30d":
        case "p90d": {
            const n = mode === "p7d" ? 7 : mode === "p30d" ? 30 : 90
            const s = new Date(y)
            s.setDate(y.getDate() - (n - 1))
            return { start: toLocalISO(s), end }
        }
        case "ttm": {
            const s = new Date(y)
            s.setFullYear(y.getFullYear() - 1)
            s.setDate(s.getDate() + 1)
            return { start: toLocalISO(s), end }
        }
        default:
            return null
    }
}

/** UI metadata for each comparison mode — labels reused by the control + banner. */
export const COMPARE_MODE_META: Record<
    CompareMode,
    { short: string; button: string; hint: string }
> = {
    off:      { short: "Off",             button: "Compare",            hint: "No comparison" },
    standard: { short: "Prev Period",     button: "vs Previous Period", hint: "Preceding period, same length (PoP)" },
    dod:      { short: "Day (DoD)",       button: "vs Prev Day",        hint: "Same window, 1 day earlier (DoD)" },
    wow:      { short: "Week (WoW)",      button: "vs Prev Week",       hint: "Same window, 1 week earlier (WoW)" },
    mom:      { short: "Month (MoM)",     button: "vs Prev Month",      hint: "Same window, 1 month earlier (MoM)" },
    qoq:      { short: "Quarter (QoQ)",   button: "vs Prev Quarter",    hint: "Same window, 1 quarter earlier (QoQ)" },
    yoy:      { short: "Year (YoY)",      button: "vs Last Year",       hint: "Same period last year (YoY / SPLY)" },
    p7d:      { short: "7D vs P7D",       button: "vs Prev 7 Days",     hint: "Previous 7 days (7D vs P7D / R7D)" },
    p30d:     { short: "30D vs P30D",     button: "vs Prev 30 Days",    hint: "Previous 30 days (30D vs P30D / R30D)" },
    p90d:     { short: "90D vs P90D",     button: "vs Prev 90 Days",    hint: "Previous 90 days (90D vs P90D / R90D)" },
    ttm:      { short: "TTM / LTM",       button: "vs Prev 12 Months",  hint: "Previous 12 months (TTM / LTM)" },
    custom:   { short: "Custom",          button: "vs Custom",          hint: "User-picked window" },
}

export const pctChange = (a: number, b: number) =>
    b === 0 ? 0 : +(((a - b) / b) * 100).toFixed(1)

export interface CompareRange { start: string; end: string }

export interface CompareState {
    mode: CompareMode
    setMode: (m: CompareMode) => void
    customStart: string
    customEnd: string
    setCustom: (s: string, e: string) => void
    /** The effective compare window (null when mode === "off"). */
    range: CompareRange | null
}

const STORAGE_KEY = "global_compare_range"

const loadFromStorage = (): { mode: CompareMode; customStart: string; customEnd: string } => {
    const defaultState = { mode: "off" as CompareMode, customStart: "", customEnd: "" }
    if (typeof window === "undefined") {
        return defaultState
    }
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed.mode) {
                return { ...defaultState, ...parsed }
            }
        }
    } catch {
        // ignore
    }
    return defaultState
}

const saveToStorage = (state: { mode: CompareMode; customStart: string; customEnd: string }) => {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
        // ignore
    }
}

export function useCompareRange(currentStart: string, currentEnd: string): CompareState {
    const [mode, setModeState] = useState<CompareMode>(() => loadFromStorage().mode)
    const [customStart, setCustomStartState] = useState(() => loadFromStorage().customStart)
    const [customEnd, setCustomEndState] = useState(() => loadFromStorage().customEnd)

    useEffect(() => {
        const syncState = () => {
            const stored = loadFromStorage()
            if (stored.mode !== mode || stored.customStart !== customStart || stored.customEnd !== customEnd) {
                setModeState(stored.mode)
                setCustomStartState(stored.customStart)
                setCustomEndState(stored.customEnd)
            }
        }

        syncState()

        window.addEventListener("global-compare-range-changed", syncState)
        return () => window.removeEventListener("global-compare-range-changed", syncState)
    }, [mode, customStart, customEnd])

    const setMode = (m: CompareMode) => {
        saveToStorage({ mode: m, customStart, customEnd })
        setModeState(m)
        // Period-granularity modes (Day/Week/Month/Quarter/Year) snap the current
        // (predefined) window to the matching period-to-date, written to the shared
        // date-range store so every page updates with no per-page wiring. The
        // recomputed compare window then lands on the prior equivalent (PMTD, PYTD…).
        // Keys/event mirror use-date-range.ts. Other modes leave the window as-is.
        const snap = periodToDate(m)
        if (snap && typeof window !== "undefined") {
            try {
                localStorage.setItem("global_date_range", JSON.stringify(snap))
            } catch {
                // ignore
            }
            window.dispatchEvent(new Event("global-date-range-changed"))
        }
        if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("global-compare-range-changed"))
        }
    }

    const setCustom = (s: string, e: string) => {
        saveToStorage({ mode, customStart: s, customEnd: e })
        setCustomStartState(s)
        setCustomEndState(e)
        if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("global-compare-range-changed"))
        }
    }

    const range = useMemo<CompareRange | null>(
        () => computeCompareRange(mode, currentStart, currentEnd, customStart, customEnd),
        [mode, currentStart, currentEnd, customStart, customEnd],
    )

    // When the user picks Custom for the first time, pre-fill with the
    // standard suggestion so the fetch fires without manual input.
    useEffect(() => {
        if (mode === "custom" && !customStart && !customEnd) {
            const span = daysBetween(currentStart, currentEnd)
            const end = addDays(currentStart, -1)
            const start = addDays(end, -span)
            setCustom(start, end)
        }
    }, [mode, currentStart, currentEnd, customStart, customEnd])

    return {
        mode,
        setMode,
        customStart,
        customEnd,
        setCustom,
        range,
    }
}
