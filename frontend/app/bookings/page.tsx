"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Header } from "@/components/header"
import { TicketQRCode } from "@/components/ticket-qr-code"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Calendar, Clock, MapPin, Users, Ticket, Download } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { formatVND } from "@/lib/utils"
import { getMyTickets, cancelMyTicket } from "@/lib/api/tickets"

export const dynamic = "force-dynamic"

interface BookingRecord {
  id: number
  bookingReference: string
  movieTitle: string
  posterUrl: string | null
  cinemaName: string
  cinemaLocation: string
  showDate: string
  showTime: string
  seats: Array<{ id: string; row: string; number: number; price: number }>
  comboItems: Array<{ combo_id: number; name: string; quantity: number; price: number }>
  totalAmount: number
  seatsTotal: number
  comboTotal: number
  discountAmount: number
  voucherCode: string | null
  timestamp: string
  paymentStatus: string
  paymentMethod: string | null
  paidAt: string | null
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: "Đã thanh toán",
  pending: "Chờ thanh toán",
  failed: "Thanh toán thất bại",
}

export default function BookingsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    // Chờ AuthProvider xác minh xong token trước khi quyết định — nếu không,
    // user vẫn đang null lúc đầu (chưa kịp đọc xong sessionStorage) sẽ bị
    // đá về /login dù thực ra đã đăng nhập.
    if (authLoading) return

    const fetchBookings = async () => {
      if (!user) {
        router.push("/login")
        return
      }
      try {
        const tickets = await getMyTickets()
        if (Array.isArray(tickets)) {
          const mapped = tickets.map((t: any) => ({
            id: t.id,
            bookingReference: t.booking_reference,
            movieTitle: t.movie_title,
            posterUrl: t.poster_url || null,
            cinemaName: t.cinema_name,
            cinemaLocation: t.location || t.cinema_location || "",
            showDate: t.show_date,
            showTime: t.show_time,
            seats: (typeof t.seats === "string" ? JSON.parse(t.seats) : t.seats).map((s: any, idx: number) => ({
              id: `${t.id}-${idx}`,
              row: typeof s === "string" ? s.replace(/\d+/g, "") : s.row || "",
              number: typeof s === "string" ? Number(s.replace(/\D+/g, "")) : s.number || 0,
              price: 0,
            })),
            comboItems: t.combo_items ? (typeof t.combo_items === "string" ? JSON.parse(t.combo_items) : t.combo_items) : [],
            totalAmount: Number(t.total_amount),
            seatsTotal: Number(t.seats_total || 0),
            comboTotal: Number(t.combo_total || 0),
            discountAmount: Number(t.discount_amount || 0),
            voucherCode: t.voucher_code || null,
            timestamp: t.created_at,
            paymentStatus: t.payment_status || "pending",
            paymentMethod: t.payment_method || null,
            paidAt: t.paid_at || null,
          }))
          setBookings(mapped)
        } else {
          setBookings([])
        }
      } catch (e) {
        console.error("Failed to fetch bookings:", e)
        setBookings([])
      }
    }

    fetchBookings()
  }, [user, authLoading, router])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const formatTime = (timeString: string) => {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const downloadTicket = (booking: BookingRecord) => {
    const seatsLabel = booking.seats.map((s) => `${s.row}${s.number}`).join(", ")
    const ticketText = `
===========================================
         CINEMA BOOKING TICKET
===========================================

Booking Reference: ${booking.bookingReference}
Movie: ${booking.movieTitle}
Cinema: ${booking.cinemaName}
Address: ${booking.cinemaLocation}
Showtime: ${formatDate(booking.showDate)} ${formatTime(booking.showTime)}

Seats: ${seatsLabel}
${booking.comboItems && booking.comboItems.length > 0 ? `
Combos:
${booking.comboItems.map((c) => `  - ${c.name} x${c.quantity}: ${formatVND((Number(c.price) || 0) * (Number(c.quantity) || 1))}`).join("\n")}
` : ""}
TOTAL: ${formatVND(booking.totalAmount)}
Payment Status: ${(PAYMENT_STATUS_LABEL[booking.paymentStatus] || booking.paymentStatus).toUpperCase()}

===========================================
    Thank you for choosing our cinema!
===========================================
    `
    const blob = new Blob([ticketText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ticket-${booking.bookingReference}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Vé của tôi</h1>
            <p className="text-muted-foreground">Xem và quản lý các vé phim đã đặt</p>
          </div>

          {/* Bookings List */}
          {bookings.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Ticket className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Chưa có vé nào</h3>
                <p className="text-muted-foreground mb-4">Bạn chưa đặt vé nào</p>
                <Button asChild>
                  <a href="/">Xem phim</a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {bookings.map((booking) => (
                <Card key={booking.bookingReference} className="overflow-hidden p-0">
                  {/* Một dòng gọn: poster nhỏ, tên phim, rạp, giờ, ghế, tiền.
                      Bấm vào mới mở chi tiết + mã QR — trước đây mọi vé đều bung
                      hết, cuộn mãi mới tới vé thứ hai. */}
                  <button
                    type="button"
                    onClick={() => setExpandedId((prev) => (prev === booking.id ? null : booking.id))}
                    className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-muted/40 sm:gap-4 sm:p-4"
                    aria-expanded={expandedId === booking.id}
                  >
                    <div className="relative h-[84px] w-[58px] flex-none overflow-hidden rounded-md border bg-muted sm:h-[96px] sm:w-[66px]">
                      {/* next/image: poster gốc nặng tới ~600KB, qua đây được
                          nén WebP và cắt đúng kích thước hiển thị. Dùng thẻ
                          <img> thuần sẽ tải nguyên ảnh gốc cho MỖI vé. */}
                      {booking.posterUrl ? (
                        <Image
                          src={booking.posterUrl}
                          alt={booking.movieTitle}
                          fill
                          sizes="66px"
                          className="object-cover"
                        />
                      ) : null}
                      <div className="absolute inset-0 -z-10 flex items-center justify-center">
                        <Ticket className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-base font-semibold sm:text-lg">{booking.movieTitle}</span>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {booking.bookingReference}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {booking.cinemaName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {booking.showTime?.slice(0, 5)} · {booking.showDate} · {booking.seats.length} ghế
                        {booking.seats.length > 0 && (
                          <span className="opacity-70">
                            {" "}({booking.seats.map((x) => `${x.row}${x.number}`).join(", ")})
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-none flex-col items-end gap-1">
                      <span className="text-base font-semibold text-primary sm:text-lg">
                        {formatVND(booking.totalAmount)}
                      </span>
                      <Badge
                        variant={booking.paymentStatus === "paid" ? "default" : "secondary"}
                        className={booking.paymentStatus === "paid" ? "bg-green-500 text-[10px]" : "text-[10px]"}
                      >
                        {booking.paymentStatus === "paid" ? "Đã thanh toán"
                          : booking.paymentStatus === "refunded" ? "Đã hoàn tiền"
                          : "Chờ thanh toán"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {expandedId === booking.id ? "Thu gọn ▲" : "Xem vé ▼"}
                      </span>
                    </div>
                  </button>

                  {expandedId === booking.id && (
                  <CardContent className="space-y-6 border-t pt-5">
                    {/* Booking Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <div>
                            <p className="font-medium text-foreground">{booking.cinemaName}</p>
                            <p className="text-sm">{booking.cinemaLocation}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDate(booking.showDate)}</span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{formatTime(booking.showTime)}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Ghế ngồi ({booking.seats.length})</span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {booking.seats.map((seat) => (
                            <Badge key={seat.id} variant="outline">
                              {seat.row}
                              {seat.number}
                            </Badge>
                          ))}
                        </div>

                        {booking.comboItems && booking.comboItems.length > 0 && (
                          <div className="mt-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="h-4 w-4 text-muted-foreground">🍿</span>
                              <span className="font-medium">Combo đồ ăn</span>
                            </div>
                            <div className="space-y-1">
                              {booking.comboItems.map((combo: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-sm">
                                  <span>{combo.name || combo.combo_name || 'Combo'} x{combo.quantity || 1}</span>
                                  <span className="text-muted-foreground">
                                    {formatVND((Number(combo.price) || 0) * (Number(combo.quantity) || 1))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="text-right mt-4">
                          {booking.seatsTotal > 0 && (
                            <p className="text-sm text-muted-foreground">Ghế: {formatVND(booking.seatsTotal)}</p>
                          )}
                          {booking.comboTotal > 0 && (
                            <p className="text-sm text-muted-foreground">Combo: {formatVND(booking.comboTotal)}</p>
                          )}
                          {booking.discountAmount > 0 && (
                            <p className="text-sm text-green-600">
                              Giảm giá{booking.voucherCode ? ` (${booking.voucherCode})` : ""}: -{formatVND(booking.discountAmount)}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground mt-1">Tổng cộng</p>
                          <p className="text-lg font-semibold text-primary">{formatVND(booking.totalAmount)}</p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* QR Code */}
                    <div className="flex justify-center">
                      <TicketQRCode
                        ticketId={booking.id}
                        bookingCode={booking.bookingReference}
                        movieTitle={booking.movieTitle}
                        showDate={booking.showDate}
                        showTime={booking.showTime}
                        seats={booking.seats.map(s => `${s.row}${s.number}`).join(", ")}
                        cinema={booking.cinemaName}
                      />
                    </div>

                    {expandedId === booking.id && (
                      <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trạng thái thanh toán</span>
                          <span className="font-medium">{PAYMENT_STATUS_LABEL[booking.paymentStatus] || booking.paymentStatus}</span>
                        </div>
                        {booking.paymentMethod && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Phương thức</span>
                            <span className="font-medium uppercase">{booking.paymentMethod}</span>
                          </div>
                        )}
                        {booking.paidAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Thời gian thanh toán</span>
                            <span className="font-medium">{new Date(booking.paidAt).toLocaleString("vi-VN")}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Đặt lúc</span>
                          <span className="font-medium">{new Date(booking.timestamp).toLocaleString("vi-VN")}</span>
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button className="flex-1" onClick={() => downloadTicket(booking)}>
                        <Download className="h-4 w-4 mr-2" />
                        Tải vé
                      </Button>

                      <Button
                        variant="outline"
                        className="flex-1 bg-transparent"
                        onClick={() => setExpandedId(null)}
                      >
                        Thu gọn
                      </Button>

                      <Button
                        variant="ghost"
                        className="flex-1"
                        onClick={async () => {
                          try {
                            await cancelMyTicket(booking.id)
                            setBookings((prev) => prev.filter((b) => b.id !== booking.id))
                          } catch (e: any) {
                            console.error(e)
                            alert(e?.message || "Không thể hủy vé")
                          }
                        }}
                      >
                        Hủy vé
                      </Button>
                    </div>
                  </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
