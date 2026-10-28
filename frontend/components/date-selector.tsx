"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface DateSelectorProps {
  selectedDate: string
  onDateChange: (date: string) => void
}

export function DateSelector({ selectedDate, onDateChange }: DateSelectorProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date())

  const generateWeekDates = (startDate: Date) => {
    const dates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  const weekDates = generateWeekDates(currentWeekStart)

  const goToPreviousWeek = () => {
    const newStart = new Date(currentWeekStart)
    newStart.setDate(currentWeekStart.getDate() - 7)
    setCurrentWeekStart(newStart)
  }

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart)
    newStart.setDate(currentWeekStart.getDate() + 7)
    setCurrentWeekStart(newStart)
  }

  // Use local timezone parts to avoid UTC mismatch (e.g. Vietnam is UTC+7)
  const formatDate = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  // Dùng formatter thủ công để tránh hydration mismatch giữa Node.js và Chrome
  const VN_WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]

  const formatDisplayDate = (date: Date) => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)

    if (date.toDateString() === today.toDateString()) return "Hôm nay"
    if (date.toDateString() === tomorrow.toDateString()) return "Ngày mai"

    const wd = VN_WEEKDAYS[date.getDay()]
    const d = date.getDate()
    const m = date.getMonth() + 1
    return `${wd}, ${d} thg ${m}`
  }

  return (
    <div className="flex items-center gap-4 py-6">
      <Button variant="ghost" size="sm" onClick={goToPreviousWeek} className="shrink-0" aria-label="Tuần trước">
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {weekDates.map((date) => {
          const dateString = formatDate(date)
          const isSelected = dateString === selectedDate
          const isPast = date < new Date(new Date().setHours(0, 0, 0, 0))

          return (
            <Button
              key={dateString}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              onClick={() => onDateChange(dateString)}
              disabled={isPast}
              className={`shrink-0 min-w-[100px] ${
                isSelected ? "bg-primary text-primary-foreground" : "hover:border-primary/50"
              } ${isPast ? "opacity-50" : ""}`}
            >
              <div className="text-center">
                <div className="text-sm font-medium">{formatDisplayDate(date)}</div>
                <div className="text-xs opacity-75">{date.getDate()}</div>
              </div>
            </Button>
          )
        })}
      </div>

      <Button variant="ghost" size="sm" onClick={goToNextWeek} className="shrink-0" aria-label="Tuần sau">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
