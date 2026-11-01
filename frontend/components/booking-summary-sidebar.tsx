"use client"

import Image from "next/image"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Clock, Calendar, MapPin, Armchair } from "lucide-react"
import { cn } from "@/lib/utils"

interface BookingData {
  movie: {
    id: number
    title: string
    poster_url: string
    duration: number
  }
  showtime: {
    id: number
    date: string
    time: string
  }
  cinema: {
    name: string
    location: string
  }
  seats: Array<{
    id: string
    row: string
    number: number
    price: number
  }>
  combos?: Array<{
    id: number
    name: string
    price: number
    quantity: number
  }>
}

interface BookingSummarySidebarProps {
  data: BookingData
  className?: string
}

export function BookingSummarySidebar({ data, className }: BookingSummarySidebarProps) {
  const seatsTotal = data.seats.reduce((sum, seat) => sum + seat.price, 0)
  const combosTotal = data.combos?.reduce((sum, combo) => sum + (combo.price * combo.quantity), 0) || 0
  const total = seatsTotal + combosTotal

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })
  }

  return (
    <div className={cn("lg:sticky lg:top-20", className)}>
      <Card className="shadow-lg">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-lg">Thông tin đặt vé</CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4 p-6">
          {/* Movie Info */}
          <div className="flex gap-3">
            <div className="relative w-16 h-24 flex-shrink-0 rounded overflow-hidden">
              <Image
                src={data.movie.poster_url || "/placeholder.svg"}
                alt={data.movie.title}
                fill
                className="object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-foreground truncate">{data.movie.title}</h4>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Clock className="h-3 w-3" />
                <span>{Math.floor(data.movie.duration / 60)}h {data.movie.duration % 60}m</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Cinema & Showtime Info */}
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground">{data.cinema.name}</p>
                <p className="text-muted-foreground text-xs">{data.cinema.location}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{data.showtime.date}</span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{data.showtime.time}</span>
            </div>
          </div>

          <Separator />

          {/* Selected Seats */}
          {data.seats.length > 0 && (
            <>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Armchair className="h-4 w-4 text-muted-foreground" />
                  <h5 className="font-medium text-sm">Ghế đã chọn ({data.seats.length})</h5>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.seats.map((seat) => (
                    <Badge key={seat.id} variant="secondary" className="font-mono">
                      {seat.row}{seat.number}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {formatCurrency(seatsTotal)}
                </p>
              </div>

              <Separator />
            </>
          )}

          {/* Combo Items */}
          {data.combos && data.combos.length > 0 && (
            <>
              <div>
                <h5 className="font-medium text-sm mb-3">Combo đồ ăn</h5>
                <div className="space-y-2">
                  {data.combos.map((combo) => (
                    <div key={combo.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {combo.name} <span className="text-xs">x{combo.quantity}</span>
                      </span>
                      <span className="font-medium">{formatCurrency(combo.price * combo.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />
            </>
          )}

          {/* Total */}
          <div className="space-y-2 pt-2">
            {data.seats.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tiền vé</span>
                <span>{formatCurrency(seatsTotal)}</span>
              </div>
            )}
            {combosTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Combo</span>
                <span>{formatCurrency(combosTotal)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Tổng cộng</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Note */}
          {data.seats.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              💡 Ghế sẽ được giữ trong 15 phút. Vui lòng hoàn tất thanh toán trước khi hết thời gian.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
