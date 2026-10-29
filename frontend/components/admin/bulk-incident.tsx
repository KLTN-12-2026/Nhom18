"use client"

/**
 * SỰ CỐ DIỆN RỘNG — mất điện cả rạp, sửa chữa một dãy phòng, thời tiết xấu.
 *
 * Báo từng suất một thì mất hàng chục thao tác đúng lúc đang rối nhất. Ở đây
 * chọn rạp + phòng + khoảng giờ, xem trước danh sách suất bị ảnh hưởng rồi xử
 * lý một lượt. Mỗi khách vẫn nhận email riêng cho vé của mình; admin nhận một
 * thông báo tổng thay vì hàng chục thông báo lẻ.
 */
import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle, Mail, RefreshCw } from "lucide-react"
import { formatVND } from "@/lib/utils"
import { INCIDENT_REASONS } from "@/components/admin/showtime-incident"
import {
  reportBulkIncident,
  type IncidentType, type IncidentReason, type BulkIncidentInput, type BulkIncidentResult,
} from "@/lib/api/admin/showtimes"

export function BulkIncidentDialog({
  open, onClose, onDone, cinemas, rooms, cinemaIdMacDinh, laAdmin,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
  cinemas: { id: number; name: string }[]
  rooms: { id: number; cinema_id: number; room_name: string }[]
  cinemaIdMacDinh?: number | null
  laAdmin: boolean
}) {
  const homNay = new Date().toISOString().slice(0, 10)
  const [cinemaId, setCinemaId] = useState<string>(String(cinemaIdMacDinh ?? cinemas[0]?.id ?? ""))
  const [chonPhong, setChonPhong] = useState<number[]>([])
  const [ngay, setNgay] = useState(homNay)
  const [tuGio, setTuGio] = useState("00:00")
  const [denGio, setDenGio] = useState("23:59")
  const [type, setType] = useState<IncidentType>("cancelled")
  const [reason, setReason] = useState<IncidentReason>("mat_dien")
  const [message, setMessage] = useState("")
  const [preview, setPreview] = useState<BulkIncidentResult | null>(null)
  const [ketQua, setKetQua] = useState<BulkIncidentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phongCuaRap = rooms.filter((r) => String(r.cinema_id) === String(cinemaId))

  useEffect(() => {
    if (!open) return
    setPreview(null); setKetQua(null); setError(null); setChonPhong([])
    if (cinemaIdMacDinh) setCinemaId(String(cinemaIdMacDinh))
  }, [open, cinemaIdMacDinh])

  // Đổi bất kỳ điều kiện lọc nào thì bản xem trước cũ không còn đúng nữa
  const doiDieuKien = (fn: () => void) => { fn(); setPreview(null) }

  const thamSo = (xemTruoc: boolean): BulkIncidentInput => ({
    cinemaId: laAdmin ? cinemaId : undefined,
    roomIds: chonPhong.length ? chonPhong : undefined,
    tuLuc: `${ngay} ${tuGio}`,
    denLuc: `${ngay} ${denGio}`,
    type,
    reason,
    message: message.trim() || undefined,
    preview: xemTruoc,
  })

  const xemTruoc = async () => {
    setBusy(true); setError(null); setKetQua(null)
    try {
      setPreview(await reportBulkIncident(thamSo(true)))
    } catch (e: any) {
      setError(e?.message || "Không kiểm tra được"); setPreview(null)
    } finally { setBusy(false) }
  }

  const thucHien = async () => {
    setBusy(true); setError(null)
    try {
      setKetQua(await reportBulkIncident(thamSo(false)))
      onDone()
    } catch (e: any) {
      setError(e?.message || "Không xử lý được")
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Báo sự cố diện rộng
          </DialogTitle>
          <DialogDescription>
            Mất điện cả rạp, sửa chữa nhiều phòng, thời tiết xấu — xử lý một lượt nhiều suất chiếu.
          </DialogDescription>
        </DialogHeader>

        {ketQua ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-green-500/50 bg-green-50/60 p-3 dark:bg-green-950/20">
              <p className="font-semibold text-green-700 dark:text-green-400">
                Đã xử lý {ketQua.processed}/{ketQua.total_showtimes} suất chiếu.
              </p>
              <p className="mt-1 flex items-center gap-1.5">
                <Mail className="h-4 w-4" /> Email gửi thành công: <strong>{ketQua.emails_sent}</strong>
                {!!ketQua.emails_failed && <span className="text-red-600"> · thất bại: {ketQua.emails_failed}</span>}
              </p>
              {type === "cancelled" && ketQua.refund_total > 0 && (
                <p className="mt-1">Đã hoàn tiền tự động: <strong>{formatVND(ketQua.refund_total)}</strong></p>
              )}
              {!!ketQua.failed?.length && (
                <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  {ketQua.failed.length} suất không xử lý được:
                  {ketQua.failed.slice(0, 5).map((f) => (
                    <div key={f.id}>· {f.show_time} {f.movie_title} — {f.error}</div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter><Button onClick={onClose}>Đóng</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {laAdmin && (
                <div>
                  <Label className="mb-1.5 block">Rạp</Label>
                  <Select value={cinemaId} onValueChange={(v) => doiDieuKien(() => { setCinemaId(v); setChonPhong([]) })}>
                    <SelectTrigger><SelectValue placeholder="Chọn rạp" /></SelectTrigger>
                    <SelectContent>
                      {cinemas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="mb-1.5 block">Ngày</Label>
                <Input type="date" value={ngay} onChange={(e) => doiDieuKien(() => setNgay(e.target.value))} />
              </div>
              <div>
                <Label className="mb-1.5 block">Từ giờ</Label>
                <Input type="time" value={tuGio} onChange={(e) => doiDieuKien(() => setTuGio(e.target.value))} />
              </div>
              <div>
                <Label className="mb-1.5 block">Đến giờ</Label>
                <Input type="time" value={denGio} onChange={(e) => doiDieuKien(() => setDenGio(e.target.value))} />
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">
                Phòng bị ảnh hưởng <span className="text-muted-foreground">(không chọn = toàn rạp)</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {phongCuaRap.map((r) => {
                  const chon = chonPhong.includes(r.id)
                  return (
                    <Button
                      key={r.id}
                      type="button"
                      size="sm"
                      variant={chon ? "default" : "outline"}
                      onClick={() => doiDieuKien(() =>
                        setChonPhong((truoc) => chon ? truoc.filter((x) => x !== r.id) : [...truoc, r.id]))}
                    >
                      {r.room_name}
                    </Button>
                  )
                })}
                {!phongCuaRap.length && <p className="text-sm text-muted-foreground">Rạp này chưa có phòng nào.</p>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block">Cách xử lý</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={type === "cancelled" ? "destructive" : "outline"}
                    onClick={() => doiDieuKien(() => setType("cancelled"))}>Huỷ + hoàn tiền</Button>
                  <Button type="button" variant={type === "notice" ? "default" : "outline"}
                    onClick={() => doiDieuKien(() => setType("notice"))}>Chỉ thông báo</Button>
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block">Nhóm sự cố</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as IncidentReason)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INCIDENT_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">
                Lời nhắn gửi khách {reason === "khac" ? "(bắt buộc)" : "(không bắt buộc)"}
              </Label>
              <Textarea rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="vd: Toà nhà mất điện diện rộng, rạp xin lỗi quý khách." />
            </div>

            {preview && (
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                {preview.total_showtimes === 0 ? (
                  <p>Không có suất chiếu nào trong khoảng đã chọn.</p>
                ) : (
                  <>
                    <p>
                      <strong>{preview.total_showtimes} suất chiếu</strong> · {preview.total_tickets} vé bị ảnh hưởng
                      {type === "cancelled" && preview.refund_total > 0 && (
                        <> · hoàn tiền <strong>{formatVND(preview.refund_total)}</strong></>
                      )}
                    </p>
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5 text-xs">
                      {preview.showtimes.map((s) => (
                        <div key={s.id} className="flex justify-between gap-2">
                          <span>{s.show_time} · {s.movie_title} <span className="text-muted-foreground">({s.room_name})</span></span>
                          <span className="text-muted-foreground shrink-0">{s.affected_tickets} vé</span>
                        </div>
                      ))}
                    </div>
                    {type === "cancelled" && (
                      <p className="mt-2 text-xs text-red-600">
                        Các suất này sẽ bị ẩn khỏi trang khách và không nhận đặt vé nữa. Không thể hoàn tác.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={busy}>Huỷ bỏ</Button>
              {!preview ? (
                <Button onClick={xemTruoc} disabled={busy}>
                  {busy && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />} Xem trước
                </Button>
              ) : (
                <Button variant={type === "cancelled" ? "destructive" : "default"} onClick={thucHien}
                  disabled={busy || preview.total_showtimes === 0}>
                  {busy && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Xác nhận xử lý {preview.total_showtimes} suất
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
