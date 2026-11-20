"use client"

/**
 * SỔ HOÀN TIỀN (migration 49)
 *
 * Trang này tồn tại để trả lời đúng một câu hỏi: "khoản tiền của khách đang ở
 * đâu?". Trước đây huỷ vé là vé đổi trạng thái sang 'refunded' và hết — không
 * ai biết tiền đã thực sự trả chưa.
 *
 * Phân vai (chốt chặn thật nằm ở backend, đây chỉ là lớp hiển thị):
 *   - Quản lý chi nhánh: xem sổ của rạp mình, đề nghị hoàn, xác nhận đã chi
 *     tiền mặt tại quầy
 *   - Quản trị viên: DUYỆT / TỪ CHỐI — người tạo ra lý do hoàn tiền không được
 *     là người phê duyệt khoản tiền đó
 */
import { useCallback, useEffect, useState } from "react"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Wallet, RefreshCw, CheckCircle, XCircle, AlertTriangle, Search, Banknote, Ticket as TicketIcon, Bot, Send,
} from "lucide-react"
import { formatVND } from "@/lib/utils"
import { useRequireAdmin } from "@/hooks/use-require-admin"
import { useAuth } from "@/lib/auth"
import {
  getRefunds, duyetHoanTien, tuChoiHoanTien, xacNhanDaChi, traCuuCong,
  NHAN_KENH, MO_TA_KENH,
  type RefundRow, type ThongKeHoan, type KenhHoan, type TrangThaiHoan,
} from "@/lib/api/admin/refunds"

const MAU_TRANG_THAI: Record<TrangThaiHoan, string> = {
  that_bai: "bg-red-500/15 text-red-600 border-red-500/40",
  cho_duyet: "bg-amber-500/15 text-amber-600 border-amber-500/40",
  dang_gui_cong: "bg-blue-500/15 text-blue-600 border-blue-500/40",
  da_duyet: "bg-sky-500/15 text-sky-600 border-sky-500/40",
  thanh_cong: "bg-green-500/15 text-green-600 border-green-500/40",
  tu_choi: "bg-muted text-muted-foreground border-border",
}

const BO_LOC: { value: string; label: string }[] = [
  { value: "tat_ca", label: "Tất cả" },
  { value: "cho_duyet", label: "Chờ duyệt" },
  { value: "da_duyet", label: "Đã duyệt, chờ thực hiện" },
  { value: "that_bai", label: "Thất bại — cần xử lý tay" },
  { value: "thanh_cong", label: "Đã hoàn xong" },
  { value: "tu_choi", label: "Đã từ chối" },
]

export default function AdminRefundsPage() {
  const { loading: authLoading, allowed, forbidden } = useRequireAdmin()
  const { user } = useAuth()
  const laAdmin = !!user?.can_manage_users

  const [items, setItems] = useState<RefundRow[]>([])
  const [thongKe, setThongKe] = useState<ThongKeHoan | null>(null)
  const [loc, setLoc] = useState("tat_ca")
  const [dangTai, setDangTai] = useState(false)
  const [thongBao, setThongBao] = useState<{ loai: "ok" | "loi"; chu: string } | null>(null)

  const [dangDuyet, setDangDuyet] = useState<RefundRow | null>(null)
  const [kenhChon, setKenhChon] = useState<KenhHoan>("voucher")
  const [ghiChu, setGhiChu] = useState("")
  const [dangTuChoi, setDangTuChoi] = useState<RefundRow | null>(null)
  const [lyDoTuChoi, setLyDoTuChoi] = useState("")
  const [dangXuLy, setDangXuLy] = useState(false)
  // Bỏ qua bước tra cứu giao dịch trước khi gửi lệnh hoàn (dùng khi cổng trả mã 94)
  const [boQuaTraCuu, setBoQuaTraCuu] = useState(false)
  const [ketQuaTraCuu, setKetQuaTraCuu] = useState<{ ve: string; noiDung: any } | null>(null)

  const taiDuLieu = useCallback(async () => {
    setDangTai(true)
    try {
      const data = await getRefunds(loc === "tat_ca" ? {} : { trangThai: loc as TrangThaiHoan })
      setItems(data.items || [])
      setThongKe(data.thongKe || null)
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không tải được sổ hoàn tiền" })
    } finally {
      setDangTai(false)
    }
  }, [loc])

  useEffect(() => {
    if (allowed) taiDuLieu()
  }, [allowed, taiDuLieu])

  const moDuyet = (r: RefundRow, boQua = false) => {
    setDangDuyet(r)
    setKenhChon(r.kenh)
    setGhiChu("")
    setBoQuaTraCuu(boQua)
  }

  const xacNhanDuyet = async () => {
    if (!dangDuyet) return
    setDangXuLy(true)
    try {
      const kq: any = await duyetHoanTien(dangDuyet.id, {
        kenh: kenhChon,
        ghiChu: ghiChu || undefined,
        boQuaTraCuu: boQuaTraCuu || undefined,
      })
      const tt = kq?.trang_thai
      if (kq?.khongKetLuan) {
        setThongBao({
          loai: "loi",
          chu: `Cổng thanh toán chưa trả lời được về giao dịch này (mã ${kq?.ketQuaCong?.maPhanHoi || "—"}). Lệnh hoàn vẫn ở trạng thái đã duyệt — thử lại sau, hoặc bấm "Gửi thẳng" để bỏ qua bước tra cứu.`,
        })
        setDangDuyet(null)
        taiDuLieu()
        return
      }
      setThongBao({
        loai: tt === "that_bai" ? "loi" : "ok",
        chu:
          tt === "thanh_cong"
            ? `Đã hoàn ${formatVND(dangDuyet.so_tien)} cho vé ${dangDuyet.booking_reference}.`
            : tt === "that_bai"
              ? `Cổng thanh toán từ chối lệnh hoàn vé ${dangDuyet.booking_reference}. Xem ghi chú trong sổ để xử lý tay.`
              : kq?.choNguoiXacNhan
                ? `Đã duyệt. Thu ngân chi tiền tại quầy rồi bấm "Đã chi".`
                : `Đã duyệt lệnh hoàn vé ${dangDuyet.booking_reference}.`,
      })
      setDangDuyet(null)
      taiDuLieu()
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không duyệt được" })
    } finally {
      setDangXuLy(false)
    }
  }

  const xacNhanTuChoi = async () => {
    if (!dangTuChoi || !lyDoTuChoi.trim()) return
    setDangXuLy(true)
    try {
      await tuChoiHoanTien(dangTuChoi.id, lyDoTuChoi.trim())
      setThongBao({ loai: "ok", chu: `Đã từ chối lệnh hoàn vé ${dangTuChoi.booking_reference}.` })
      setDangTuChoi(null)
      setLyDoTuChoi("")
      taiDuLieu()
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không từ chối được" })
    } finally {
      setDangXuLy(false)
    }
  }

  const daChi = async (r: RefundRow) => {
    try {
      await xacNhanDaChi(r.id)
      setThongBao({ loai: "ok", chu: `Đã ghi nhận chi ${formatVND(r.so_tien)} tiền mặt cho vé ${r.booking_reference}.` })
      taiDuLieu()
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không ghi nhận được" })
    }
  }

  const tracuu = async (r: RefundRow) => {
    setThongBao(null)
    try {
      const kq = await traCuuCong(r.id)
      setKetQuaTraCuu({ ve: r.booking_reference, noiDung: kq })
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không tra cứu được" })
    }
  }

  if (authLoading) return <div className="p-8 text-muted-foreground">Đang tải...</div>
  if (forbidden) return <div className="p-8">Bạn không có quyền truy cập trang này.</div>

  const canXuLy = items.filter((r) => r.trang_thai === "cho_duyet" || r.trang_thai === "that_bai")

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 p-6 md:p-8 space-y-6 overflow-x-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-emerald-500" /> Sổ hoàn tiền
            </h1>
            <p className="text-sm text-muted-foreground">
              {laAdmin
                ? "Mỗi vé đúng một dòng. Chi nhánh đề nghị, quản trị viên duyệt — tách hai vai để không ai vừa tạo lý do vừa duyệt tiền."
                : "Lệnh hoàn tiền của rạp bạn phụ trách. Việc duyệt tiền thuộc quyền quản trị viên."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={loc} onValueChange={setLoc}>
              <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BO_LOC.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={taiDuLieu} disabled={dangTai}>
              <RefreshCw className={`h-4 w-4 ${dangTai ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {thongBao && (
          <Alert className={thongBao.loai === "ok" ? "border-green-500/50" : "border-red-500/50"}>
            <AlertDescription>{thongBao.chu}</AlertDescription>
          </Alert>
        )}

        {thongKe && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className={thongKe.cho_duyet.so_luong ? "border-amber-500/50" : ""}>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Chờ duyệt</p>
                <p className="text-2xl font-bold text-amber-600">{thongKe.cho_duyet.so_luong}</p>
                <p className="text-xs text-muted-foreground">{formatVND(thongKe.cho_duyet.tong_tien)}</p>
              </CardContent>
            </Card>
            <Card className={thongKe.that_bai.so_luong ? "border-red-500/50" : ""}>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Thất bại — xử lý tay</p>
                <p className="text-2xl font-bold text-red-600">{thongKe.that_bai.so_luong}</p>
                <p className="text-xs text-muted-foreground">{formatVND(thongKe.that_bai.tong_tien)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Đang xử lý</p>
                <p className="text-2xl font-bold">{thongKe.da_duyet.so_luong + thongKe.dang_gui_cong.so_luong}</p>
                <p className="text-xs text-muted-foreground">
                  {formatVND(thongKe.da_duyet.tong_tien + thongKe.dang_gui_cong.tong_tien)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">Đã hoàn xong</p>
                <p className="text-2xl font-bold text-green-600">{thongKe.thanh_cong.so_luong}</p>
                <p className="text-xs text-muted-foreground">{formatVND(thongKe.thanh_cong.tong_tien)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {thongKe && thongKe.that_bai.so_luong > 0 && (
          <Alert className="border-red-500/50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {/* AlertDescription dùng layout grid: mỗi node con thành MỘT DÒNG
                  riêng. Đặt <strong> trực tiếp cạnh chữ sẽ làm câu vỡ thành
                  nhiều dòng rời rạc — phải bọc cả câu trong một thẻ <p>. */}
              <p>
                Có <strong>{thongKe.that_bai.so_luong}</strong> lệnh hoàn chưa trả được tiền cho khách. Nếu cổng báo
                mã <strong>94</strong> thì giao dịch chỉ đang được cổng xử lý, không phải hỏng — thử lại sau, hoặc
                dùng <em>Gửi thẳng</em> để bỏ qua bước tra cứu.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Danh sách lệnh hoàn {canXuLy.length > 0 && <Badge variant="outline" className="ml-2">{canXuLy.length} cần xử lý</Badge>}
            </CardTitle>
            <CardDescription>
              Sắp xếp ưu tiên: thất bại → chờ duyệt → đang gửi → đã duyệt → đã xong.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chưa có lệnh hoàn tiền nào{loc !== "tat_ca" ? " ở trạng thái này" : ""}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vé / Khách</TableHead>
                      <TableHead>Suất chiếu</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                      <TableHead>Kênh hoàn</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Nguồn</TableHead>
                      <TableHead className="text-right sticky right-0 bg-card">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-mono text-xs">{r.booking_reference}</div>
                          <div className="text-xs text-muted-foreground">{r.ten_khach}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{r.movie_title || "—"}</div>
                          <div className="text-muted-foreground">
                            {r.show_time} {r.show_date} · {r.cinema_name || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap">
                          {formatVND(r.so_tien)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{r.kenh_nhan}</div>
                          {r.voucher_code && <div className="font-mono text-muted-foreground">{r.voucher_code}</div>}
                          {r.ma_giao_dich_hoan && (
                            <div className="text-muted-foreground">GD hoàn: {r.ma_giao_dich_hoan}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={MAU_TRANG_THAI[r.trang_thai]}>
                            {r.trang_thai_nhan}
                          </Badge>
                          {r.tu_dong_duyet === 1 && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Bot className="h-3 w-3" /> tự động duyệt
                            </div>
                          )}
                          {r.ma_phan_hoi && r.ma_phan_hoi !== "00" && (
                            <div className="text-[11px] text-red-600">mã cổng: {r.ma_phan_hoi}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{r.nguon_nhan}</div>
                          <div className="text-muted-foreground max-w-[200px] truncate" title={r.ly_do}>{r.ly_do}</div>
                        </TableCell>
                        <TableCell className="text-right sticky right-0 bg-card">
                          <div className="flex flex-wrap justify-end gap-1">
                            {laAdmin && (r.trang_thai === "cho_duyet" || r.trang_thai === "that_bai") && (
                              <>
                                <Button size="sm" onClick={() => moDuyet(r)}>
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Duyệt
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setDangTuChoi(r)}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {r.trang_thai === "da_duyet" && r.kenh === "tien_mat" && (
                              <Button size="sm" variant="outline" onClick={() => daChi(r)}>
                                <Banknote className="h-3.5 w-3.5 mr-1" /> Đã chi
                              </Button>
                            )}
                            {/* Cổng trả mã 94 = "đang xử lý", không phải giao dịch
                                hỏng. Bước tra cứu không kết luận được, nên cho
                                quản trị viên gửi thẳng lệnh hoàn. */}
                            {laAdmin && r.trang_thai === "that_bai" && r.kenh === "cong_thanh_toan"
                              && r.phuong_thuc_goc === "vnpay" && (
                              <Button size="sm" variant="secondary" onClick={() => moDuyet(r, true)} title="Gửi thẳng lệnh hoàn, bỏ qua bước tra cứu">
                                <Send className="h-3.5 w-3.5 mr-1" /> Gửi thẳng
                              </Button>
                            )}
                            {laAdmin && r.phuong_thuc_goc === "vnpay" && (
                              <Button size="sm" variant="ghost" onClick={() => tracuu(r)} title="Tra cứu ở cổng thanh toán (chỉ đọc)">
                                <Search className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Duyệt ───────────────────────────────────────────────────── */}
        <Dialog open={!!dangDuyet} onOpenChange={(m) => !m && setDangDuyet(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Duyệt hoàn tiền</DialogTitle>
              <DialogDescription>
                Vé {dangDuyet?.booking_reference} · {dangDuyet ? formatVND(dangDuyet.so_tien) : ""} ·{" "}
                {dangDuyet?.ten_khach}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Trả lại bằng cách nào</Label>
                <Select value={kenhChon} onValueChange={(v) => setKenhChon(v as KenhHoan)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(NHAN_KENH) as KenhHoan[]).map((k) => (
                      <SelectItem key={k} value={k}>{NHAN_KENH[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{MO_TA_KENH[kenhChon]}</p>
                {kenhChon === "cong_thanh_toan" && dangDuyet?.phuong_thuc_goc !== "vnpay" && (
                  <Alert className="border-amber-500/50">
                    <AlertDescription className="text-xs">
                      Vé này thanh toán bằng <strong>{dangDuyet?.phuong_thuc_goc || "phương thức khác"}</strong>, hệ
                      thống mới tích hợp lệnh hoàn của VNPay. Hãy chọn voucher bồi thường, điểm thưởng hoặc tiền mặt.
                    </AlertDescription>
                  </Alert>
                )}
                {kenhChon === "cong_thanh_toan" && dangDuyet?.phuong_thuc_goc === "vnpay" && (
                  <Alert className="border-blue-500/50">
                    <AlertDescription className="text-xs">
                      Bấm duyệt sẽ <strong>gửi lệnh hoàn thật</strong> sang VNPay cho giao dịch{" "}
                      {dangDuyet?.ma_giao_dich_goc}. Thao tác này không đảo ngược được.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <Label>Ghi chú (tuỳ chọn)</Label>
                <Textarea
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  placeholder="Ví dụ: khách đồng ý nhận voucher để dùng ngay thay vì chờ ngân hàng."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDangDuyet(null)} disabled={dangXuLy}>Huỷ</Button>
              <Button onClick={xacNhanDuyet} disabled={dangXuLy}>
                {dangXuLy ? "Đang xử lý..." : "Duyệt và thực hiện"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Từ chối ─────────────────────────────────────────────────── */}
        <Dialog open={!!dangTuChoi} onOpenChange={(m) => !m && setDangTuChoi(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Từ chối hoàn tiền</DialogTitle>
              <DialogDescription>
                Vé {dangTuChoi?.booking_reference} · {dangTuChoi ? formatVND(dangTuChoi.so_tien) : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Lý do từ chối (bắt buộc)</Label>
              <Textarea
                value={lyDoTuChoi}
                onChange={(e) => setLyDoTuChoi(e.target.value)}
                placeholder="Ghi rõ để khách và cấp trên đọc lại được về sau."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDangTuChoi(null)} disabled={dangXuLy}>Huỷ</Button>
              <Button variant="destructive" onClick={xacNhanTuChoi} disabled={dangXuLy || !lyDoTuChoi.trim()}>
                Xác nhận từ chối
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Kết quả tra cứu cổng thanh toán ─────────────────────────── */}
        <Dialog open={!!ketQuaTraCuu} onOpenChange={(m) => !m && setKetQuaTraCuu(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Tra cứu tại cổng thanh toán</DialogTitle>
              <DialogDescription>
                Vé {ketQuaTraCuu?.ve} — chỉ đọc, không thay đổi gì ở cổng lẫn trong hệ thống.
              </DialogDescription>
            </DialogHeader>
            {ketQuaTraCuu && (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={ketQuaTraCuu.noiDung.ok ? MAU_TRANG_THAI.thanh_cong : MAU_TRANG_THAI.that_bai}>
                    mã {ketQuaTraCuu.noiDung.maPhanHoi || "—"}
                  </Badge>
                  <span>{ketQuaTraCuu.noiDung.moTa}</span>
                </div>
                {ketQuaTraCuu.noiDung.soTien != null && (
                  <p>Số tiền cổng xác nhận: <strong>{formatVND(ketQuaTraCuu.noiDung.soTien)}</strong></p>
                )}
                <p className="text-xs text-muted-foreground">
                  Chữ ký phản hồi:{" "}
                  {ketQuaTraCuu.noiDung.chuKyHopLe === true
                    ? "hợp lệ"
                    : ketQuaTraCuu.noiDung.chuKyHopLe === false
                      ? "KHÔNG hợp lệ — không được tin phản hồi này"
                      : "phản hồi không kèm chữ ký"}
                </p>
                <pre className="max-h-[300px] overflow-auto rounded bg-muted p-3 text-[11px]">
                  {JSON.stringify(ketQuaTraCuu.noiDung.phanHoi, null, 2)}
                </pre>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setKetQuaTraCuu(null)}>Đóng</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TicketIcon className="h-4 w-4" /> Cách hệ thống quyết định
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Tự động duyệt</strong> khi lỗi thuộc về rạp (sự cố) hoặc khách huỷ
              đúng hạn, <em>và</em> số tiền vé dưới 500.000đ, <em>và</em> tổng tiền của cả lần báo sự cố dưới
              5.000.000đ. Mục đích: khách không phải chờ ai online lúc rạp mất điện.
            </p>
            <p>
              <strong className="text-foreground">Luôn cần người duyệt</strong> khi số tiền vượt ngưỡng, khi huỷ diện
              rộng, hoặc khi nhân viên chủ động đề nghị hoàn cho một khách cụ thể.
            </p>
            <p>
              <strong className="text-foreground">Voucher và điểm thưởng</strong> chạy tới cùng ngay khi được duyệt vì
              không có tiền rời khỏi hệ thống. <strong className="text-foreground">Cổng thanh toán và tiền mặt</strong>{" "}
              luôn cần một con người bấm nút.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
