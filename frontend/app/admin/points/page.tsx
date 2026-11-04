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
import { Gift, Plus, Edit, Trash2, RefreshCw, Percent, Coins, Star } from "lucide-react"
import {
  listPointRewardsAdmin, createPointRewardAdmin, updatePointRewardAdmin, deletePointRewardAdmin,
  type AdminPointReward,
} from "@/lib/api/admin/points"
import { useRequireAdmin } from "@/hooks/use-require-admin"

const EMPTY_FORM = {
  title: "", description: "", points_cost: 100,
  discount_type: "fixed" as "percent" | "fixed", discount_value: 15000,
  max_discount_amount: "" as number | "", validity_days: 30, is_active: true,
}

export default function AdminPoints() {
  const { loading: authLoading, allowed, forbidden } = useRequireAdmin({ adminOnly: true })
  const [rewards, setRewards] = useState<AdminPointReward[]>([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminPointReward | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminPointReward | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const fetchRewards = useCallback(async () => {
    setLoading(true)
    try {
      setRewards(await listPointRewardsAdmin())
    } catch (err) {
      console.error("Tải danh sách phần thưởng đổi điểm thất bại:", err)
      showAlert("error", "Không thể tải danh sách phần thưởng")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRewards() }, [fetchRewards])

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFormOpen(true) }

  const openEdit = (r: AdminPointReward) => {
    setEditing(r)
    setForm({
      title: r.title, description: r.description, points_cost: r.points_cost,
      discount_type: r.discount_type, discount_value: r.discount_value,
      max_discount_amount: r.max_discount_amount ?? "", validity_days: r.validity_days,
      is_active: !!r.is_active,
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.description.trim() || !form.points_cost || !form.discount_value) {
      showAlert("error", "Vui lòng nhập đầy đủ thông tin bắt buộc")
      return
    }
    if (form.discount_type === "percent" && (form.discount_value <= 0 || form.discount_value > 100)) {
      showAlert("error", "Phần trăm giảm giá phải trong khoảng 1-100")
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        max_discount_amount: form.max_discount_amount === "" ? null : Number(form.max_discount_amount),
      }
      if (editing) await updatePointRewardAdmin(editing.id, payload)
      else await createPointRewardAdmin(payload)
      showAlert("success", editing ? `Đã cập nhật "${form.title}"` : `Đã tạo phần thưởng "${form.title}"`)
      setFormOpen(false)
      fetchRewards()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể lưu phần thưởng")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deletePointRewardAdmin(deleteTarget.id)
      showAlert("success", `Đã xoá "${deleteTarget.title}"`)
      setDeleteTarget(null)
      fetchRewards()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể xoá")
      setDeleteTarget(null)
    }
  }

  const handleToggleActive = async (r: AdminPointReward) => {
    const newValue = !r.is_active
    setRewards((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: newValue } : x)))
    try {
      await updatePointRewardAdmin(r.id, { is_active: newValue })
    } catch (err) {
      console.error(`Đổi trạng thái phần thưởng "${r.title}" (id ${r.id}) thất bại:`, err)
      setRewards((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: r.is_active } : x)))
      showAlert("error", "Không thể thay đổi trạng thái")
    }
  }

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>
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
                <Gift className="h-8 w-8 text-primary" /> Điểm thưởng &amp; đổi ưu đãi
              </h1>
              <p className="text-muted-foreground mt-1">
                Quản lý danh mục phần thưởng đổi điểm. Người dùng tích 1 điểm/10.000đ khi đặt vé và +20 điểm khi đánh giá được duyệt.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchRewards}>
                <RefreshCw className="h-4 w-4 mr-1" /> Làm mới
              </Button>
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4 mr-2" /> Tạo phần thưởng
              </Button>
            </div>
          </div>

          {alert && (
            <Alert className={`mb-4 ${alert.type === "success" ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              <AlertDescription>{alert.text}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Danh mục phần thưởng ({rewards.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phần thưởng</TableHead>
                      <TableHead className="text-center">Giá (điểm)</TableHead>
                      <TableHead className="text-center">Giá trị giảm</TableHead>
                      <TableHead className="text-center">Hiệu lực</TableHead>
                      <TableHead className="text-center">Trạng thái</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Đang tải...</TableCell></TableRow>
                    ) : rewards.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Chưa có phần thưởng nào</TableCell></TableRow>
                    ) : rewards.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <p className="font-medium">{r.title}</p>
                          <p className="text-xs text-muted-foreground max-w-[280px] truncate">{r.description}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 font-mono text-sm">
                            <Star className="h-3.5 w-3.5 text-amber-500" /> {r.points_cost}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1 text-sm">
                            {r.discount_type === "percent" ? <Percent className="h-3 w-3" /> : <Coins className="h-3 w-3" />}
                            {r.discount_type === "percent" ? `${r.discount_value}%` : `${Number(r.discount_value).toLocaleString("vi-VN")}đ`}
                            {r.max_discount_amount != null && <span className="text-xs text-muted-foreground">(tối đa {Number(r.max_discount_amount).toLocaleString("vi-VN")}đ)</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm">{r.validity_days} ngày</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch checked={!!r.is_active} onCheckedChange={() => handleToggleActive(r)} />
                            <Badge variant={r.is_active ? "default" : "secondary"} className={r.is_active ? "bg-green-500" : ""}>
                              {r.is_active ? "Bật" : "Tắt"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(r)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Chỉnh sửa phần thưởng" : "Tạo phần thưởng mới"}</DialogTitle>
            <DialogDescription>{editing ? `Cập nhật phần thưởng #${editing.id}` : "Điền thông tin để thêm vào danh mục đổi điểm"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Tên phần thưởng *</Label>
              <Input placeholder="VD: Giảm 15.000đ" value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Mô tả *</Label>
              <Input placeholder="VD: Đổi 150 điểm lấy mã giảm 15.000đ" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Số điểm cần đổi *</Label>
              <Input type="number" min={1} value={form.points_cost}
                onChange={(e) => setForm((f) => ({ ...f, points_cost: Number(e.target.value) }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Loại giảm giá *</Label>
                <select className="w-full border rounded-md h-9 px-3 bg-background text-sm"
                  value={form.discount_type}
                  onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as "percent" | "fixed" }))}>
                  <option value="fixed">Số tiền cố định (đ)</option>
                  <option value="percent">Phần trăm (%)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Giá trị giảm *</Label>
                <Input type="number" value={form.discount_value}
                  onChange={(e) => setForm((f) => ({ ...f, discount_value: Number(e.target.value) }))} />
              </div>
            </div>
            {form.discount_type === "percent" && (
              <div className="space-y-2">
                <Label>Giảm tối đa (đ) — để trống nếu không giới hạn</Label>
                <Input type="number" value={form.max_discount_amount}
                  onChange={(e) => setForm((f) => ({ ...f, max_discount_amount: e.target.value === "" ? "" : Number(e.target.value) }))} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Hiệu lực voucher (số ngày sau khi đổi)</Label>
              <Input type="number" min={1} value={form.validity_days}
                onChange={(e) => setForm((f) => ({ ...f, validity_days: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Hiển thị cho người dùng</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo phần thưởng"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xoá phần thưởng</AlertDialogTitle>
            <AlertDialogDescription>
              Xoá <strong>"{deleteTarget?.title}"</strong> khỏi danh mục? Các voucher đã đổi trước đó vẫn giữ nguyên hiệu lực, chỉ ngừng cho đổi mới.
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
