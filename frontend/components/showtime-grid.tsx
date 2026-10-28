"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapPin, Clock, Users, TimerOff } from "lucide-react"
import { formatVND } from "@/lib/utils"
import type { Showtime } from "@/lib/api/types"

interface ShowtimeGridProps {
  showtimes: Showtime[]
  selectedDate: string
  selectedCinema: number | null
}

/** Kiểm tra suất chiếu đã bắt đầu chưa */
function isShowtimePast(showDate: string, showTime: string): boolean {
  try {
    const [h, m] = showTime.split(":").map(Number)
    const [y, mo, d] = showDate.split("T")[0].split("-").map(Number)
    const showAt = new Date(y, mo - 1, d, h, m)
    return showAt < new Date()
  } catch { return false }
}

export function ShowtimeGrid({ showtimes, selectedDate, selectedCinema }: ShowtimeGridProps) {
  const filteredShowtimes = showtimes.filter((showtime) => {
    const rawDate = showtime.show_date || ''
    const showDateOnly = rawDate.length >= 10 ? rawDate.slice(0, 10) : rawDate
    const dateMatch = showDateOnly === selectedDate
    const cinemaMatch = selectedCinema === null || showtime.cinema_id === selectedCinema
    return dateMatch && cinemaMatch
  })

  // Group showtimes by cinema
  const showtimesByCinema = filteredShowtimes.reduce(
    (acc, showtime) => {
      const cinemaId = showtime.cinema_id
      if (!acc[cinemaId]) {
        acc[cinemaId] = []
      }
      acc[cinemaId].push(showtime)
      return acc
    },
    {} as Record<number, Showtime[]>,
  )

  if (filteredShowtimes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground mb-4">
          <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Không có suất chiếu nào</p>
          <p className="text-sm">Hãy thử chọn ngày khác hoặc rạp khác</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {Object.entries(showtimesByCinema).map(([cinemaId, cinemaShowtimes]) => {
  const first = cinemaShowtimes[0]
  const cinema = first.cinema || { name: (first as any).cinema_name, location: (first as any).location }
  if (!cinema) return null

        // Sort showtimes by time
        const sortedShowtimes = cinemaShowtimes.sort((a, b) => a.show_time.localeCompare(b.show_time))

        return (
          <Card key={cinemaId} className="overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <MapPin className="h-5 w-5 text-primary" />
                {cinema.name}
              </CardTitle>
              <p className="text-muted-foreground">{cinema.location}</p>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedShowtimes.map((showtime) => {
                  const availPct   = (showtime.available_seats / showtime.total_seats) * 100
                  const isAlmost   = availPct < 20
                  const isFull     = showtime.available_seats === 0
                  const isPast     = isShowtimePast(showtime.show_date, showtime.show_time)
                  const isDisabled = isFull || isPast

                  return (
                    <div
                      key={showtime.id}
                      className={`border rounded-lg p-4 transition-colors ${
                        isPast
                          ? "border-border/40 bg-muted/20 opacity-60"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className={`text-lg font-semibold ${isPast ? "text-muted-foreground" : "text-foreground"}`}>
                            {showtime.show_time.slice(0, 5)}
                          </div>
                          {showtime.room_name && (
                            <div className="text-xs text-muted-foreground mt-1">
                              🎬 {showtime.room_name}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className={`text-base font-bold ${isPast ? "text-muted-foreground" : "text-primary"}`}>
                            {formatVND(showtime.price)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm text-muted-foreground">
                        {isPast ? (
                          <>
                            <TimerOff className="h-4 w-4" />
                            <span>Đã kết thúc</span>
                            <Badge variant="outline" className="text-xs border-muted-foreground/40 text-muted-foreground">
                              Đã qua
                            </Badge>
                          </>
                        ) : (
                          <>
                            <Users className="h-4 w-4" />
                            <span>Còn {showtime.available_seats} ghế</span>
                            {isAlmost && !isFull && (
                              <Badge variant="destructive" className="text-xs">Sắp đầy</Badge>
                            )}
                            {isFull && (
                              <Badge variant="destructive" className="text-xs">Hết chỗ</Badge>
                            )}
                          </>
                        )}
                      </div>

                      {isPast ? (
                        <Button className="w-full" disabled size="sm" variant="outline">
                          <TimerOff className="w-3 h-3 mr-1" /> Không còn đặt được
                        </Button>
                      ) : (
                        <Button asChild className="w-full" disabled={isFull} size="sm">
                          <Link href={`/booking/${showtime.id}`}>{isFull ? "Hết chỗ" : "Chọn ghế"}</Link>
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
