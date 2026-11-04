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
import { Tag, Plus, Edit, Trash2, RefreshCw, Percent, Coins, Cake, Send, Users, PlayCircle } from "lucide-react"
import {
  getAdminVouchers, createAdminVoucher, updateAdminVoucher, deleteAdminVoucher, type Voucher,
} from "@/lib/api/vouchers"
import {
  getBirthdayOverview, runBirthdayCheckNow, sendBirthdayToUser, type BirthdayOverview,
} from "@/lib/api/admin/birthday"
import { useRequireAdmin } from "@/hooks/use-require-admin"

function toDatetimeLocal(iso: string) {
  // Đổi mốc thời gian ISO (UTC) sang GIỜ ĐỊA PHƯƠNG cho input datetime-local.
  //
  // KHÔNG được cắt chuỗi bằng iso.slice(0,16) như trước: cột valid_from/
  // valid_until là DATETIME, driver đọc ra Date theo giờ địa phương rồi res.json
  // serialize sang UTC — ở múi giờ VN (UTC+7) mốc 19:15 trong DB trả về API
  // thành "...T12:15:56.000Z". Cắt chuỗi sẽ hiện 12:15 lên form, và khi admin
  // bấm Lưu thì chính 12:15 đó được ghi đè xuống DB. Tức là MỖI LẦN sửa voucher
  // (dù chỉ đổi mô tả) đều làm khung thời gian hiệu lực LÙI 7 TIẾNG, sửa vài
  // lần là voucher hết hạn sớm hơn hẳn ý định ban đầu.
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const EMPTY_FORM = {
  code: "", description: "", discount_type: "percent" as "percent" | "fixed",
  discount_value: 10, max_discount_amount: "" as number | "", min_order_amount: 0,
  usage_limit: "" as number | "", per_user_limit: 1 as number | "",
  valid_from: toDatetimeLocal(new Date().toISOString()),
  valid_until: toDatetimeLocal(new Date(Date.now() + 30 * 86400000).toISOString()),
  is_active: true,
  is_birthday_voucher: false,
}

export default function AdminVouchers() {
  const { loading: authLoading, allowed, forbidden } = useRequireAdmin({ adminOnly: true })
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Voucher | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Voucher | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Chương trình sinh nhật — phần điều khiển thủ công (kết hợp với job tự
  // động chạy mỗi giờ ở backend, xem birthdayVoucher.service.js)
  const [birthday, setBirthday] = useState<BirthdayOverview | null>(null)
  const [birthdayLoading, setBirthdayLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [sendingUserId, setSendingUserId] = useState<number | null>(null)

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const fetchVouchers = useCallback(async () => {
    setLoading(true)
    try {
      setVouchers(await getAdminVouchers())
    } catch (err) {
      console.error("Tải danh sách mã giảm giá thất bại:", err)
      showAlert("error", "Không thể tải danh sách mã giảm giá")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchBirthday = useCallback(async () => {
    setBirthdayLoading(true)
    try {
      setBirthday(await getBirthdayOverview())
    } catch (err) {
      console.error("Tải dữ liệu chương trình sinh nhật thất bại:", err)
      showAlert("error", "Không thể tải dữ liệu chương trình sinh nhật")
    } finally {
      setBirthdayLoading(false)
    }
  }, [])

  useEffect(() => { fetchVouchers(); fetchBirthday() }, [fetchVouchers, fetchBirthday])

  const handleRunBirthdayCheck = async () => {
    setRunning(true)
    try {
      const result = await runBirthdayCheckNow()
      showAlert("success", result.message)
      fetchBirthday()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể chạy kiểm tra sinh nhật")
    } finally {
      setRunning(false)
    }
  }

  const handleSendBirthday = async (userId: number) => {
    setSendingUserId(userId)
    try {
      const result = await sendBirthdayToUser(userId)
      showAlert("success", result.message)
      fetchBirthday()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể gửi ưu đãi sinh nhật")
    } finally {
      setSendingUserId(null)
    }
  }

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFormOpen(true) }

  const openEdit = (v: Voucher) => {
    setEditing(v)
    setForm({
      code: v.code, description: v.description, discount_type: v.discount_type,
      discount_value: v.discount_value, max_discount_amount: v.max_discount_amount ?? "",
      min_order_amount: v.min_order_amount, usage_limit: v.usage_limit ?? "",
      per_user_limit: v.per_user_limit ?? "", valid_from: toDatetimeLocal(v.valid_from),
      valid_until: toDatetimeLocal(v.valid_until), is_active: !!v.is_active,
      is_birthday_voucher: !!v.is_birthday_voucher,
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.code.trim() || !form.description.trim() || !form.discount_value || !form.valid_from || !form.valid_until) {
      showAlert("error", "Vui lòng nhập đầy đủ thông tin bắt buộc")
      return
    }
    if (form.discount_type === "percent" && (form.discount_value <= 0 || form.discount_value > 100)) {
      showAlert("error", "Phần trăm giảm giá phải trong khoảng 1-100")
      return
    }
    if (new Date(form.valid_until) <= new Date(form.valid_from)) {
      showAlert("error", "Hạn dùng phải sau ngày bắt đầu hiệu lực")
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        max_discount_amount: form.max_discount_amount === "" ? null : Number(form.max_discount_amount),
        usage_limit: form.usage_limit === "" ? null : Number(form.usage_limit),
        per_user_limit: form.per_user_limit === "" ? null : Number(form.per_user_limit),
      }
      if (editing) await updateAdminVoucher(editing.id, payload)
      else await createAdminVoucher(payload)
      showAlert("success", editing ? `Đã cập nhật mã "${form.code}"` : `Đã tạo mã "${form.code}"`)
      setFormOpen(false)
      fetchVouchers()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể lưu mã giảm giá")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteAdminVoucher(deleteTarget.id)
      showAlert("success", `Đã xoá mã "${deleteTarget.code}"`)
      setDeleteTarget(null)
      fetchVouchers()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể xoá")
      setDeleteTarget(null)
    }
  }

  const handleToggleActive = async (v: Voucher) => {
    const newValue = !v.is_active
    setVouchers((prev) => prev.map((x) => (x.id === v.id ? { ...x, is_active: newValue } : x)))
    try {
      await updateAdminVoucher(v.id, { is_active: newValue })
    } catch (err) {
      console.error("Đổi trạng thái mã giảm giá thất bại:", err)
      setVouchers((prev) => prev.map((x) => (x.id === v.id ? { ...x, is_active: v.is_active } : x)))
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
                <Tag className="h-8 w-8 text-primary" /> Mã giảm giá
              </h1>
              <p className="text-muted-foreground mt-1">Tạo và quản lý mã giảm giá/khuyến mãi cho khách hàng</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchVouchers}>
                <RefreshCw className="h-4 w-4 mr-1" /> Làm mới
              </Button>
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4 mr-2" /> Tạo mã mới
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
              <CardTitle className="text-base">Danh sách mã ({vouchers.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã</TableHead>
                      <TableHead>Mô tả</TableHead>
                      <TableHead className="text-center">Giảm giá</TableHead>
                      <TableHead className="text-center">Đơn tối thiểu</TableHead>
                      <TableHead className="text-center">Đã dùng</TableHead>
                      <TableHead className="text-center">Hạn dùng</TableHead>
                      <TableHead className="text-center">Trạng thái</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Đang tải...</TableCell></TableRow>
                    ) : vouchers.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Chưa có mã giảm giá nào</TableCell></TableRow>
                    ) : vouchers.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold">{v.code}</span>
                            {!!v.is_birthday_voucher && (
                              <Badge variant="outline" className="gap-1 border-pink-400 text-pink-500 dark:text-pink-400">
                                <Cake className="h-3 w-3" /> Sinh nhật
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{v.description}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1 text-sm">
                            {v.discount_type === "percent" ? <Percent className="h-3 w-3" /> : <Coins className="h-3 w-3" />}
                            {v.discount_type === "percent" ? `${v.discount_value}%` : `${Number(v.discount_value).toLocaleString("vi-VN")}đ`}
                            {v.max_discount_amount != null && <span className="text-xs text-muted-foreground">(tối đa {Number(v.max_discount_amount).toLocaleString("vi-VN")}đ)</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm">{Number(v.min_order_amount).toLocaleString("vi-VN")}đ</TableCell>
                        <TableCell className="text-center text-sm">{v.used_count}{v.usage_limit != null ? ` / ${v.usage_limit}` : ""}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{new Date(v.valid_until).toLocaleDateString("vi-VN")}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch checked={!!v.is_active} onCheckedChange={() => handleToggleActive(v)} />
                            <Badge variant={v.is_active ? "default" : "secondary"} className={v.is_active ? "bg-green-500" : ""}>
                              {v.is_active ? "Bật" : "Tắt"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(v)}>
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

          {/* ── Chương trình sinh nhật (tự động + thủ công) ────────────── */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cake className="h-4.5 w-4.5 text-pink-500" /> Chương trình sinh nhật
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tự động chúc mừng + gửi ưu đãi mỗi giờ (job nền); các nút dưới đây để can thiệp thủ công khi cần.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchBirthday}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Làm mới
                  </Button>
                  <Button size="sm" onClick={handleRunBirthdayCheck} disabled={running}>
                    <PlayCircle className="h-3.5 w-3.5 mr-1" /> {running ? "Đang chạy..." : "Chạy kiểm tra ngay"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {!birthday?.activeVoucher && !birthdayLoading && (
                <Alert className="border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  <AlertDescription>
                    Chưa có mã nào được bật "Mã ưu đãi sinh nhật" ở trên — bật ít nhất 1 mã để chương trình gửi được ưu đãi thật.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Sinh nhật hôm nay</p>
                  <p className="text-xl font-bold mt-0.5">{birthday?.todayBirthdays.length ?? "—"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Chưa khai ngày sinh</p>
                  <p className="text-xl font-bold mt-0.5 flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-muted-foreground" /> {birthday?.missingDobCount ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Mã đang dùng cho chương trình</p>
                  <p className="text-sm font-mono font-semibold mt-1">{birthday?.activeVoucher?.code || "Chưa có"}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">🎉 Sinh nhật hôm nay ({birthday?.todayBirthdays.length ?? 0})</p>
                {birthdayLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Đang tải...</p>
                ) : !birthday?.todayBirthdays.length ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">Hôm nay không có ai sinh nhật</p>
                ) : (
                  <div className="space-y-1.5">
                    {birthday.todayBirthdays.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{u.full_name || u.username}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => handleSendBirthday(u.id)}
                          disabled={sendingUserId === u.id}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />
                          {sendingUserId === u.id ? "Đang gửi..." : "Gửi ngay"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Đã gửi gần đây</p>
                {birthdayLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Đang tải...</p>
                ) : !birthday?.recentGreetings.length ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">Chưa gửi ưu đãi sinh nhật cho ai</p>
                ) : (
                  <div className="overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Người dùng</TableHead>
                          <TableHead>Mã đã gửi</TableHead>
                          <TableHead className="text-right">Thời gian</TableHead>
                          <TableHead className="text-right">Gửi lại</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {birthday.recentGreetings.map((g) => (
                          <TableRow key={g.id}>
                            <TableCell>
                              <p className="text-sm font-medium">{g.full_name || g.username}</p>
                              <p className="text-xs text-muted-foreground">{g.email}</p>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{g.data?.voucherCode || "—"}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(g.created_at).toLocaleString("vi-VN")}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => handleSendBirthday(g.user_id)}
                                disabled={sendingUserId === g.user_id}
                              >
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Chỉnh sửa mã giảm giá" : "Tạo mã giảm giá mới"}</DialogTitle>
            <DialogDescription>{editing ? `Cập nhật mã #${editing.id}` : "Điền thông tin để tạo mã giảm giá mới"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Mã code *</Label>
              <Input placeholder="VD: SUMMER2026" value={form.code} disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-2">
              <Label>Mô tả *</Label>
              <Input placeholder="VD: Giảm 10% cho đơn hàng đầu tiên" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Loại giảm giá *</Label>
                <select className="w-full border rounded-md h-9 px-3 bg-background text-sm"
                  value={form.discount_type}
                  onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as "percent" | "fixed" }))}>
                  <option value="percent">Phần trăm (%)</option>
                  <option value="fixed">Số tiền cố định (đ)</option>
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
              <Label>Đơn hàng tối thiểu (đ)</Label>
              <Input type="number" value={form.min_order_amount}
                onChange={(e) => setForm((f) => ({ ...f, min_order_amount: Number(e.target.value) }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tổng lượt dùng — để trống nếu không giới hạn</Label>
                <Input type="number" value={form.usage_limit}
                  onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value === "" ? "" : Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Lượt dùng/khách — để trống nếu không giới hạn</Label>
                <Input type="number" value={form.per_user_limit}
                  onChange={(e) => setForm((f) => ({ ...f, per_user_limit: e.target.value === "" ? "" : Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Hiệu lực từ *</Label>
                <Input type="datetime-local" value={form.valid_from}
                  onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Hết hạn *</Label>
                <Input type="datetime-local" value={form.valid_until}
                  onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Kích hoạt ngay</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-pink-300/60 bg-pink-500/5 px-3 py-2">
              <div>
                <Label className="flex items-center gap-1.5"><Cake className="h-3.5 w-3.5 text-pink-500" /> Mã ưu đãi sinh nhật</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Chỉ dùng được trong tháng sinh nhật của khách (theo ngày sinh khai trong hồ sơ); lượt dùng/khách sẽ tự làm mới mỗi năm</p>
              </div>
              <Switch checked={form.is_birthday_voucher} onCheckedChange={(v) => setForm((f) => ({ ...f, is_birthday_voucher: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo mã"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xoá mã giảm giá</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá mã <strong>"{deleteTarget?.code}"</strong>? Hành động này không thể hoàn tác.
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
