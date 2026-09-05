import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function getLastMonthRange() {
  const now = new Date()

  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  return {
    startAt: start.getTime(),
    endAt: end.getTime(),
  }
}

export function getUtcYesterday(): string {
  const now = new Date()

  // Get UTC midnight today
  const utcToday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    )
  )

  // Subtract 1 day
  utcToday.setUTCDate(utcToday.getUTCDate() - 1)

  // Format YYYY-MM-DD
  return utcToday.toISOString().slice(0, 10)
}
