"use client"

export const dynamic = "force-dynamic"

import React, { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth"
import { ADMIN_MENU_ITEMS, DASHBOARD_WIDGETS, HOMEPAGE_SECTIONS, MOVIE_DETAIL_SECTIONS, USER_FEATURES, getHiddenItems, setItemHidden } from "@/lib/admin-menu-prefs"
import {
  Settings, Globe, ShoppingCart, Phone, Shield, CheckCircle, XCircle,
  Loader2, RefreshCw, Save, AlertTriangle, EyeOff, ChevronDown, KeyRound, Lock,
} from "lucide-react"
import { getSettings, updateSettings, checkBackendHealth } from "@/lib/api/admin/settings"

type SettingsData = {
  site_name: string
  site_description: string
  maintenance_mode: boolean
  booking_enabled: boolean
  max_seats_per_booking: number
  contact_email: string
  support_phone: string
  terms_conditions: string
}

const DEFAULT: SettingsData = {
  site_name: "",
  site_description: "",
  maintenance_mode: false,
  booking_enabled: true,
  max_seats_per_booking: 10,
  contact_email: "",
  support_phone: "",
  terms_conditions: "",
}

const UI_PANEL_PIN = "300304"

export default function AdminSettings() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [settings, setSettings] = useState<SettingsData>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking")
  const [hiddenUiItems, setHiddenUiItemsState] = useState<string[]>([])

  // Khung "Ẩn/hiện chức năng" thu gọn theo mặc định, cần nhập mã PIN để mở ra dùng
  const [panelUnlocked, setPanelUnlocked] = useState(false)
  const [pinInput, setPinInput] = useState("")
  const [pinError, setPinError] = useState("")

  useEffect(() => {
    setHiddenUiItemsState(getHiddenItems())
  }, [])

  const toggleUiItem = (key: string, show: boolean) => {
    setItemHidden(key, !show)
    setHiddenUiItemsState(getHiddenItems())
  }

  const handleUnlockPanel = (e: React.FormEvent) => {
    e.preventDefault()
    if (pinInput === UI_PANEL_PIN) {
      setPanelUnlocked(true)
      setPinInput("")
      setPinError("")
    } else {
      setPinError("Mã PIN không đúng")
    }
  }

  const handleLockPanel = () => {
    setPanelUnlocked(false)
    setPinInput("")
    setPinError("")
  }

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 5000)
  }

  const checkBackend = useCallback(async () => {
    setBackendStatus("checking")
    const ok = await checkBackendHealth()
    setBackendStatus(ok ? "online" : "offline")
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const settings = await getSettings()
      // Spread KHÔNG thay được giá trị null: cột nào đang NULL trong DB (hiện
      // là terms_conditions) sẽ đè null lên giá trị mặc định "", và ô nhập nhận
      // value={null} bị React coi là input KHÔNG kiểm soát — gõ vào rồi lưu có
      // thể mất nội dung. Thay từng null bằng đúng mặc định của nó.
      const merged = { ...DEFAULT, ...settings } as Record<string, unknown>
      for (const key of Object.keys(DEFAULT)) {
        if (merged[key] === null || merged[key] === undefined) {
          merged[key] = (DEFAULT as Record<string, unknown>)[key]
        }
      }
      setSettings(merged as SettingsData)
    } catch (err) {
      console.error("Tải cài đặt hệ thống thất bại:", err)
      showAlert("error", "Không thể tải cài đặt hệ thống")
    } finally { setLoading(false) }
  }, [])

  // Không được gọi các API cài đặt/health (đều yêu cầu quyền admin) trước khi
  // biết chắc user có can_manage_users hay không — nếu không, nhân viên
  // không đủ quyền vẫn kích hoạt request tới endpoint bảo vệ (và thấy toast
  // lỗi 403) ngay khi trang vừa load, trước khi màn "không có quyền" kịp
  // hiện ra. Với user không đủ quyền, tắt loading ngay để tránh spinner
  // treo mãi (fetchSettings vốn là nơi duy nhất set loading=false).
  useEffect(() => {
    if (authLoading) return
    if (!user?.can_manage_users) { setLoading(false); return }
    fetchSettings()
    checkBackend()
  }, [authLoading, user?.can_manage_users, fetchSettings, checkBackend])

  // Chỉ redirect về /login khi HOÀN TOÀN chưa đăng nhập — nếu đã đăng nhập
  // nhưng không đủ quyền (không phải admin), giữ nguyên trang và hiện thông
  // báo "không có quyền" bên dưới thay vì redirect (redirect về /login khi
  // đã đăng nhập rồi sẽ gây vòng lặp khó hiểu cho người dùng).
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
    }
  }, [user, authLoading, router])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings(settings)
      showAlert("success", "Đã lưu cài đặt hệ thống thành công!")
    } catch (e: any) {
      showAlert("error", e.message || "Không thể lưu cài đặt")
    } finally { setSaving(false) }
  }

  const set = (key: keyof SettingsData) => (value: any) =>
    setSettings((s) => ({ ...s, [key]: value }))

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex">
          <AdminSidebar />
          <main className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </main>
        </div>
      </div>
    )
  }

  if (!user?.can_manage_users) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex">
          <AdminSidebar />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Chỉ admin mới có quyền chỉnh sửa cài đặt hệ thống</p>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Settings className="h-8 w-8 text-primary" /> Cài đặt hệ thống
              </h1>
              <p className="text-muted-foreground mt-1">Quản lý cấu hình và hoạt động của ứng dụng</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={checkBackend}>
                <RefreshCw className="h-4 w-4 mr-1" /> Kiểm tra hệ thống
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {saving ? "Đang lưu..." : "Lưu cài đặt"}
              </Button>
            </div>
          </div>

          {alert && (
            <Alert className={`mb-6 ${alert.type === "success" ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              {alert.type === "success" ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <AlertDescription>{alert.text}</AlertDescription>
            </Alert>
          )}

          <div className="max-w-3xl space-y-6">

            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-5 w-5 text-primary" /> Trạng thái hệ thống
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    {backendStatus === "checking" ? (
                      <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                    ) : backendStatus === "online" ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">Backend API</p>
                      <Badge variant="outline" className={
                        backendStatus === "online" ? "text-green-600 border-green-500"
                        : backendStatus === "offline" ? "text-red-600 border-red-500"
                        : "text-amber-600 border-amber-500"
                      }>
                        {backendStatus === "online" ? "Online" : backendStatus === "offline" ? "Offline" : "Đang kiểm tra..."}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    {settings.maintenance_mode ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <CheckCircle className="h-5 w-5 text-green-500" />}
                    <div>
                      <p className="text-sm font-medium">Chế độ bảo trì</p>
                      <Badge variant="outline" className={settings.maintenance_mode ? "text-amber-600 border-amber-500" : "text-green-600 border-green-500"}>
                        {settings.maintenance_mode ? "Đang bảo trì" : "Bình thường"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                    {settings.booking_enabled ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                    <div>
                      <p className="text-sm font-medium">Đặt vé</p>
                      <Badge variant="outline" className={settings.booking_enabled ? "text-green-600 border-green-500" : "text-red-600 border-red-500"}>
                        {settings.booking_enabled ? "Đang mở" : "Đã tắt"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* General Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-5 w-5 text-primary" /> Thông tin chung
                </CardTitle>
                <CardDescription>Thông tin cơ bản hiển thị trên website</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tên trang web</Label>
                  <Input placeholder="VD: CinemaGold" value={settings.site_name} onChange={(e) => set("site_name")(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Mô tả</Label>
                  <Textarea
                    placeholder="Mô tả ngắn về website..."
                    value={settings.site_description}
                    onChange={(e) => set("site_description")(e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Booking Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-5 w-5 text-primary" /> Cài đặt đặt vé
                </CardTitle>
                <CardDescription>Kiểm soát tính năng mua vé của người dùng</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div>
                    <Label className="text-sm font-medium">Cho phép đặt vé</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Bật/tắt tính năng đặt vé toàn hệ thống</p>
                  </div>
                  <Switch checked={settings.booking_enabled} onCheckedChange={set("booking_enabled")} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div>
                    <Label className="text-sm font-medium flex items-center gap-2">
                      Chế độ bảo trì
                      {settings.maintenance_mode && <Badge className="bg-amber-500 text-white text-xs">Đang bật</Badge>}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Tạm khóa toàn bộ tính năng với người dùng thường</p>
                  </div>
                  <Switch checked={settings.maintenance_mode} onCheckedChange={set("maintenance_mode")} />
                </div>
                <div className="space-y-2">
                  <Label>Số ghế tối đa mỗi lần đặt</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={settings.max_seats_per_booking}
                      onChange={(e) => set("max_seats_per_booking")(parseInt(e.target.value) || 1)}
                      className="w-32"
                    />
                    <p className="text-sm text-muted-foreground">ghế / đơn</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Phone className="h-5 w-5 text-primary" /> Thông tin liên hệ
                </CardTitle>
                <CardDescription>Thông tin hỗ trợ hiển thị với khách hàng</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Email hỗ trợ</Label>
                  <Input type="email" placeholder="support@cinemago.vn" value={settings.contact_email} onChange={(e) => set("contact_email")(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Số điện thoại hỗ trợ</Label>
                  <Input placeholder="1900 xxxx" value={settings.support_phone} onChange={(e) => set("support_phone")(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Điều khoản & Điều kiện</Label>
                  <Textarea
                    placeholder="Nội dung điều khoản sử dụng dịch vụ..."
                    value={settings.terms_conditions}
                    onChange={(e) => set("terms_conditions")(e.target.value)}
                    rows={6}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Ẩn/hiện chức năng UI — thu gọn mặc định, cần mã PIN để mở */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <EyeOff className="h-5 w-5 text-primary" /> Ẩn/hiện chức năng trên giao diện
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Tắt = ẩn khỏi giao diện cho gọn, nhưng chức năng phía sau vẫn hoạt động bình thường (route, API không bị khoá).
                      Chỉ là tuỳ chọn hiển thị lưu trên trình duyệt này, không phải phân quyền.
                    </CardDescription>
                  </div>
                  {panelUnlocked && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleLockPanel} className="shrink-0">
                      <ChevronDown className="h-4 w-4 mr-1 rotate-180 transition-transform" /> Thu gọn
                    </Button>
                  )}
                </div>
              </CardHeader>

              {!panelUnlocked ? (
                <CardContent>
                  <form onSubmit={handleUnlockPanel} className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock className="h-4 w-4" /> Nhập mã PIN 6 số để mở khung này
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="••••••"
                        value={pinInput}
                        onChange={(e) => { setPinInput(e.target.value); setPinError("") }}
                        className="max-w-[160px] text-center tracking-widest"
                        autoFocus={false}
                      />
                      <Button type="submit" size="sm">
                        <KeyRound className="h-4 w-4 mr-1.5" /> Mở khoá
                      </Button>
                    </div>
                    {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                  </form>
                </CardContent>
              ) : (
                <CardContent className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sidebar quản trị</p>
                    <div className="space-y-2">
                      {ADMIN_MENU_ITEMS.map((item) => {
                        const visible = !hiddenUiItems.includes(item.key)
                        return (
                          <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border">
                            <Label className="text-sm font-medium">{item.label}</Label>
                            <Switch checked={visible} onCheckedChange={(v) => toggleUiItem(item.key, v)} />
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Khối trên Dashboard</p>
                    <div className="space-y-2">
                      {DASHBOARD_WIDGETS.map((item) => {
                        const visible = !hiddenUiItems.includes(item.key)
                        return (
                          <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border">
                            <Label className="text-sm font-medium">{item.label}</Label>
                            <Switch checked={visible} onCheckedChange={(v) => toggleUiItem(item.key, v)} />
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Khối trên Trang chủ</p>
                    <div className="space-y-2">
                      {HOMEPAGE_SECTIONS.map((item) => {
                        const visible = !hiddenUiItems.includes(item.key)
                        return (
                          <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border">
                            <Label className="text-sm font-medium">{item.label}</Label>
                            <Switch checked={visible} onCheckedChange={(v) => toggleUiItem(item.key, v)} />
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Khối trên Trang chi tiết phim</p>
                    <div className="space-y-2">
                      {MOVIE_DETAIL_SECTIONS.map((item) => {
                        const visible = !hiddenUiItems.includes(item.key)
                        return (
                          <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border">
                            <Label className="text-sm font-medium">{item.label}</Label>
                            <Switch checked={visible} onCheckedChange={(v) => toggleUiItem(item.key, v)} />
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tính năng người dùng</p>
                    <div className="space-y-2">
                      {USER_FEATURES.map((item) => {
                        const visible = !hiddenUiItems.includes(item.key)
                        return (
                          <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border">
                            <Label className="text-sm font-medium">{item.label}</Label>
                            <Switch checked={visible} onCheckedChange={(v) => toggleUiItem(item.key, v)} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Save button at bottom */}
            <div className="flex justify-end pb-4">
              <Button onClick={handleSave} disabled={saving} size="lg">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {saving ? "Đang lưu..." : "Lưu tất cả cài đặt"}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
