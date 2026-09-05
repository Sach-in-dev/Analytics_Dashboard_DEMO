import { useState, useEffect } from "react"

const STORAGE_KEY = "global_date_range"

// All dashboards exclude today's (partial) data — the latest available day
// is always yesterday. Defaults and storage reload honour this.
const getPastDate = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().split("T")[0]
}

const yesterdayStr = () => getPastDate(1)

const loadFromStorage = (): { start: string; end: string } => {
    const defaultRange = { start: getPastDate(31), end: yesterdayStr() }
    if (typeof window === "undefined") {
        return defaultRange
    }
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed.start && parsed.end) {
                // Clamp persisted end to yesterday to honour the "no today" policy.
                if (parsed.end > yesterdayStr()) parsed.end = yesterdayStr()
                if (parsed.start > parsed.end) parsed.start = parsed.end
                return parsed
            }
        }
    } catch {
        // ignore
    }
    return defaultRange
}

const saveToStorage = (start: string, end: string) => {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ start, end }))
    } catch {
        // ignore
    }
}

export function useDateRange(): [string, string, (start: string, end: string) => void] {
    const [startDate, setStartDate] = useState(() => loadFromStorage().start)
    const [endDate, setEndDate] = useState(() => loadFromStorage().end)

    useEffect(() => {
        const syncDates = () => {
            const stored = loadFromStorage()
            if (stored.start !== startDate || stored.end !== endDate) {
                setStartDate(stored.start)
                setEndDate(stored.end)
            }
        }

        syncDates()

        window.addEventListener("global-date-range-changed", syncDates)
        return () => window.removeEventListener("global-date-range-changed", syncDates)
    }, [startDate, endDate])

    const setDates = (start: string, end: string) => {
        saveToStorage(start, end)
        setStartDate(start)
        setEndDate(end)
        
        if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("global-date-range-changed"))
        }
    }

    return [startDate, endDate, setDates]
}
