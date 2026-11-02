"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Search, RefreshCw, Download, Ticket, DollarSign, CheckCircle, XCircle, Eye, Ban,
} from "lucide-react"
import { formatVND } from "@/lib/utils"
import { getAdminBookings, cancelAdminBooking } from "@/lib/api/admin/bookings"

interface BookingRecord {
  id?: number
  reference: string
  customer_name?: string | null
  customer_email?: string | null
  movie: string
  cinema: string
  show_date: string
  show_time: string
  seats: string | string[]
  amount: number
  status: string
  payment_status?: string
  created_at: string
}

const bookingStatusMeta: Record<string, { label: string; className: string }> = {
  confirmed: { label: "Đã xác nhận", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  pending: { label: "Chờ xử lý", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  cancelled: { label: "Đã hủy", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  completed: { label: "Hoàn thành", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
}
const paymentStatusMeta: Record<string, { label: string; className: string }> = {
  paid: { label: "Đã thanh toán", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  pending: { label: "Chờ thanh toán", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  refunded: { label: "Đã hoàn tiền", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
}

function exportCSV(bookings: BookingRecord[]) {
  const header = ["Mã đặt vé", "Khách hàng", "Email", "Phim", "Rạp", "Ngày chiếu", "Giờ chiếu", "Ghế", "Số tiền", "Trạng thái", "Ngày đặt"]
  const rows = bookings.map((b) => [
    b.reference,
    b.customer_name || "—",
    b.customer_email || "—",
    b.movie,
    b.cinema,
    b.show_date,
    b.show_time,
    Array.isArray(b.seats) ? b.seats.join(", ") : String(b.seats || ""),
    b.amount,
    bookingStatusMeta[b.status]?.label || b.status,
    new Date(b.created_at).toLocaleDateString("vi-VN"),
  ])
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = `bookings_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

export function AdminBookingsTable() {
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [cancelTarget, setCancelTarget] = useState<BookingRecord | null>(null)

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      setBookings(await getAdminBookings())
    } catch (e: any) {
      showAlert("error", e.message || "Không thể tải dữ liệu đặt vé")
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const handleCancel = async () => {
    if (!cancelTarget) return
    try {
      const ref = cancelTarget.reference || cancelTarget.id!
      await cancelAdminBooking(ref)
      showAlert("success", `Đã hủy đặt vé ${cancelTarget.reference}`)
      setCancelTarget(null)
      fetchBookings()
    } catch (err) {
      console.error("Huỷ đặt vé (admin) thất bại:", err)
      showAlert("error", "Không thể hủy đặt vé")
      setCancelTarget(null)
    }
  }

  const filtered = bookings.filter((b) => {
    const matchSearch =
      b.reference.toLowerCase().includes(search.toLowerCase()) ||
      b.movie.toLowerCase().includes(search.toLowerCase()) ||
      (b.customer_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (b.customer_email || "").toLowerCase().includes(search.toLowerCase())
    const matchStatus =
      statusFilter === "all" ? true
      : statusFilter === "paid" ? b.payment_status === "paid"
      : statusFilter === "refunded" ? b.payment_status === "refunded"
      : statusFilter === "payment_pending" ? b.payment_status === "pending"
      : b.status === statusFilter
    return matchSearch && matchStatus
  })

  // CHỈ tính vé đã THỰC SỰ thu được tiền. Điều kiện cũ có thêm nhánh
  // `["confirmed","completed"].includes(b.status)`, nghĩa là vé đã xác nhận
  // nhưng CHƯA thanh toán (payment_status='pending' — trạng thái bình thường
  // khi khách đang ở bước thanh toán hoặc bỏ dở giữa chừng) vẫn bị cộng vào
  // doanh thu, thổi phồng con số so với tiền thật đã thu.
  // Vé bị huỷ được chuyển sang 'refunded' nên tự động không lọt vào đây.
  const totalRevenue = bookings
    .filter((b) => b.payment_status === "paid")
    .reduce((s, b) => s + Number(b.amount || 0), 0)
  const paidCount = bookings.filter((b) => b.payment_status === "paid").length
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length
  const cancelledCount = bookings.filter((b) => b.status === "cancelled").length

  const getSeats = (seats: string | string[]): string[] => {
    if (Array.isArray(seats)) return seats.map((s) => typeof s === "object" ? (s as any).id || JSON.stringify(s) : String(s))
    return String(seats || "").split(",").map((s) => s.trim()).filter(Boolean)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Quản lý đặt vé</h2>
          <p className="text-muted-foreground text-sm">Theo dõi và quản lý tất cả đơn đặt vé</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Xuất CSV
          </Button>
          <Button variant="outline" size="sm" onClick={fetchBookings}>
            <RefreshCw className="h-4 w-4 mr-1" /> Làm mới
          </Button>
        </div>
      </div>

      {alert && (
        <Alert className={`${alert.type === "success" ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
          <AlertDescription>{alert.text}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tổng đặt vé", value: bookings.length, icon: Ticket, color: "text-blue-500" },
          { label: "Doanh thu", value: formatVND(totalRevenue), icon: DollarSign, color: "text-green-500" },
          { label: "Đã thanh toán", value: paidCount, icon: CheckCircle, color: "text-purple-500" },
          { label: "Đã hủy", value: cancelledCount, icon: XCircle, color: "text-red-500" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${s.color}`}><s.icon className="h-5 w-5" /></div>
              <div>
                <p className="text-xl font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm mã vé, tên phim, khách hàng..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            {/* Bỏ 2 lựa chọn "Chờ xử lý"/"Hoàn thành": cột booking_status trong
                DB là ENUM chỉ có 'confirmed' và 'cancelled', nên 2 bộ lọc đó
                LUÔN trả về 0 kết quả — admin tưởng không có đơn nào.
                Thay bằng "Chờ thanh toán" lọc theo payment_status (giá trị thật
                sự tồn tại: pending/paid/failed/refunded). */}
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="confirmed">Đã xác nhận</SelectItem>
            <SelectItem value="paid">Đã thanh toán</SelectItem>
            <SelectItem value="payment_pending">Chờ thanh toán</SelectItem>
            <SelectItem value="cancelled">Đã hủy</SelectItem>
            <SelectItem value="refunded">Đã hoàn tiền</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        {loading && <div className="p-8 text-center text-muted-foreground">Đang tải đơn đặt vé...</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">Không tìm thấy đơn đặt vé nào</div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã vé</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Phim & Rạp</TableHead>
                  <TableHead>Suất chiếu</TableHead>
                  <TableHead>Ghế</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead className="text-center">Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((booking) => {
                  const bsm = bookingStatusMeta[booking.status]
                  const psm = paymentStatusMeta[booking.payment_status || ""]
                  const canCancel = booking.status === "confirmed" || booking.status === "pending"
                  const seats = getSeats(booking.seats)
                  return (
                    <TableRow key={booking.reference}>
                      <TableCell>
                        <span className="font-mono text-sm font-medium">{booking.reference}</span>
                        <p className="text-xs text-muted-foreground">{new Date(booking.created_at).toLocaleDateString("vi-VN")}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{booking.customer_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{booking.customer_email || ""}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{booking.movie}</p>
                        <p className="text-xs text-muted-foreground">{booking.cinema}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{new Date(booking.show_date).toLocaleDateString("vi-VN")}</p>
                        <p className="text-xs text-muted-foreground font-mono">{booking.show_time}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[100px]">
                          {seats.slice(0, 4).map((seat, i) => (
                            <Badge key={i} variant="outline" className="text-xs px-1 py-0">{seat}</Badge>
                          ))}
                          {seats.length > 4 && <Badge variant="outline" className="text-xs px-1 py-0">+{seats.length - 4}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">{formatVND(booking.amount)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <Badge className={bsm?.className || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"} variant="secondary">
                            {bsm?.label || booking.status || "—"}
                          </Badge>
                          {psm && (
                            <Badge className={`${psm.className} text-xs`} variant="secondary">
                              {psm.label}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canCancel && (
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setCancelTarget(booking)}>
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Cancel Confirm */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận hủy đặt vé</AlertDialogTitle>
            <AlertDialogDescription>
              Hủy đơn đặt vé <strong>#{cancelTarget?.reference}</strong> — {cancelTarget?.movie}?
              Ghế sẽ được trả lại và khách hàng sẽ được hoàn tiền (nếu có).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={handleCancel}>Hủy đặt vé</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
