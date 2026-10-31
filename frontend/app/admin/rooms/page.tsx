"use client"

export const dynamic = "force-dynamic"

import React, { useEffect, useState, useCallback, useMemo } from "react"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { LayoutGrid, Plus, Edit, Trash2, Search, Armchair, Building2, CheckCircle, RefreshCw } from "lucide-react"
import {
  listRoomsAdmin, createRoomAdmin, updateRoomAdmin, deleteRoomAdmin,
  type AdminRoom,
} from "@/lib/api/admin/rooms"
import { getCinemas } from "@/lib/api/cinemas"
import type { Cinema } from "@/lib/api/types"
import { useRequireAdmin } from "@/hooks/use-require-admin"
import {
  RoomSeatPreview, ChuThichHangGhe, layBoCuc, NHAN_HANG, hangCuaDongGhe,
} from "@/components/admin/room-seat-preview"

const ROOM_TYPES: Record<string, string> = {
  standard: "Tiêu chuẩn",
  vip: "VIP",
  imax: "IMAX",
  "4dx": "4DX",
}

const EMPTY_FORM = { cinema_id: "", room_name: "", total_seats: 100, room_type: "standard", features: "", is_active: true }

export default function AdminRooms() {
  const { loading: authLoading, allowed, forbidden } = useRequireAdmin({ adminOnly: true })
  const [rooms, setRooms] = useState<AdminRoom[]>([])
  const [cinemas, setCinemas] = useState<Cinema[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [cinemaFilter, setCinemaFilter] = useState("all")
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminRoom | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminRoom | null>(null)
  // Phòng đang mở sơ đồ lớn. Mặc định chưa chọn — chọn sẵn phòng đầu tiên
  // sẽ gây nhảy layout mỗi lần đổi bộ lọc.
  const [phongDangXem, setPhongDangXem] = useState<AdminRoom | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [roomList, cinemaList] = await Promise.all([listRoomsAdmin(), getCinemas()])
      setRooms(roomList)
      setCinemas(cinemaList)
    } catch (err) {
      console.error("Tải danh sách phòng chiếu / rạp thất bại:", err)
      showAlert("error", "Không thể tải danh sách phòng chiếu")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (r: AdminRoom) => {
    setEditing(r)
    setForm({
      cinema_id: String(r.cinema_id),
      room_name: r.room_name,
      total_seats: r.total_seats,
      room_type: r.room_type,
      features: (r.features || []).join(", "),
      is_active: r.is_active,
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.cinema_id) {
      showAlert("error", "Vui lòng chọn rạp")
      return
    }
    if (!form.room_name.trim()) {
      showAlert("error", "Vui lòng nhập tên phòng")
      return
    }
    if (!Number.isFinite(form.total_seats) || form.total_seats <= 0) {
      showAlert("error", "Sức chứa phải lớn hơn 0")
      return
    }

    const features = form.features.split(",").map((f) => f.trim()).filter(Boolean)

    setSaving(true)
    try {
      if (editing) {
        await updateRoomAdmin(editing.id, {
          room_name: form.room_name,
          total_seats: form.total_seats,
          room_type: form.room_type,
          features,
          is_active: form.is_active,
        })
        showAlert("success", `Đã cập nhật phòng "${form.room_name}"`)
      } else {
        await createRoomAdmin({
          cinema_id: Number(form.cinema_id),
          room_name: form.room_name,
          total_seats: form.total_seats,
          room_type: form.room_type,
          features,
        })
        showAlert("success", `Đã thêm phòng "${form.room_name}"`)
      }
      setFormOpen(false)
      fetchAll()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể lưu")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteRoomAdmin(deleteTarget.id)
      showAlert("success", `Đã ngừng hoạt động phòng "${deleteTarget.room_name}"`)
      setDeleteTarget(null)
      fetchAll()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể xoá")
      setDeleteTarget(null)
    }
  }

  const handleToggle = async (r: AdminRoom) => {
    const newValue = !r.is_active
    setRooms((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: newValue } : x)))
    try {
      await updateRoomAdmin(r.id, { is_active: newValue })
      showAlert("success", `${r.room_name}: ${newValue ? "đã bật lại" : "đã ngừng hoạt động"}`)
    } catch (err) {
      console.error(`Đổi trạng thái phòng "${r.room_name}" (id ${r.id}) thất bại:`, err)
      setRooms((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: r.is_active } : x)))
      showAlert("error", "Không thể thay đổi trạng thái")
    }
  }

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      const matchesCinema = cinemaFilter === "all" || String(r.cinema_id) === cinemaFilter
      const matchesSearch = r.room_name.toLowerCase().includes(search.toLowerCase())
        || (r.cinema_name || "").toLowerCase().includes(search.toLowerCase())
      return matchesCinema && matchesSearch
    })
  }, [rooms, cinemaFilter, search])

  const totalSeats = rooms.reduce((s, r) => s + (r.total_seats || 0), 0)
  const activeCount = rooms.filter((r) => r.is_active).length
  const cinemasWithRooms = new Set(rooms.map((r) => r.cinema_id)).size

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

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <LayoutGrid className="h-8 w-8 text-primary" /> Quản lý phòng chiếu
              </h1>
              <p className="text-muted-foreground mt-1">Quản lý các phòng chiếu (screen) thuộc từng rạp</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchAll}>
                <RefreshCw className="h-4 w-4 mr-1" /> Làm mới
              </Button>
              <Button onClick={openAdd} disabled={cinemas.length === 0}>
                <Plus className="h-4 w-4 mr-2" /> Thêm phòng mới
              </Button>
            </div>
          </div>

          {alert && (
            <Alert className={`mb-4 ${alert.type === "success" ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              <AlertDescription>{alert.text}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Tổng phòng", value: rooms.length, icon: LayoutGrid, color: "text-blue-500" },
              { label: "Đang hoạt động", value: activeCount, icon: CheckCircle, color: "text-green-500" },
              { label: "Rạp có phòng", value: cinemasWithRooms, icon: Building2, color: "text-purple-500" },
              { label: "Tổng sức chứa", value: totalSeats.toLocaleString("vi-VN"), icon: Armchair, color: "text-amber-500" },
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

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm theo tên phòng hoặc rạp..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={cinemaFilter} onValueChange={setCinemaFilter}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi rạp</SelectItem>
                {cinemas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* ── BẢNG ĐIỀU KHIỂN PHÒNG CHIẾU ────────────────────────
              Ba cột: chọn phòng · nhìn sơ đồ · đọc số liệu. Bảng chữ trước đây
              không cho biết phòng to hay nhỏ, bố trí mấy hàng, hạng ghế ra sao. */}
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">

            {/* ── CỘT TRÁI: danh sách phòng ───────────────────────── */}
            <Card className="h-fit xl:sticky xl:top-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Phòng chiếu ({filtered.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 px-3 pb-3">
                {loading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>
                ) : filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Không tìm thấy phòng chiếu nào</p>
                ) : (
                  filtered.map((room) => {
                    const bc = layBoCuc(room.total_seats)
                    const dangChon = phongDangXem?.id === room.id
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => setPhongDangXem(room)}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                          dangChon
                            ? "border-primary bg-primary/10"
                            : "border-transparent bg-muted/40 hover:bg-muted"
                        } ${room.is_active ? "" : "opacity-55"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{room.room_name}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {ROOM_TYPES[room.room_type] || room.room_type}
                          </Badge>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {room.cinema_name || `#${room.cinema_id}`}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Armchair className="h-3 w-3" />
                          {room.total_seats} ghế · {bc.rows.length}×{bc.seatsPerRow}
                          {!room.is_active && <span className="ml-auto">Ngừng</span>}
                        </div>
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* ── CỘT GIỮA: sơ đồ ghế lớn ─────────────────────────── */}
            <Card className="overflow-hidden">
              {!phongDangXem ? (
                <CardContent className="flex min-h-[420px] items-center justify-center">
                  <p className="text-sm text-muted-foreground">Chọn một phòng bên trái để xem sơ đồ ghế.</p>
                </CardContent>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-primary/10 px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{phongDangXem.room_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {ROOM_TYPES[phongDangXem.room_type] || phongDangXem.room_type}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {phongDangXem.cinema_name || `#${phongDangXem.cinema_id}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(phongDangXem)} title="Sửa phòng">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="text-red-500 hover:text-red-600"
                        onClick={() => setDeleteTarget(phongDangXem)} title="Xoá phòng"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <CardContent className="bg-gradient-to-b from-primary/5 to-transparent py-6">
                    <RoomSeatPreview totalSeats={phongDangXem.total_seats} size="full" />
                    <div className="mt-5 flex justify-center">
                      <ChuThichHangGhe />
                    </div>
                  </CardContent>
                </>
              )}
            </Card>

            {/* ── CỘT PHẢI: số liệu phòng đang chọn ───────────────── */}
            <div className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
              {!phongDangXem ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Chưa chọn phòng
                  </CardContent>
                </Card>
              ) : (() => {
                const bc = layBoCuc(phongDangXem.total_seats)
                const demHang: Record<string, number> = { standard: 0, vip: 0, premium: 0 }
                bc.rows.forEach((_, i) => { demHang[hangCuaDongGhe(i, bc.rows.length)] += 1 })
                const gheVe = bc.rows.length * bc.seatsPerRow
                return (
                  <>
                    <Card>
                      <CardContent className="pt-6">
                        <p className="text-xs text-muted-foreground">Sức chứa</p>
                        <p className="text-3xl font-bold tabular-nums">
                          {phongDangXem.total_seats.toLocaleString("vi-VN")}
                          <span className="ml-1 text-sm font-normal text-muted-foreground">ghế</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Bố trí {bc.rows.length} hàng × {bc.seatsPerRow} ghế
                        </p>
                        {gheVe !== Number(phongDangXem.total_seats) && (
                          <p className="mt-1 text-xs text-amber-600">
                            Sơ đồ chỉ xếp được {gheVe} ghế — lệch {Math.abs(gheVe - Number(phongDangXem.total_seats))} ghế
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Phân bổ hạng ghế</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2.5">
                        {(Object.keys(NHAN_HANG) as Array<keyof typeof NHAN_HANG>).map((k) => {
                          const ghe = demHang[k] * bc.seatsPerRow
                          const pct = gheVe > 0 ? Math.round((ghe / gheVe) * 100) : 0
                          return (
                            <div key={k}>
                              <div className="flex items-center justify-between text-xs">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className={`inline-block h-2.5 w-2.5 rounded-sm ${NHAN_HANG[k].mau}`} />
                                  {NHAN_HANG[k].ten}
                                </span>
                                <span className="tabular-nums text-muted-foreground">{ghe} ghế · {pct}%</span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                                <div className={`h-full rounded-full ${NHAN_HANG[k].mau}`} style={{ width: `${pct}%` }} />
                              </div>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{NHAN_HANG[k].moTa}</p>
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Trạng thái &amp; tiện ích</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <label className="flex cursor-pointer select-none items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {phongDangXem.is_active ? "Đang hoạt động" : "Đã ngừng"}
                          </span>
                          <Switch
                            checked={phongDangXem.is_active}
                            onCheckedChange={() => {
                              handleToggle(phongDangXem)
                              setPhongDangXem({ ...phongDangXem, is_active: !phongDangXem.is_active })
                            }}
                          />
                        </label>
                        <div className="flex flex-wrap gap-1 border-t pt-3">
                          {(phongDangXem.features || []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">Chưa khai báo tiện ích</span>
                          ) : (
                            phongDangXem.features.map((f) => (
                              <Badge key={f} variant="secondary" className="text-[10px] font-normal">{f}</Badge>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )
              })()}
            </div>
          </div>
        </main>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Chỉnh sửa phòng chiếu" : "Thêm phòng chiếu mới"}</DialogTitle>
            <DialogDescription>{editing ? `Cập nhật thông tin phòng #${editing.id}` : "Điền thông tin để tạo phòng chiếu mới"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rạp *</Label>
              {editing ? (
                <p className="text-sm text-muted-foreground py-2">{editing.cinema_name} — không thể đổi rạp sau khi tạo</p>
              ) : (
                <Select value={form.cinema_id} onValueChange={(v) => setForm((f) => ({ ...f, cinema_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Chọn rạp" /></SelectTrigger>
                  <SelectContent>
                    {cinemas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tên phòng *</Label>
              <Input placeholder="VD: Phòng 1, Sala A..." value={form.room_name} onChange={(e) => setForm((f) => ({ ...f, room_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sức chứa (số ghế) *</Label>
                <Input type="number" min={1} value={form.total_seats} onChange={(e) => setForm((f) => ({ ...f, total_seats: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Loại phòng</Label>
                <Select value={form.room_type} onValueChange={(v) => setForm((f) => ({ ...f, room_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROOM_TYPES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tiện ích</Label>
              <Input
                placeholder="VD: Dolby Atmos, Ghế đôi, 3D (cách nhau bằng dấu phẩy)"
                value={form.features}
                onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
              />
            </div>
            {editing && (
              <div className="flex items-center justify-between">
                <div>
                  <Label>Trạng thái</Label>
                  <p className="text-xs text-muted-foreground">Phòng có đang hoạt động không?</p>
                </div>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo phòng"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận ngừng hoạt động phòng</AlertDialogTitle>
            <AlertDialogDescription>
              Phòng <strong>"{deleteTarget?.room_name}"</strong> sẽ được chuyển sang trạng thái ngừng
              hoạt động (không xoá vĩnh viễn, để không ảnh hưởng lịch sử suất chiếu/vé đã bán liên quan).
              Bạn có thể bật lại bất cứ lúc nào.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={handleDelete}>Ngừng hoạt động</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
