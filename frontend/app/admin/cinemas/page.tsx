"use client"

export const dynamic = "force-dynamic"

import React, { useEffect, useState, useCallback } from "react"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Building2, Plus, Edit, Trash2, Search, MapPin, Armchair, LayoutGrid, CheckCircle, XCircle, RefreshCw } from "lucide-react"
import {
  listCinemasAdmin, createCinemaAdmin, updateCinemaAdmin, deleteCinemaAdmin,
  type AdminCinema as Cinema,
} from "@/lib/api/admin/cinemas"
import { clearCache } from "@/lib/fetch-cache"
import { useRequireAdmin } from "@/hooks/use-require-admin"
import { useCinemaScope } from "@/hooks/use-cinema-scope"

const EMPTY_FORM = { name: "", address: "", is_active: true }

export default function AdminCinemas() {
  const { loading: authLoading, allowed, forbidden } = useRequireAdmin()
  // Trang này đọc qua /api/cinemas — endpoint CÔNG KHAI (khách đặt vé cần thấy
  // đủ 3 rạp) nên nó luôn trả về cả chuỗi. Vì vậy phạm vi chi nhánh phải cắt ở
  // đây; backend đã chặn mọi thao tác GHI lên rạp khác, nhưng nếu vẫn liệt kê
  // đủ 3 rạp thì quản lý nhìn vào tưởng mình quản cả chuỗi.
  const { isManager, scopedCinemaId } = useCinemaScope()
  const [cinemas, setCinemas] = useState<Cinema[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Cinema | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Cinema | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const fetchCinemas = useCallback(async () => {
    setLoading(true)
    try {
      // QUAN TRỌNG: listCinemasAdmin() đọc qua getCinemas() — endpoint CÔNG
      // KHAI (/api/cinemas) dùng chung với trang đặt vé, được cache 10 phút
      // (ttl: 600) ở tầng client (lib/fetch-cache.ts) để trang đặt vé đỡ gọi
      // lại liên tục. Nhưng trang QUẢN LÝ rạp này gọi lại fetchCinemas() ngay
      // sau khi bật/tắt/sửa/xoá rạp để cập nhật UI — nếu không xoá cache
      // trước, request "tải lại" đó vẫn trúng cache CŨ, khiến switch bật/tắt
      // trên UI không phản ánh đúng trạng thái vừa đổi (trông như thao tác
      // "chưa có tác dụng" dù DB đã cập nhật đúng), và tệ hơn: bấm lần 2 sẽ
      // tính is_active MỚI dựa trên state CŨ, gửi nhầm ngược lại giá trị vừa
      // đổi (vd vừa đóng rạp thật, bấm mở lại nhưng do state cũ vẫn là "đang
      // mở" nên gửi lệnh đóng thêm lần nữa — không thể mở lại ngay được).
      clearCache("/api/cinemas")
      const all = await listCinemasAdmin()
      setCinemas(isManager && scopedCinemaId ? all.filter((c) => c.id === scopedCinemaId) : all)
    } catch (err) {
      // Log kèm lỗi gốc: thông báo trên giao diện chỉ hiện 4 giây rồi biến mất
      // và không nói được NGUYÊN NHÂN (mất mạng? 401 hết phiên? 500 phía server?).
      // Không có dòng này thì lúc web lỗi thật gần như không lần ra được.
      console.error("Tải danh sách rạp thất bại:", err)
      showAlert("error", "Không thể tải danh sách rạp")
    } finally {
      setLoading(false)
    }
  }, [isManager, scopedCinemaId])

  useEffect(() => { fetchCinemas() }, [fetchCinemas])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (c: Cinema) => {
    setEditing(c)
    setForm({ name: c.name, address: c.address, is_active: c.is_active })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.address.trim()) {
      showAlert("error", "Vui lòng nhập đầy đủ tên rạp và địa chỉ")
      return
    }
    setSaving(true)
    try {
      if (editing) await updateCinemaAdmin(editing.id, form)
      else await createCinemaAdmin(form)
      showAlert("success", editing ? `Đã cập nhật rạp "${form.name}"` : `Đã thêm rạp "${form.name}"`)
      setFormOpen(false)
      fetchCinemas()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể lưu")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const { message } = await deleteCinemaAdmin(deleteTarget.id)
      showAlert("success", message || `Đã xoá rạp "${deleteTarget.name}"`)
      setDeleteTarget(null)
      fetchCinemas()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể xoá")
      setDeleteTarget(null)
    }
  }

  const handleToggle = async (c: Cinema) => {
    const newValue = !c.is_active
    // QUAN TRỌNG: trước đây gọi fetchCinemas() (đặt loading=true) ngay sau
    // khi API thành công để cập nhật UI — nhưng fetchCinemas() khiến TOÀN BỘ
    // bảng (kể cả switch vừa bấm) bị THAY THẾ bằng dòng "Đang tải..." trong
    // lúc chờ round-trip mạng, rồi mới hiện lại — cảm giác switch "không
    // nhảy" vì nó biến mất rồi xuất hiện lại thay vì chuyển trạng thái mượt.
    // Cập nhật LẠC QUAN (optimistic) ngay lập tức trên state cục bộ, không
    // đợi mạng — nếu API lỗi thì hoàn tác lại đúng giá trị cũ.
    setCinemas((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: newValue } : x)))
    try {
      await updateCinemaAdmin(c.id, { is_active: newValue })
      showAlert("success", `${c.name}: ${newValue ? "đã mở cửa" : "đã tạm đóng"}`)
      clearCache("/api/cinemas")
    } catch (err) {
      console.error(`Đổi trạng thái rạp "${c.name}" (id ${c.id}) thất bại:`, err)
      setCinemas((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: c.is_active } : x)))
      showAlert("error", "Không thể thay đổi trạng thái")
    }
  }

  const filtered = cinemas.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.address.toLowerCase().includes(search.toLowerCase()),
  )

  const totalSeats = cinemas.reduce((s, c) => s + c.total_seats, 0)
  const totalScreens = cinemas.reduce((s, c) => s + c.screens, 0)
  const activeCount = cinemas.filter((c) => c.is_active).length

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }
  if (forbidden) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Không có quyền truy cập</div>
  }
  if (!allowed) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Building2 className="h-8 w-8 text-primary" /> Quản lý rạp chiếu
              </h1>
              <p className="text-muted-foreground mt-1">Quản lý thông tin và trạng thái các rạp phim</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchCinemas}>
                <RefreshCw className="h-4 w-4 mr-1" /> Làm mới
              </Button>
              {!isManager && (
                <Button onClick={openAdd}>
                  <Plus className="h-4 w-4 mr-2" /> Thêm rạp mới
                </Button>
              )}
            </div>
          </div>

          {alert && (
            <Alert className={`mb-4 ${alert.type === "success" ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              <AlertDescription>{alert.text}</AlertDescription>
            </Alert>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Tổng rạp", value: cinemas.length, icon: Building2, color: "text-blue-500" },
              { label: "Đang hoạt động", value: activeCount, icon: CheckCircle, color: "text-green-500" },
              { label: "Tổng phòng chiếu", value: totalScreens, icon: LayoutGrid, color: "text-purple-500" },
              { label: "Tổng ghế", value: totalSeats.toLocaleString("vi-VN"), icon: Armchair, color: "text-amber-500" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${s.color}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-sm mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Tìm theo tên hoặc địa chỉ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Danh sách rạp ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">ID</TableHead>
                      <TableHead>Tên rạp</TableHead>
                      <TableHead>Địa chỉ</TableHead>
                      <TableHead className="text-center">Phòng chiếu</TableHead>
                      <TableHead className="text-center">Tổng ghế</TableHead>
                      <TableHead className="text-center">Trạng thái</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Đang tải...</TableCell></TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Không tìm thấy rạp nào</TableCell></TableRow>
                    ) : filtered.map((cinema) => (
                      <TableRow key={cinema.id}>
                        <TableCell className="font-mono text-sm text-muted-foreground">{cinema.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium">{cinema.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[200px]">{cinema.address}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{cinema.screens}</TableCell>
                        <TableCell className="text-center">{cinema.total_seats.toLocaleString("vi-VN")}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch checked={cinema.is_active} onCheckedChange={() => handleToggle(cinema)} />
                            <Badge variant={cinema.is_active ? "default" : "secondary"} className={cinema.is_active ? "bg-green-500" : ""}>
                              {cinema.is_active ? "Hoạt động" : "Tạm đóng"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(cinema)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            {!isManager && (
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(cinema)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Chỉnh sửa rạp chiếu" : "Thêm rạp chiếu mới"}</DialogTitle>
            <DialogDescription>{editing ? `Cập nhật thông tin rạp #${editing.id}` : "Điền thông tin để tạo rạp chiếu mới"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tên rạp *</Label>
              <Input placeholder="VD: CinemaGold Quận 1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Địa chỉ *</Label>
              <Input placeholder="VD: 123 Nguyễn Huệ, Quận 1, TP.HCM" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Trạng thái</Label>
                <p className="text-xs text-muted-foreground">Rạp có đang hoạt động không?</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo rạp"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xoá rạp</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá rạp <strong>"{deleteTarget?.name}"</strong>?
              Hành động này không thể hoàn tác và sẽ xoá tất cả dữ liệu liên quan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={handleDelete}>Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
