"use client"

import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { MapPin, Clock, Calendar, Users, Ticket, Armchair, Loader2, QrCode } from "lucide-react"
import type { Showtime, Seat } from "@/lib/api/types"

/** Màu nhãn loại phòng — mỗi loại một sắc riêng, không đụng màu hạng ghế. */
const NHAN_LOAI_PHONG: Record<string, string> = {
  standard: "border-border bg-secondary text-secondary-foreground",
  vip: "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  imax: "border-indigo-500/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "4dx": "border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300",
}

/** Tên hiển thị — "standard" đọc không ra nghĩa với khách Việt. */
const NHAN_CHU: Record<string, string> = {
  standard: "Thường",
  vip: "VIP",
  imax: "IMAX",
  "4dx": "4DX",
}

interface ComboItem {
  id: number
  name: string
  price: number
  quantity: number
}

interface BookingSummaryProps {
  showtime: Showtime
  selectedSeats: Seat[]
  onProceedToPayment: () => void
  combos?: ComboItem[]
  loading?: boolean
  isPaymentPage?: boolean
}

export function BookingSummary({ 
  showtime, 
  selectedSeats, 
  onProceedToPayment, 
  combos = [], 
  loading = false,
  isPaymentPage = false 
}: BookingSummaryProps) {
  const seatsTotal = selectedSeats.reduce((sum, seat) => sum + seat.price, 0)
  const combosTotal = combos.reduce((sum, combo) => sum + (combo.price * combo.quantity), 0)
  const total = seatsTotal + combosTotal

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number)
    const dt = new Date(year, month - 1, day)
    const WD = ["Chủ nhật","Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy"]
    return `${WD[dt.getDay()]}, ${day} tháng ${month} năm ${year}`
  }

  const formatTime = (timeString: string) => {
    // HH:MM:SS format from database
    const [hours, minutes] = timeString.split(':')
    return `${hours}:${minutes}`
  }

  return (
    <Card className="lg:sticky lg:top-20 shadow-lg">
      <CardHeader className="bg-muted/50">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ticket className="h-5 w-5 text-primary" />
          Thông tin đặt vé
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        {/* Movie Info with Poster */}
        <div className="flex gap-3">
          <div className="relative w-16 h-24 flex-shrink-0 rounded overflow-hidden">
            <Image
              src={showtime.movie?.poster_url || "/placeholder.svg"}
              alt={showtime.movie?.title || "Movie"}
              fill
              className="object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{showtime.movie?.title}</h3>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">{showtime.movie?.rating}</Badge>
              <span className="text-xs text-muted-foreground truncate">{showtime.movie?.genre}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Cinema & Showtime Info */}
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">{showtime.cinema?.name}</p>
              {showtime.room_name && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>🎬 {showtime.room_name}</span>
                  {/* Loại phòng quyết định GIÁ VÉ (thường ×1,0 · VIP ×1,25 ·
                      IMAX ×1,6 · 4DX ×1,75) nhưng trước đây không hiện ở đâu
                      cả — khách thấy giá chênh mà không hiểu vì sao. */}
                  {showtime.room_type && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${NHAN_LOAI_PHONG[String(showtime.room_type).toLowerCase()] ?? NHAN_LOAI_PHONG.standard}`}>
                      {NHAN_CHU[String(showtime.room_type).toLowerCase()] ?? showtime.room_type}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">{formatDate(showtime.show_date)}</span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">{formatTime(showtime.show_time)}</span>
          </div>
        </div>

        <Separator />

        {/* Selected Seats */}
        {selectedSeats.length > 0 && (
          <>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Armchair className="h-4 w-4 text-muted-foreground" />
                <h5 className="font-medium text-sm">Ghế đã chọn ({selectedSeats.length})</h5>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedSeats.map((seat) => (
                  <Badge key={seat.id} variant="secondary" className="font-mono">
                    {seat.row}{seat.number}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {seatsTotal.toLocaleString("vi-VN", { style: "currency", currency: "VND" })}
              </p>
            </div>

            <Separator />
          </>
        )}

        {/* Combo Items */}
        {combos.length > 0 && (
          <>
            <div>
              <h5 className="font-medium text-sm mb-3">Combo đồ ăn</h5>
              <div className="space-y-2">
                {combos.map((combo) => (
                  <div key={combo.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {combo.name} <span className="text-xs">x{combo.quantity}</span>
                    </span>
                    <span className="font-medium">{(combo.price * combo.quantity).toLocaleString("vi-VN", { style: "currency", currency: "VND" })}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />
          </>
        )}

        {/* Price Breakdown */}
        {selectedSeats.length > 0 && (
          <>
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tiền vé</span>
                <span>{seatsTotal.toLocaleString("vi-VN", { style: "currency", currency: "VND" })}</span>
              </div>

              {combosTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Combo</span>
                  <span>{combosTotal.toLocaleString("vi-VN", { style: "currency", currency: "VND" })}</span>
                </div>
              )}

              <Separator />

              <div className="flex justify-between items-center text-lg font-bold">
                <span>Tổng cộng</span>
                <span className="text-primary">{total.toLocaleString("vi-VN", { style: "currency", currency: "VND" })}</span>
              </div>
            </div>

            {/* Note */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              💡 Ghế sẽ được giữ trong 15 phút. Vui lòng hoàn tất thanh toán trước khi hết thời gian.
            </div>

            <Button 
              onClick={onProceedToPayment} 
              className="w-full" 
              size="lg"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang xử lý...
                </>
              ) : isPaymentPage ? (
                <>
                  <QrCode className="w-4 h-4 mr-2" />
                  Thanh toán {total.toLocaleString("vi-VN", { style: 'currency', currency: 'VND' })}
                </>
              ) : (
                "Tiến hành thanh toán"
              )}
            </Button>

            {isPaymentPage && (
              <p className="text-xs text-center text-muted-foreground">
                Bằng việc thanh toán, bạn đồng ý với điều khoản sử dụng
              </p>
            )}
          </>
        )}

        {/* Empty State */}
        {selectedSeats.length === 0 && (
          <div className="text-center py-6">
            <Armchair className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground mb-4">Vui lòng chọn ghế để tiếp tục</p>
            <Button disabled className="w-full" size="lg">
              Tiến hành thanh toán
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
