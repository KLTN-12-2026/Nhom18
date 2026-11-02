"use client"

export const dynamic = "force-dynamic"

import React, { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/lib/auth"
import {
  Users, Search, RefreshCw, ShieldCheck, UserX, UserCheck, Crown, UserCircle, Lock, Unlock,
  ChevronLeft, ChevronRight, Building2,
} from "lucide-react"
import { getUsers, toggleUserBlock, updateUserRole, type UserStats } from "@/lib/api/admin/users"
import { getCinemas } from "@/lib/api/cinemas"
import type { Cinema } from "@/lib/api/types"

interface UserRecord {
  id: number
  full_name?: string | null
  first_name?: string
  last_name?: string
  username?: string
  email: string
  role: string
  is_blocked: boolean
  is_admin?: boolean
  created_at?: string
  last_login?: string
  /** Rạp phụ trách — chỉ có với vai trò cinema_manager. */
  cinema_id?: number | null
  cinema_name?: string | null
}

const roleMeta: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  admin: { label: "Admin", icon: Crown, className: "bg-amber-500 text-white" },
  cinema_manager: { label: "Quản lý rạp", icon: ShieldCheck, className: "bg-blue-500 text-white" },
  user: { label: "Người dùng", icon: UserCircle, className: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200" },
}

export default function AdminUsers() {
  const router = useRouter()
  const { user: me, loading: authLoading } = useAuth()

  // Trang quản lý người dùng chỉ dành cho admin thật (can_manage_users),
  // không phải mọi staff — backend cũng giới hạn /api/admin/users bằng
  // requireAdmin (chặt hơn requireStaff). Chỉ redirect về /login khi HOÀN
  // TOÀN chưa đăng nhập; nếu đã đăng nhập nhưng thiếu quyền, hiện thông báo
  // "không có quyền" thay vì redirect (tránh vòng lặp khó hiểu khi user đã
  // có session hợp lệ mà vẫn bị đẩy ra trang đăng nhập — cùng pattern đã sửa
  // ở admin/reports và admin/settings).
  useEffect(() => {
    if (!authLoading && !me) {
      router.push("/login")
    }
  }, [me, authLoading, router])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [blockTarget, setBlockTarget] = useState<UserRecord | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  // Thống kê lấy từ server (tính trên toàn bộ bảng users). Trước đây 4 ô này
  // được đếm từ mảng `users` của TRANG HIỆN TẠI nên sai ngay khi có nhiều hơn
  // 1 trang, và bị chặn cứng ở 200 (giới hạn mỗi trang).
  const [stats, setStats] = useState<UserStats>({ total: 0, admins: 0, blocked: 0, newThisMonth: 0 })
  // Danh sách rạp để gán cho quản lý chi nhánh
  const [cinemas, setCinemas] = useState<{ id: number; name: string }[]>([])
  const [assignTarget, setAssignTarget] = useState<{ userId: number; cinemaId: string } | null>(null)

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const fetchUsers = useCallback(async (targetPage = page) => {
    setLoading(true)
    try {
      const { users, pagination, stats: serverStats } = await getUsers(targetPage)
      setUsers(users)
      setTotalPages(pagination?.totalPages || 1)
      if (serverStats) setStats(serverStats)
    } catch (err) {
      console.error("Tải danh sách người dùng thất bại:", err)
      showAlert("error", "Không thể tải danh sách người dùng")
    } finally { setLoading(false) }
  }, [page])

  useEffect(() => {
    if (!authLoading) fetchUsers(page)
  }, [authLoading, page, fetchUsers])

  useEffect(() => {
    if (authLoading) return
    getCinemas()
      .then((list: Cinema[]) => setCinemas(list.map((c) => ({ id: c.id, name: c.name }))))
      .catch((err: unknown) => console.error("Tải danh sách rạp (để gán quản lý) thất bại:", err))
  }, [authLoading])

  const handleToggleBlock = async () => {
    if (!blockTarget) return
    try {
      await toggleUserBlock(blockTarget.id)
      showAlert("success", `${!blockTarget.is_blocked ? "Đã khóa" : "Đã mở khóa"} tài khoản ${blockTarget.email}`)
      setBlockTarget(null)
      fetchUsers()
    } catch (err) {
      console.error("Khoá/mở khoá tài khoản thất bại:", err)
      showAlert("error", "Không thể thay đổi trạng thái tài khoản")
      setBlockTarget(null)
    }
  }

  // Đổi sang "Quản lý rạp" thì PHẢI chọn rạp — backend bắt buộc, và một quản
  // lý chưa gán rạp sẽ bị chặn mọi thao tác. Nên mở hộp thoại chọn rạp thay vì
  // gửi thẳng rồi nhận lỗi.
  const handleRoleChange = async (userId: number, newRole: string) => {
    if (newRole === "cinema_manager") {
      setAssignTarget({ userId, cinemaId: String(cinemas[0]?.id ?? "") })
      return
    }
    try {
      await updateUserRole(userId, newRole, null)
      showAlert("success", "Đã cập nhật vai trò")
      fetchUsers()
    } catch (err) {
      console.error("Đổi vai trò người dùng thất bại:", err)
      showAlert("error", "Không thể thay đổi vai trò")
    }
  }

  const confirmAssignManager = async () => {
    if (!assignTarget?.cinemaId) return
    try {
      await updateUserRole(assignTarget.userId, "cinema_manager", Number(assignTarget.cinemaId))
      const ten = cinemas.find((c) => String(c.id) === assignTarget.cinemaId)?.name || ""
      showAlert("success", `Đã đặt làm quản lý rạp ${ten}`)
      setAssignTarget(null)
      fetchUsers()
    } catch (err) {
      console.error("Gán rạp cho quản lý thất bại:", err)
      showAlert("error", "Không thể gán rạp cho quản lý")
    }
  }

  const filtered = users.filter((u) => {
    const name = [u.full_name, u.first_name, u.last_name, u.username].filter(Boolean).join(" ").toLowerCase()
    const matchSearch = name.includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === "all" || u.role === roleFilter
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? !u.is_blocked : u.is_blocked)
    return matchSearch && matchRole && matchStatus
  })


  const getName = (u: UserRecord) => {
    if (u.full_name) return u.full_name
    if (u.first_name || u.last_name) return `${u.first_name || ""} ${u.last_name || ""}`.trim()
    return u.username || "—"
  }

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Đang kiểm tra quyền...</p>
    </div>
  )
  if (me && !me.can_manage_users) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Không có quyền truy cập</div>
  }
  if (!me?.can_manage_users) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Users className="h-8 w-8 text-primary" /> Quản lý người dùng
              </h1>
              <p className="text-muted-foreground mt-1">Xem và quản lý tài khoản người dùng hệ thống</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchUsers()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Làm mới
            </Button>
          </div>

          {alert && (
            <Alert className={`mb-4 ${alert.type === "success" ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              <AlertDescription>{alert.text}</AlertDescription>
            </Alert>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Tổng người dùng", value: stats.total, icon: Users, color: "text-blue-500" },
              { label: "Quản trị viên", value: stats.admins, icon: Crown, color: "text-amber-500" },
              { label: "Mới tháng này", value: stats.newThisMonth, icon: UserCheck, color: "text-green-500" },
              { label: "Đã khóa", value: stats.blocked, icon: UserX, color: "text-red-500" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${s.color}`}><s.icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm theo tên hoặc email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Vai trò" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả vai trò</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="cinema_manager">Quản lý rạp</SelectItem>
                <SelectItem value="user">Người dùng</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="active">Đang hoạt động</SelectItem>
                <SelectItem value="blocked">Đã khóa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Danh sách người dùng ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Họ tên</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Vai trò</TableHead>
                      <TableHead>Ngày đăng ký</TableHead>
                      <TableHead className="text-center">Trạng thái</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Đang tải...</TableCell></TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Không tìm thấy người dùng nào</TableCell></TableRow>
                    ) : filtered.map((u) => {
                      const rm = roleMeta[u.role] || roleMeta.user
                      const RoleIcon = rm.icon
                      const isMe = me?.id === u.id
                      return (
                        <TableRow key={u.id} className={u.is_blocked ? "opacity-60" : ""}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{u.id}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-primary">
                                  {getName(u).charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-sm">{getName(u)}</p>
                                {isMe && <p className="text-xs text-primary">(Tài khoản của bạn)</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                          <TableCell>
                            {isMe ? (
                              <Badge className={rm.className}>
                                <RoleIcon className="h-3 w-3 mr-1" />{rm.label}
                              </Badge>
                            ) : (
                              <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v)}>
                                <SelectTrigger className="h-7 w-36 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="cinema_manager">Quản lý rạp</SelectItem>
                                  <SelectItem value="user">Người dùng</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            {/* Quản lý rạp phải thấy rõ mình phụ trách chi nhánh nào —
                                nếu không, admin nhìn danh sách không phân biệt được
                                2 quản lý của 2 rạp khác nhau. */}
                            {u.role === "cinema_manager" && (
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Building2 className="h-3 w-3 shrink-0" />
                                {u.cinema_name || <span className="text-amber-600">Chưa gán rạp</span>}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString("vi-VN") : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={u.is_blocked ? "destructive" : "outline"} className={!u.is_blocked ? "border-green-500 text-green-600" : ""}>
                              {u.is_blocked ? "Đã khóa" : "Hoạt động"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {!isMe && u.role !== "admin" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={u.is_blocked ? "text-green-600 hover:text-green-700" : "text-red-500 hover:text-red-600"}
                                onClick={() => setBlockTarget(u)}
                              >
                                {u.is_blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                                <span className="ml-1 text-xs">{u.is_blocked ? "Mở khóa" : "Khóa"}</span>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4 mr-1" /> Trước
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                      Sau <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Block/Unblock Confirm */}
      <AlertDialog open={!!blockTarget} onOpenChange={(o) => !o && setBlockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{blockTarget?.is_blocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}</AlertDialogTitle>
            <AlertDialogDescription>
              {blockTarget?.is_blocked
                ? `Cho phép "${blockTarget?.email}" đăng nhập và sử dụng hệ thống trở lại?`
                : `Ngăn "${blockTarget?.email}" đăng nhập vào hệ thống?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className={blockTarget?.is_blocked ? "bg-green-600 hover:bg-green-700" : "bg-red-500 hover:bg-red-600"}
              onClick={handleToggleBlock}
            >
              {blockTarget?.is_blocked ? "Mở khóa" : "Khóa tài khoản"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chọn rạp khi đặt ai đó làm quản lý chi nhánh */}
      <AlertDialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quản lý này phụ trách rạp nào?</AlertDialogTitle>
            <AlertDialogDescription>
              Quản lý chi nhánh chỉ xem và thao tác được trên <b>đúng rạp được gán</b>:
              suất chiếu, đơn đặt vé và doanh thu của rạp đó. Họ không xem được dữ liệu
              rạp khác, không quản lý người dùng và không sửa được cài đặt hệ thống.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2">
            <Select
              value={assignTarget?.cinemaId || ""}
              onValueChange={(v) => setAssignTarget((p) => (p ? { ...p, cinemaId: v } : p))}
            >
              <SelectTrigger><SelectValue placeholder="Chọn rạp" /></SelectTrigger>
              <SelectContent>
                {cinemas.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cinemas.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">
                Chưa có rạp nào trong hệ thống — hãy tạo rạp trước ở mục “Quản lý rạp chiếu”.
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAssignManager} disabled={!assignTarget?.cinemaId}>
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
