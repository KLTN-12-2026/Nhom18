"use client"

/**
 * Báo sự cố suất chiếu (mất điện, hỏng máy chiếu...) — gửi email + thông báo
 * trong web cho mọi khách đã mua vé, và nếu chọn "Huỷ suất" thì hoàn tiền tự
 * động. Hai bước giống luồng đôn suất: mở hộp thoại là XEM TRƯỚC số vé/khách
 * bị ảnh hưởng (không làm gì), bấm xác nhận mới thực hiện.
 */
import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle, Mail, RefreshCw, History } from "lucide-react"
import { formatVND } from "@/lib/utils"
import {
  reportShowtimeIncident, listShowtimeIncidents,
  type IncidentType, type IncidentReason, type IncidentResult, type IncidentLog,
} from "@/lib/api/admin/showtimes"

export const INCIDENT_REASONS: { value: IncidentReason; label: string }[] = [
  { value: "mat_dien", label: "Mất điện" },
  { value: "may_chieu", label: "Sự cố máy chiếu / âm thanh" },
  { value: "dieu_hoa", label: "Sự cố điều hoà" },
  { value: "thoi_tiet", label: "Thời tiết xấu / thiên tai" },
  { value: "an_toan", label: "Sự cố an toàn kỹ thuật toà nhà" },
  { value: "khac", label: "Lý do khác (ghi rõ trong lời nhắn)" },
]

export interface IncidentShowtime {
  id: number
  movie_title: string
  cinema_name: string
  show_date: string
  show_time: string
}

export function ShowtimeIncidentDialog({
  showtime, onClose, onDone,
}: { showtime: IncidentShowtime | null; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<IncidentType>("cancelled")
  const [reason, setReason] = useState<IncidentReason>("mat_dien")
  const [message, setMessage] = useState("")
  const [delay, setDelay] = useState("")
  const [preview, setPreview] = useState<IncidentResult | null>(null)
  const [result, setResult] = useState<IncidentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Mở hộp thoại cho suất khác → làm mới toàn bộ
  useEffect(() => {
    setType("cancelled"); setReason("mat_dien"); setMessage(""); setDelay("")
    setPreview(null); setResult(null); setError(null)
  }, [showtime?.id])

  // Xem trước số vé/khách bị ảnh hưởng mỗi khi đổi loại xử lý
  useEffect(() => {
    if (!showtime) return
    let huy = false
    reportShowtimeIncident(showtime.id, { type, reason: "mat_dien", preview: true })
      .then((p) => { if (!huy) { setPreview(p); setError(null) } })
      .catch((e) => { if (!huy) setError(e?.message || "Không kiểm tra được suất chiếu") })
    return () => { huy = true }
  }, [showtime?.id, type]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!showtime) return
    setBusy(true); setError(null)
    try {
      const r = await reportShowtimeIncident(showtime.id, {
        type, reason,
        message: message.trim() || undefined,
        delayMinutes: type === "notice" && delay ? Number(delay) : undefined,
      })
      setResult(r)
      onDone()
    } catch (e: any) {
      setError(e?.message || "Không gửi được báo sự cố")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!showtime} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Báo sự cố suất chiếu
          </DialogTitle>
          <DialogDescription>
            {showtime && `#${showtime.id} · ${showtime.movie_title} · ${showtime.cinema_name} · ${showtime.show_time?.slice(0, 5)} ngày ${showtime.show_date?.slice(0, 10)}`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-green-500/50 bg-green-50/60 p-3 dark:bg-green-950/20">
              <p className="font-semibold text-green-700 dark:text-green-400">
                {result.affected_tickets === 0
                  ? (type === "cancelled" ? "Đã huỷ suất chiếu. Suất này chưa có vé nào nên không cần gửi email." : "Đã ghi nhận sự cố. Suất này chưa có vé nào nên không cần gửi email.")
                  : `Đã xử lý ${result.affected_tickets} vé của ${result.affected_customers} khách.`}
              </p>
              {result.affected_tickets > 0 && (
                <p className="mt-1 flex items-center gap-1.5">
                  <Mail className="h-4 w-4" /> Email gửi thành công: <strong>{result.emails_sent}</strong>
                  {!!result.emails_failed && <span className="text-red-600"> · thất bại: {result.emails_failed}</span>}
                </p>
              )}
              {type === "cancelled" && result.refund_total > 0 && (
                <p className="mt-1">Đã hoàn tiền tự động: <strong>{formatVND(result.refund_total)}</strong> ({result.paid_tickets} vé đã thanh toán)</p>
              )}
            </div>
            <DialogFooter><Button onClick={onClose}>Đóng</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Cách xử lý</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={type === "cancelled" ? "destructive" : "outline"} onClick={() => setType("cancelled")}>
                  Huỷ suất + hoàn tiền
                </Button>
                <Button type="button" variant={type === "notice" ? "default" : "outline"} onClick={() => setType("notice")}>
                  Vẫn chiếu, chỉ thông báo
                </Button>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Nhóm sự cố</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as IncidentReason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {type === "notice" && (
              <div>
                <Label className="mb-2 block">Suất chiếu trễ (phút, không bắt buộc)</Label>
                <Input type="number" min={5} max={180} placeholder="vd 30" value={delay} onChange={(e) => setDelay(e.target.value)} />
              </div>
            )}

            <div>
              <Label className="mb-2 block">Lời nhắn gửi khách {reason === "khac" ? "(bắt buộc)" : "(không bắt buộc)"}</Label>
              <Textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="vd: Toà nhà mất điện diện rộng, rạp xin lỗi quý khách và mời quý khách chọn suất khác." />
            </div>

            {preview && (
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                {preview.affected_tickets === 0 ? (
                  <p>Suất này <strong>chưa có vé nào</strong> — {type === "cancelled" ? "huỷ suất sẽ không ảnh hưởng khách nào." : "không có ai cần thông báo."}</p>
                ) : (
                  <p>
                    Sẽ gửi email và thông báo cho <strong>{preview.affected_customers} khách</strong> ({preview.affected_tickets} vé).
                    {type === "cancelled" && <> Hoàn tiền tự động <strong>{formatVND(preview.refund_total)}</strong> cho {preview.paid_tickets} vé đã thanh toán; ghế, điểm thưởng và mã giảm giá được trả lại.</>}
                  </p>
                )}
                {type === "cancelled" && <p className="mt-1 text-xs text-red-600">Suất chiếu sẽ bị ẩn khỏi trang khách và không nhận đặt vé nữa. Không thể hoàn tác.</p>}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={busy}>Huỷ bỏ</Button>
              <Button variant={type === "cancelled" ? "destructive" : "default"} onClick={submit} disabled={busy || !preview}>
                {busy && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                {type === "cancelled" ? "Xác nhận huỷ suất" : "Gửi thông báo"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Nhật ký các lần báo sự cố (quản lý chi nhánh chỉ thấy của rạp mình). */
export function ShowtimeIncidentHistory({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<IncidentLog[]>([])
  useEffect(() => {
    listShowtimeIncidents().then(setRows).catch(() => setRows([]))
  }, [refreshKey])

  if (!rows.length) return null
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Nhật ký sự cố suất chiếu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm">
            <div>
              <p className="font-medium">
                {r.movie_title} · {r.show_time} {r.show_date} · {r.cinema_name}{r.room_name ? ` · ${r.room_name}` : ""}
              </p>
              <p className="text-muted-foreground">
                {r.reason_label}{r.delay_minutes ? ` · trễ ${r.delay_minutes} phút` : ""}
                {r.message ? ` — "${r.message}"` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString("vi-VN")} · người báo: {r.reported_by_name || "—"}
              </p>
            </div>
            <div className="text-right">
              <Badge variant={r.incident_type === "cancelled" ? "destructive" : "secondary"}>
                {r.incident_type === "cancelled" ? "Đã huỷ suất" : "Thông báo"}
              </Badge>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.affected_tickets} vé · {r.emails_sent} email{r.emails_failed ? ` · ${r.emails_failed} lỗi` : ""}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
