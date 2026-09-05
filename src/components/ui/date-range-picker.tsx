"use client"

import { useState, useEffect } from "react"
import { Calendar, ChevronDown, X } from "lucide-react"

interface DateRangePickerProps {
    startDate: string
    endDate: string
    onChange: (start: string, end: string) => void
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [localStart, setLocalStart] = useState(startDate)
    const [localEnd, setLocalEnd] = useState(endDate)

    useEffect(() => {
        setLocalStart(startDate)
        setLocalEnd(endDate)
    }, [startDate, endDate])

    // Today is excluded from all metrics — yesterday is the latest selectable day.
    const yesterdayStr = (() => {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        return d.toISOString().split("T")[0]
    })()

    // Handle presets
    const applyPreset = (days: number) => {
        const end = new Date()
        end.setDate(end.getDate() - 1) // yesterday
        const start = new Date(end)
        start.setDate(end.getDate() - days)

        onChange(
            start.toISOString().split("T")[0],
            end.toISOString().split("T")[0]
        )
        setIsOpen(false)
    }

    const applyYearPreset = () => {
        const end = new Date()
        end.setDate(end.getDate() - 1) // yesterday
        const start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate())

        onChange(
            start.toISOString().split("T")[0],
            end.toISOString().split("T")[0]
        )
        setIsOpen(false)
    }

    const [validationError, setValidationError] = useState("")

    const handleApplyCustom = () => {
        if (!localStart || !localEnd) {
            setValidationError("Please select both start and end dates.")
            return
        }
        if (localStart > localEnd) {
            setValidationError("Start date must be before end date.")
            return
        }
        setValidationError("")
        const safeEnd = localEnd > yesterdayStr ? yesterdayStr : localEnd
        const safeStart = localStart > safeEnd ? safeEnd : localStart
        onChange(safeStart, safeEnd)
        setIsOpen(false)
    }

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 sm:gap-2 bg-white border border-gray-200 rounded-lg px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-rose-500 max-w-full"
            >
                <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="truncate min-w-0">{startDate} to {endDate}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-100 z-50 p-4">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Predefined Ranges</h4>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-0.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                                aria-label="Close date picker"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => applyPreset(7)} className="text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-1.5 font-medium text-gray-700 transition">Last 7 Days</button>
                                <button onClick={() => applyPreset(30)} className="text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-1.5 font-medium text-gray-700 transition">Last 30 Days</button>
                                <button onClick={() => applyPreset(90)} className="text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-1.5 font-medium text-gray-700 transition">Last 90 Days</button>
                                <button onClick={applyYearPreset} className="text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-1.5 font-medium text-gray-700 transition">Last Year</button>
                            </div>
                        </div>

                        <div className="h-px bg-gray-100 w-full" />

                        <div>
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Custom Range</h4>
                            <div className="flex flex-col gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-600 block">Start Date</label>
                                    <input
                                        type="date"
                                        max={yesterdayStr}
                                        className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white text-gray-700 outline-none focus:ring-1 focus:ring-rose-500"
                                        value={localStart}
                                        onChange={e => setLocalStart(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-600 block">End Date</label>
                                    <input
                                        type="date"
                                        max={yesterdayStr}
                                        className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white text-gray-700 outline-none focus:ring-1 focus:ring-rose-500"
                                        value={localEnd}
                                        onChange={e => setLocalEnd(e.target.value)}
                                    />
                                </div>
                                {validationError && (
                                    <p className="text-xs text-red-500 font-medium">{validationError}</p>
                                )}
                                <button
                                    onClick={handleApplyCustom}
                                    className="mt-1 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-md transition border border-emerald-700 shadow-sm"
                                >
                                    Apply Range
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
