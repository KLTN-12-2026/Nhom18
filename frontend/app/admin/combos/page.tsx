"use client"

/**
 * QUẢN LÝ BẮP NƯỚC (kho theo từng rạp) + YÊU CẦU GỬI ADMIN
 *
 * Danh mục món là cấp chuỗi, nhưng TỒN KHO là của từng chi nhánh — người đứng
 * quầy mới biết còn bao nhiêu bắp. Vì vậy:
 *  - Quản lý chi nhánh: chỉ thấy và sửa kho rạp mình, gửi yêu cầu bổ sung hàng.
 *  - Quản trị viên: chọn rạp bất kỳ, và duyệt yêu cầu (cấp thêm hàng là quyết
 *    định chi phí cấp chuỗi nên phải qua admin).
 */
import { useCallback, useEffect, useState } from "react"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Popcorn, RefreshCw, Send, AlertTriangle, CheckCircle, XCircle, PauseCircle, PlayCircle, Inbox, Plus, Pencil, Trash2, History } from "lucide-react"
import { formatVND } from "@/lib/utils"
import { useRequireAdmin } from "@/hooks/use-require-admin"
import { useAuth } from "@/lib/auth"
import { getCinemas } from "@/lib/api/cinemas"
import { getDashboardStats, type DashboardStats } from "@/lib/api/admin/dashboard"
import {
  getComboInventory, updateComboStock, getBranchRequests, createBranchRequest, resolveBranchRequest,
  createCombo, updateCombo, deleteCombo, getBranchActivity, type ComboInput, type BranchActivity,
  type ComboStock, type BranchRequest, type LoaiYeuCau, type MucDo,
} from "@/lib/api/admin/combo-inventory"

const NHAN_YEU_CAU: Record<string, string> = {
  bo_sung_hang: "Xin bổ sung hàng",
  bao_het_hang: "Báo hết hàng",
  su_co: "Sự cố tại rạp (đã xử lý)",
  khac: "Việc khác",
}

const NHAN_LOAI: Record<string, string> = {
  combo: "Combo", popcorn: "Bắp rang", drink: "Nước", snack: "Đồ ăn vặt",
}

export default function AdminCombosPage() {
  const { loading: authLoading, allowed, forbidden } = useRequireAdmin()
  const { user } = useAuth()
  const laAdmin = !!user?.can_manage_users
  const rapCuaToi = (user as any)?.cinema_id ?? null

  const [cinemas, setCinemas] = useState<{ id: number; name: string }[]>([])
  const [cinemaId, setCinemaId] = useState<string>("")
  const [kho, setKho] = useState<ComboStock[]>([])
  const [yeuCau, setYeuCau] = useState<BranchRequest[]>([])
  const [dangTai, setDangTai] = useState(true)
  const [thongBao, setThongBao] = useState<{ loai: "ok" | "loi"; chu: string } | null>(null)
  const [dangLuu, setDangLuu] = useState<number | null>(null)
  // Doanh thu + món bán chạy: trước đây nằm ở trang Tổng quan, nay gom về đúng
  // chỗ quản lý bắp nước để một màn hình trả lời trọn vẹn 'quầy đang thế nào'.
  const [thongKe, setThongKe] = useState<DashboardStats["combo"] | null>(null)

  // Hộp thoại gửi yêu cầu
  const [mo, setMo] = useState(false)
  const [mon, setMon] = useState<ComboStock | null>(null)
  const [loai, setLoai] = useState<LoaiYeuCau>("bo_sung_hang")
  const [soLuong, setSoLuong] = useState("100")
  const [mucDo, setMucDo] = useState<MucDo>("binh_thuong")
  const [tieuDe, setTieuDe] = useState("")
  const [noiDung, setNoiDung] = useState("")
  const [dangGui, setDangGui] = useState(false)

  // Hộp thoại admin xử lý yêu cầu
  const [dangXuLy, setDangXuLy] = useState<BranchRequest | null>(null)
  const [phanHoi, setPhanHoi] = useState("")

  // Hộp thoại thêm/sửa MÓN (danh mục) — chỉ quản trị viên. Món có thể bán ở
  // mọi rạp hoặc chỉ riêng một rạp (menu riêng của chi nhánh).
  const [moMon, setMoMon] = useState(false)
  const [monSua, setMonSua] = useState<ComboStock | null>(null)
  const [dangXoa, setDangXoa] = useState<ComboStock | null>(null)
  const [form, setForm] = useState<ComboInput>({ name: "", price: 0, category: "snack", description: "", image_url: "", cinema_id: null })
  const [dangLuuMon, setDangLuuMon] = useState(false)
  // Nhật ký hoạt động: admin xem cả chuỗi, quản lý xem rạp mình — mọi thay đổi
  // của chi nhánh đều để lại vết ở đây, kể cả việc không cần duyệt.
  const [nhatKy, setNhatKy] = useState<BranchActivity[]>([])

  useEffect(() => {
    if (!allowed) return
    if (laAdmin) {
      getCinemas().then((ds) => {
        const list = (ds as any[]).map((c) => ({ id: c.id, name: c.name }))
        setCinemas(list)
        setCinemaId((truoc) => truoc || String(list[0]?.id ?? ""))
      }).catch(() => setCinemas([]))
    } else if (rapCuaToi) {
      setCinemaId(String(rapCuaToi))
    }
  }, [allowed, laAdmin, rapCuaToi])

  const taiDuLieu = useCallback(async () => {
    setDangTai(true)
    try {
      const [k, y, d, nk] = await Promise.all([
        getComboInventory(laAdmin ? cinemaId : undefined),
        getBranchRequests(),
        getDashboardStats(laAdmin ? cinemaId : undefined).catch(() => null),
        getBranchActivity(laAdmin ? cinemaId : undefined).catch(() => []),
      ])
      setKho(k)
      setYeuCau(y)
      setThongKe(d?.combo ?? null)
      setNhatKy(nk)
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không tải được dữ liệu" })
    } finally {
      setDangTai(false)
    }
  }, [cinemaId, laAdmin])

  useEffect(() => {
    if (!allowed) return
    if (laAdmin && !cinemaId) return
    taiDuLieu()
  }, [allowed, cinemaId, laAdmin, taiDuLieu])

  const luuKho = async (m: ComboStock, thayDoi: { tonKho?: number; nguongCanhBao?: number; tamNgung?: boolean }) => {
    setDangLuu(m.id)
    setThongBao(null)
    try {
      setKho(await updateComboStock(m.id, { ...thayDoi, cinemaId: laAdmin ? cinemaId : undefined }))
      setThongBao({ loai: "ok", chu: `Đã cập nhật "${m.name}".` })
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không cập nhật được" })
    } finally {
      setDangLuu(null)
    }
  }

  const moYeuCau = (m: ComboStock | null, loaiMacDinh: LoaiYeuCau) => {
    setMon(m)
    setLoai(loaiMacDinh)
    setSoLuong("100")
    setMucDo(m && m.ton_kho === 0 ? "khan" : "binh_thuong")
    setTieuDe(
      m
        ? loaiMacDinh === "bao_het_hang" ? `Hết hàng: ${m.name}` : `Xin bổ sung ${m.name}`
        : "",
    )
    setNoiDung("")
    setMo(true)
  }

  const guiYeuCau = async () => {
    setDangGui(true)
    setThongBao(null)
    try {
      await createBranchRequest({
        loai,
        tieuDe,
        noiDung: noiDung || undefined,
        comboId: mon?.id,
        soLuong: loai === "bo_sung_hang" ? Number(soLuong) : undefined,
        mucDo,
        cinemaId: laAdmin ? cinemaId : undefined,
      })
      setMo(false)
      setThongBao({ loai: "ok", chu: "Đã gửi yêu cầu. Quản trị viên sẽ nhận được thông báo ngay." })
      taiDuLieu()
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không gửi được yêu cầu" })
    } finally {
      setDangGui(false)
    }
  }

  const xuLyYeuCau = async (trangThai: "da_duyet" | "tu_choi") => {
    if (!dangXuLy) return
    try {
      const kq = await resolveBranchRequest(dangXuLy.id, { trangThai, phanHoi: phanHoi || undefined })
      setDangXuLy(null)
      setPhanHoi("")
      setThongBao({
        loai: "ok",
        chu: trangThai === "da_duyet"
          ? `Đã duyệt yêu cầu${kq?.da_cong_kho ? ` và cấp thêm ${kq.da_cong_kho} suất vào kho của rạp` : ""}.`
          : "Đã từ chối yêu cầu và gửi phản hồi cho chi nhánh.",
      })
      taiDuLieu()
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không xử lý được yêu cầu" })
    }
  }

  const moFormMon = (m: ComboStock | null) => {
    setMonSua(m)
    setForm(m
      ? { name: m.name, price: Number(m.price), category: m.category, description: m.description || "", image_url: m.image_url || "", cinema_id: m.rap_rieng ?? null, is_available: !!m.ban_toan_chuoi }
      : { name: "", price: 0, category: "snack", description: "", image_url: "", cinema_id: Number(cinemaId) || null })
    setMoMon(true)
  }

  const luuMon = async () => {
    setDangLuuMon(true)
    setThongBao(null)
    try {
      if (monSua) await updateCombo(monSua.id, form)
      else await createCombo(form)
      setMoMon(false)
      setThongBao({ loai: "ok", chu: monSua ? `Đã cập nhật "${form.name}".` : `Đã thêm món "${form.name}" vào menu.` })
      taiDuLieu()
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không lưu được món" })
    } finally {
      setDangLuuMon(false)
    }
  }

  const xoaMon = async () => {
    if (!dangXoa) return
    try {
      await deleteCombo(dangXoa.id)
      setThongBao({ loai: "ok", chu: `Đã xoá "${dangXoa.name}" khỏi menu.` })
      setDangXoa(null)
      taiDuLieu()
    } catch (e: any) {
      setThongBao({ loai: "loi", chu: e?.message || "Không xoá được món" })
      setDangXoa(null)
    }
  }

  if (authLoading) return <div className="p-8 text-muted-foreground">Đang tải...</div>
  if (forbidden) return <div className="p-8">Bạn không có quyền truy cập trang này.</div>

  const soHet = kho.filter((m) => m.het_hang).length
  const soSapHet = kho.filter((m) => m.sap_het && !m.het_hang).length
  const choXuLy = yeuCau.filter((y) => y.trang_thai === "moi")

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 p-6 md:p-8 space-y-6 overflow-x-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Popcorn className="h-6 w-6 text-amber-500" /> Quản lý bắp nước
            </h1>
            <p className="text-sm text-muted-foreground">
              Tồn kho tính riêng cho từng rạp. Hết hàng ở rạp này không ảnh hưởng rạp khác.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {laAdmin && cinemas.length > 0 && (
              <Select value={cinemaId} onValueChange={setCinemaId}>
                <SelectTrigger className="w-[230px]"><SelectValue placeholder="Chọn rạp" /></SelectTrigger>
                <SelectContent>
                  {cinemas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
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

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Món đang bán</p>
            <p className="text-2xl font-bold">{kho.length - soHet}/{kho.length}</p>
          </CardContent></Card>
          <Card className={soSapHet ? "border-amber-500/50" : ""}><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Sắp hết</p>
            <p className="text-2xl font-bold text-amber-600">{soSapHet}</p>
          </CardContent></Card>
          <Card className={soHet ? "border-red-500/50" : ""}><CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Hết hàng / tạm ngưng</p>
            <p className="text-2xl font-bold text-red-600">{soHet}</p>
          </CardContent></Card>
        </div>

        {thongKe && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bán hàng 30 ngày qua</CardTitle>
              <CardDescription>
                {laAdmin
                  ? "Số liệu của rạp đang chọn ở trên."
                  : "Số liệu của rạp bạn phụ trách."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Doanh thu bắp nước</p>
                    <p className="text-xl font-bold text-amber-600">{formatVND(thongKe.revenue30d)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Đơn vé có combo</p>
                    <p className="text-xl font-bold">{thongKe.orders30d}</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Bán chạy nhất</p>
                {thongKe.topItems.length ? (
                  <div className="space-y-1">
                    {thongKe.topItems.map((m) => (
                      <div key={m.combo_id} className="flex items-center justify-between text-sm">
                        <span>{m.name}</span>
                        <span className="text-muted-foreground">{m.so_suat} suất · {formatVND(m.doanh_thu)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Chưa bán được món nào trong 30 ngày qua.</p>}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Tồn kho tại rạp</CardTitle>
              <CardDescription>Sửa số tồn rồi bấm Lưu. Khách chỉ thấy món còn hàng của đúng rạp họ đặt vé.</CardDescription>
            </div>
            {/* Quản lý chi nhánh cũng thêm được món — nhưng chỉ cho rạp mình,
                và mọi thay đổi đều tự báo về quản trị viên (xem nhật ký bên dưới). */}
            <Button size="sm" onClick={() => moFormMon(null)}>
              <Plus className="mr-2 h-4 w-4" /> Thêm món
            </Button>
            {/* Admin KHÔNG có nút gửi yêu cầu — người nhận yêu cầu chính là họ.
                Chỉ quản lý chi nhánh mới gửi lên. */}
            {!laAdmin && (
              <Button size="sm" variant="outline" onClick={() => moYeuCau(null, "khac")}>
                <Send className="mr-2 h-4 w-4" /> Gửi yêu cầu khác
              </Button>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Món</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">Giá</TableHead>
                  <TableHead className="w-[130px]">Tồn kho</TableHead>
                  <TableHead className="w-[120px]">Ngưỡng báo</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kho.map((m) => (
                  <DongKho
                    key={m.id}
                    mon={m}
                    dangLuu={dangLuu === m.id}
                    laAdmin={laAdmin}
                    onLuu={(thayDoi) => luuKho(m, thayDoi)}
                    onXinThem={() => moYeuCau(m, "bo_sung_hang")}
                    onBaoHet={() => moYeuCau(m, "bao_het_hang")}
                    onSua={() => moFormMon(m)}
                    onXoa={() => setDangXoa(m)}
                  />
                ))}
                {!kho.length && !dangTai && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Chưa có dữ liệu tồn kho cho rạp này.
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-4 w-4" /> Yêu cầu gửi quản trị viên
              {!!choXuLy.length && <Badge variant="destructive">{choXuLy.length} chờ xử lý</Badge>}
            </CardTitle>
            <CardDescription>
              {laAdmin
                ? "Yêu cầu từ các chi nhánh. Duyệt yêu cầu bổ sung hàng sẽ cộng thẳng vào kho của rạp đó."
                : "Việc gấp bạn cứ xử lý trước tại rạp, yêu cầu này để quản trị viên nắm và cấp hàng."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!yeuCau.length && <p className="text-sm text-muted-foreground">Chưa có yêu cầu nào.</p>}
            {yeuCau.map((y) => (
              <div key={y.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium flex items-center gap-2">
                    {y.muc_do === "khan" && <Badge variant="destructive">KHẨN</Badge>}
                    {y.tieu_de}
                  </p>
                  <p className="text-muted-foreground">
                    {y.cinema_name} · {y.loai_nhan}
                    {y.combo_name ? ` · ${y.combo_name}` : ""}{y.so_luong ? ` × ${y.so_luong}` : ""}
                    {y.nguoi_gui_ten ? ` · gửi bởi ${y.nguoi_gui_ten}` : ""}
                  </p>
                  {y.noi_dung && <p className="text-xs text-muted-foreground mt-0.5">{y.noi_dung}</p>}
                  {y.phan_hoi && <p className="text-xs mt-0.5">Phản hồi: <strong>{y.phan_hoi}</strong></p>}
                  <p className="text-xs text-muted-foreground">{new Date(y.created_at).toLocaleString("vi-VN")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {y.trang_thai === "moi" ? (
                    laAdmin ? (
                      <Button size="sm" onClick={() => { setDangXuLy(y); setPhanHoi("") }}>Xử lý</Button>
                    ) : <Badge variant="secondary">Chờ duyệt</Badge>
                  ) : (
                    <Badge variant={y.trang_thai === "da_duyet" ? "default" : "secondary"}>
                      {y.trang_thai === "da_duyet" ? "Đã duyệt" : y.trang_thai === "tu_choi" ? "Từ chối" : "Đã xem"}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" /> Nhật ký hoạt động
            </CardTitle>
            <CardDescription>
              {laAdmin
                ? "Mọi thay đổi chi nhánh thực hiện — kể cả việc không cần duyệt. Quản trị viên nhận thông báo ngay khi có thay đổi."
                : "Các thay đổi bạn đã thực hiện. Quản trị viên được thông báo tự động, bạn không cần báo lại."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {!nhatKy.length && <p className="text-sm text-muted-foreground">Chưa có thay đổi nào được ghi nhận.</p>}
            {nhatKy.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{h.hanh_dong_nhan}</span>
                  {h.doi_tuong && <span className="text-muted-foreground"> — {h.doi_tuong}</span>}
                  {h.chi_tiet?.tonKhoCu != null && h.chi_tiet?.tonKhoMoi != null && h.chi_tiet.tonKhoCu !== h.chi_tiet.tonKhoMoi && (
                    <span className="text-muted-foreground"> · tồn kho {h.chi_tiet.tonKhoCu} → {h.chi_tiet.tonKhoMoi}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {laAdmin && <>{h.cinema_name} · </>}
                  {h.nguoi_thuc_hien || "—"} · {new Date(h.created_at).toLocaleString("vi-VN")}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>

      {/* Gửi yêu cầu */}
      <Dialog open={mo} onOpenChange={setMo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gửi yêu cầu cho quản trị viên</DialogTitle>
            <DialogDescription>{mon ? mon.name : "Yêu cầu chung của chi nhánh"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">Loại yêu cầu</Label>
              {/* Mở từ nút trên dòng món (Xin bổ sung / Báo hết hàng) thì loại đã
                  được quyết định — cho đổi sẽ sinh ra yêu cầu mâu thuẫn với chính
                  tiêu đề của nó. Chỉ nút 'Gửi yêu cầu khác' mới được chọn tự do. */}
              {mon ? (
                <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                  {NHAN_YEU_CAU[loai]}
                </div>
              ) : (
                <Select value={loai} onValueChange={(v) => setLoai(v as LoaiYeuCau)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="su_co">Sự cố tại rạp (đã xử lý)</SelectItem>
                    <SelectItem value="khac">Việc khác</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            {loai === "bo_sung_hang" && (
              <div>
                <Label className="mb-1.5 block">Số suất xin bổ sung</Label>
                <Input type="number" min={1} value={soLuong} onChange={(e) => setSoLuong(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Quản trị viên duyệt là số này được cộng thẳng vào kho rạp bạn.</p>
              </div>
            )}
            <div>
              <Label className="mb-1.5 block">Mức độ</Label>
              <Select value={mucDo} onValueChange={(v) => setMucDo(v as MucDo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="thap">Thấp</SelectItem>
                  <SelectItem value="binh_thuong">Bình thường</SelectItem>
                  <SelectItem value="khan">Khẩn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Tiêu đề</Label>
              <Input value={tieuDe} onChange={(e) => setTieuDe(e.target.value)} maxLength={200} />
            </div>
            <div>
              <Label className="mb-1.5 block">Nội dung (không bắt buộc)</Label>
              <Textarea rows={3} value={noiDung} onChange={(e) => setNoiDung(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMo(false)} disabled={dangGui}>Huỷ</Button>
            <Button onClick={guiYeuCau} disabled={dangGui || !tieuDe.trim()}>
              {dangGui && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />} Gửi yêu cầu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Thêm / sửa món trong menu — chỉ quản trị viên */}
      <Dialog open={moMon} onOpenChange={setMoMon}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{monSua ? "Sửa món" : "Thêm món vào menu"}</DialogTitle>
            <DialogDescription>
              Món có thể bán ở mọi rạp, hoặc chỉ riêng một rạp — mỗi chi nhánh có menu riêng.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">Tên món</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="vd: Gà rán 2 miếng" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">Giá (đ)</Label>
                <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="mb-1.5 block">Nhóm</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ComboInput["category"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="combo">Combo</SelectItem>
                    <SelectItem value="popcorn">Bắp rang</SelectItem>
                    <SelectItem value="drink">Nước</SelectItem>
                    <SelectItem value="snack">Đồ ăn vặt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {laAdmin ? (
            <div>
              <Label className="mb-1.5 block">Bán ở đâu</Label>
              <Select
                value={form.cinema_id ? String(form.cinema_id) : "all"}
                onValueChange={(v) => setForm({ ...form, cinema_id: v === "all" ? null : Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Mọi rạp (menu chung cả chuỗi)</SelectItem>
                  {cinemas.map((c) => <SelectItem key={c.id} value={String(c.id)}>Chỉ {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            ) : (
              <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                Món này chỉ bán tại rạp bạn quản lý. Muốn đưa vào menu chung cả chuỗi, hãy gửi yêu cầu cho quản trị viên.
              </p>
            )}
            <div>
              <Label className="mb-1.5 block">Mô tả (không bắt buộc)</Label>
              <Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1.5 block">Đường dẫn ảnh (không bắt buộc)</Label>
              <Input value={form.image_url || ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
            </div>
            {!monSua && (
              <p className="text-xs text-muted-foreground">
                Món mới bắt đầu với tồn kho 0 — nhập số hàng thật ở bảng phía trên khi hàng về.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoMon(false)} disabled={dangLuuMon}>Huỷ</Button>
            <Button onClick={luuMon} disabled={dangLuuMon || !form.name.trim() || form.price <= 0}>
              {dangLuuMon && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />} {monSua ? "Lưu" : "Thêm món"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Xác nhận xoá món */}
      <Dialog open={!!dangXoa} onOpenChange={(o) => !o && setDangXoa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá món khỏi menu?</DialogTitle>
            <DialogDescription>
              {dangXoa?.name} sẽ không còn trong menu. Món đã từng có trong đơn hàng sẽ không xoá được —
              khi đó hãy tắt "còn bán" thay vì xoá, để lịch sử đặt vé cũ vẫn tra ra tên món.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDangXoa(null)}>Huỷ</Button>
            <Button variant="destructive" onClick={xoaMon}>Xoá</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin xử lý yêu cầu */}
      <Dialog open={!!dangXuLy} onOpenChange={(o) => !o && setDangXuLy(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xử lý yêu cầu</DialogTitle>
            <DialogDescription>
              {dangXuLy && `${dangXuLy.cinema_name} · ${dangXuLy.loai_nhan}: ${dangXuLy.tieu_de}`}
            </DialogDescription>
          </DialogHeader>
          {dangXuLy?.loai === "bo_sung_hang" && (
            <Alert className="border-amber-500/50">
              <AlertDescription>
                Duyệt sẽ cộng <strong>{dangXuLy.so_luong} suất {dangXuLy.combo_name}</strong> vào kho của {dangXuLy.cinema_name}.
              </AlertDescription>
            </Alert>
          )}
          {dangXuLy?.noi_dung && <p className="text-sm text-muted-foreground">{dangXuLy.noi_dung}</p>}
          <div>
            <Label className="mb-1.5 block">Phản hồi cho chi nhánh (không bắt buộc)</Label>
            <Textarea rows={3} value={phanHoi} onChange={(e) => setPhanHoi(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => xuLyYeuCau("tu_choi")}>
              <XCircle className="mr-2 h-4 w-4" /> Từ chối
            </Button>
            <Button onClick={() => xuLyYeuCau("da_duyet")}>
              <CheckCircle className="mr-2 h-4 w-4" /> Duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Một dòng tồn kho — giữ state nháp riêng để gõ số không bị nhảy khi tải lại. */
function DongKho({
  mon, dangLuu, laAdmin, onLuu, onXinThem, onBaoHet, onSua, onXoa,
}: {
  mon: ComboStock
  dangLuu: boolean
  laAdmin: boolean
  onLuu: (thayDoi: { tonKho?: number; nguongCanhBao?: number; tamNgung?: boolean }) => void
  onXinThem: () => void
  onBaoHet: () => void
  onSua: () => void
  onXoa: () => void
}) {
  const [ton, setTon] = useState(String(mon.ton_kho))
  const [nguong, setNguong] = useState(String(mon.nguong_canh_bao))
  useEffect(() => { setTon(String(mon.ton_kho)); setNguong(String(mon.nguong_canh_bao)) }, [mon.ton_kho, mon.nguong_canh_bao])
  const doi = ton !== String(mon.ton_kho) || nguong !== String(mon.nguong_canh_bao)

  return (
    <TableRow className={mon.het_hang ? "opacity-70" : ""}>
      <TableCell className="font-medium">
        {mon.name}
        {mon.rap_rieng != null && (
          <Badge variant="outline" className="ml-2 border-blue-500/40 text-blue-600 dark:text-blue-400">riêng rạp này</Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{NHAN_LOAI[mon.category] || mon.category}</TableCell>
      <TableCell className="text-right whitespace-nowrap">{formatVND(mon.price)}</TableCell>
      <TableCell>
        <Input className="h-8" type="number" min={0} value={ton} onChange={(e) => setTon(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input className="h-8" type="number" min={0} value={nguong} onChange={(e) => setNguong(e.target.value)} />
      </TableCell>
      <TableCell>
        {mon.tam_ngung ? <Badge variant="secondary">Tạm ngưng</Badge>
          : !mon.ban_toan_chuoi ? <Badge variant="secondary">Chuỗi đã tắt</Badge>
          : mon.ton_kho === 0 ? <Badge variant="destructive">Hết hàng</Badge>
          : mon.sap_het ? <Badge className="bg-amber-500 text-white">Sắp hết</Badge>
          : <Badge className="bg-green-600 text-white">Còn hàng</Badge>}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {doi && (
            <Button size="sm" onClick={() => onLuu({ tonKho: Number(ton), nguongCanhBao: Number(nguong) })} disabled={dangLuu}>
              {dangLuu ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Lưu"}
            </Button>
          )}
          <Button size="sm" variant="ghost" title={mon.tam_ngung ? "Mở bán lại" : "Tạm ngưng bán món này"}
            onClick={() => onLuu({ tamNgung: !mon.tam_ngung })} disabled={dangLuu}>
            {mon.tam_ngung ? <PlayCircle className="h-4 w-4 text-green-600" /> : <PauseCircle className="h-4 w-4" />}
          </Button>
          {/* Gửi yêu cầu: chỉ quản lý chi nhánh (admin là người nhận) */}
          {!laAdmin && (
            <>
              <Button size="sm" variant="ghost" title="Xin bổ sung hàng" onClick={onXinThem}>
                <Send className="h-4 w-4 text-blue-600" />
              </Button>
              <Button size="sm" variant="ghost" title="Báo hết hàng cho quản trị viên" onClick={onBaoHet}>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </Button>
            </>
          )}
          {/* Món CHUNG cả chuỗi chỉ quản trị viên sửa; món RIÊNG của rạp thì
              quản lý chi nhánh tự sửa được (mon.rap_rieng != null). */}
          {(laAdmin || mon.rap_rieng != null) && (
            <>
              <Button size="sm" variant="ghost" title="Sửa món" onClick={onSua}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" title="Xoá món khỏi menu" onClick={onXoa}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
