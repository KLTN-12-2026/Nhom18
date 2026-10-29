"use client"

export const dynamic = "force-dynamic"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getMyRefunds, getMyVouchers, chonKenhHoanTien,
  type MyRefund, type MyVoucher, type CauHinhHoanTien,
} from "@/lib/api/my-refunds"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth"
import {
  User, Lock, Save, Eye, EyeOff, Gift, Star, Percent, Coins,
  ArrowUpCircle, ArrowDownCircle, Copy, Check, Ticket, Wallet, CheckCircle2, Clock3, AlertCircle,
} from "lucide-react"
import { getProfile, updateProfile, sendChangePasswordCode, changePassword } from "@/lib/api/auth"
import { ApiError } from "@/lib/api/client"
import { formatVND } from "@/lib/utils"
import { kiemTraSoDienThoai } from "@/lib/phone-vn"
import {
  getPointsBalance, getPointsHistory, getPointRewards, redeemPointReward,
  type PointTransaction, type PointReward,
} from "@/lib/api/points"

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  
  const [activeTab, setActiveTab] = useState(
    tabParam === "password" ? "password"
      : tabParam === "points" ? "points"
      // Thông báo huỷ suất dẫn thẳng vào đây — khách cần chỗ CHỌN cách nhận
      // tiền, không phải trang xem vé đã huỷ.
      : tabParam === "refunds" ? "refunds"
      : "profile"
  )
  
  const [profileData, setProfileData] = useState({
    username: "",
    email: "",
    phone: "",
    date_of_birth: "",
    first_name: "",
    last_name: ""
  })
  // Email gốc đã tải từ server — dùng để phát hiện user có ĐANG đổi email
  // không, vì đổi email là hành động nhạy cảm cần xác thực lại mật khẩu
  // (backend bắt buộc currentPassword khi email !== email hiện tại, tránh
  // 1 phiên đăng nhập bị rò rỉ tạm thời biến thành chiếm tài khoản vĩnh viễn).
  const [originalEmail, setOriginalEmail] = useState("")
  const [emailChangePassword, setEmailChangePassword] = useState("")
  const [showEmailChangePassword, setShowEmailChangePassword] = useState(false)

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  })
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null)

  // Bước xác thực mã khi đổi mật khẩu: "form" = đang điền, "code" = đã gửi mã chờ xác nhận
  const [pwStep, setPwStep] = useState<"form" | "code">("form")
  const [pwCode, setPwCode] = useState("")

  // Tab "Điểm thưởng" — gộp chung vào trang tài khoản thay vì 1 trang /points
  // riêng, vì đây vẫn là thông tin thuộc về tài khoản của user.
  const [pointsBalance, setPointsBalance] = useState(0)
  const [pointsHistory, setPointsHistory] = useState<PointTransaction[]>([])
  const [pointRewards, setPointRewards] = useState<PointReward[]>([])
  const [pointsLoading, setPointsLoading] = useState(true)
  const [refunds, setRefunds] = useState<MyRefund[]>([])
  const [myVouchers, setMyVouchers] = useState<MyVoucher[]>([])
  const [refundLoading, setRefundLoading] = useState(true)
  // Số vé đã đặt hiện trên thẻ tài khoản. Đếm từ chính API vé của khách thay
  // vì thêm một endpoint thống kê mới cho đúng một con số.
  const [soVeDaDat, setSoVeDaDat] = useState(0)
  const [refundCauHinh, setRefundCauHinh] = useState<CauHinhHoanTien>({ la_thu_nghiem: false, ghi_chu_thu_nghiem: null })
  const [dangChonKenh, setDangChonKenh] = useState<number | null>(null)
  const [refundMessage, setRefundMessage] = useState<string | null>(null)
  const [redeemTarget, setRedeemTarget] = useState<PointReward | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [resultCode, setResultCode] = useState<{ code: string; validUntil: string } | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  useEffect(() => {
    // Chờ AuthProvider xác minh xong token — tránh đá về /login khi user
    // vẫn đang null lúc đầu (chưa đọc xong sessionStorage) dù đã đăng nhập.
    if (authLoading) return

    if (!user) {
      router.push("/login")
      return
    }

    // Hoàn tiền + mã cá nhân. Tải song song với hồ sơ, lỗi ở đây không được
    // làm hỏng cả trang — khách vẫn phải xem/sửa được thông tin cá nhân.
    import("@/lib/api/tickets")
      .then((m) => m.getMyTickets())
      .then((ds: any) => setSoVeDaDat(Array.isArray(ds) ? ds.length : 0))
      .catch(() => setSoVeDaDat(0))

    Promise.all([getMyRefunds(), getMyVouchers()])
      .then(([r, v]) => { setRefunds(r.refunds); setRefundCauHinh(r.cauHinh); setMyVouchers(v) })
      .catch(() => { setRefunds([]); setMyVouchers([]) })
      .finally(() => setRefundLoading(false))

    // Load user profile
    const loadProfile = async () => {
      try {
        const profileUser = await getProfile()
        // Tên hiển thị lấy từ full_name (tên thật người dùng nhập lúc đăng ký),
        // KHÔNG parse từ username (username là định danh đăng nhập, không phải tên thật)
        const nameParts = (profileUser.full_name || "").trim().split(/\s+/).filter(Boolean)
        setProfileData({
          username: profileUser.username,
          email: profileUser.email,
          phone: profileUser.phone || "",
          // date_of_birth là cột DATE, mysql2 (dateStrings:["DATE"]) trả về sẵn
          // dạng chuỗi "YYYY-MM-DD" nên gán thẳng được cho input type="date".
          date_of_birth: profileUser.date_of_birth || "",
          first_name: nameParts[0] || "",
          last_name: nameParts.slice(1).join(" ") || ""
        })
        setOriginalEmail(profileUser.email)
      } catch (error) {
        console.error("Error loading profile:", error)
      }
    }

    loadProfile()
    fetchPoints()
  }, [user, authLoading, router])

  const fetchPoints = async () => {
    setPointsLoading(true)
    try {
      const [b, h, r] = await Promise.all([getPointsBalance(), getPointsHistory(30), getPointRewards()])
      setPointsBalance(b)
      setPointsHistory(h)
      setPointRewards(r)
    } catch {
      // im lặng — tab điểm thưởng tự hiện "Đang tải..." mãi nếu lỗi, không chặn phần hồ sơ chính
    } finally {
      setPointsLoading(false)
    }
  }

  const handleRedeem = async () => {
    if (!redeemTarget) return
    setRedeeming(true)
    try {
      const result = await redeemPointReward(redeemTarget.id)
      setResultCode({ code: result.code, validUntil: result.validUntil })
      setRedeemTarget(null)
      fetchPoints()
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Không thể đổi điểm"
      setMessage({ type: "error", text })
    } finally {
      setRedeeming(false)
    }
  }

  const handleCopyCode = async () => {
    if (!resultCode) return
    try {
      await navigator.clipboard.writeText(resultCode.code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch { /* clipboard bị chặn — mã vẫn hiện sẵn để copy tay */ }
  }

  function rewardValueText(r: PointReward) {
    if (r.discount_type === "percent") {
      return `Giảm ${r.discount_value}%${r.max_discount_amount ? ` (tối đa ${formatVND(r.max_discount_amount)})` : ""}`
    }
    return `Giảm ${formatVND(r.discount_value)}`
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setLoading(true)

    const emailChanged = profileData.email !== originalEmail
    if (emailChanged && !emailChangePassword) {
      setMessage({ type: "error", text: "Vui lòng nhập mật khẩu hiện tại để đổi email" })
      setLoading(false)
      return
    }

    // Chặn lưu khi số điện thoại sai định dạng — để lọt vào CSDL thì lúc rạp
    // cần gọi báo sự cố cho khách mới phát hiện, đã muộn.
    const kt = kiemTraSoDienThoai(profileData.phone)
    if (!kt.hopLe) {
      setMessage({ type: "error", text: kt.loi || "Số điện thoại không hợp lệ" })
      setLoading(false)
      return
    }

    try {
      const fullName = `${profileData.first_name} ${profileData.last_name}`.trim()
      await updateProfile({
        username: profileData.username,
        email: profileData.email,
        // Lưu dạng đã chuẩn hoá (10 chữ số, không dấu cách) để mọi nơi đọc ra
        // cùng một định dạng, dù khách gõ "+84 905 123 456" hay "0905-123-456".
        phone: kt.soChuan,
        date_of_birth: profileData.date_of_birth || undefined,
        full_name: fullName,
        ...(emailChanged ? { currentPassword: emailChangePassword } : {}),
      })

      setEmailChangePassword("")
      setOriginalEmail(profileData.email)
      setMessage({ type: "success", text: "Cập nhật thông tin thành công!" })

      // Update user data in sessionStorage (auth now uses sessionStorage)
      const rawUserData = sessionStorage.getItem("user_data") || localStorage.getItem("user_data") || "{}"
      const userData = JSON.parse(rawUserData)
      userData.full_name = fullName
      userData.first_name = profileData.first_name
      userData.last_name = profileData.last_name
      userData.email = profileData.email
      sessionStorage.setItem("user_data", JSON.stringify(userData))
      localStorage.removeItem("user_data")

      // Reload page to update header
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Lỗi kết nối. Vui lòng thử lại."
      setMessage({ type: "error", text })
    } finally {
      setLoading(false)
    }
  }

  // Bước 1: kiểm tra mật khẩu hợp lệ, gửi mã xác thực về email
  const handleSendPasswordCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: "error", text: "Mật khẩu xác nhận không khớp!" })
      return
    }

    // Khớp với backend: 8 ký tự, hoa, thường, số, ký tự đặc biệt
    const p = passwordData.newPassword
    const errors: string[] = []
    if (p.length < 8)                        errors.push("ít nhất 8 ký tự")
    if (!/[A-Z]/.test(p))                    errors.push("1 chữ HOA")
    if (!/[a-z]/.test(p))                    errors.push("1 chữ thường")
    if (!/[0-9]/.test(p))                    errors.push("1 chữ số")
    if (!/[!@#$%^&*()_+\-=\[\]{}|;':",.<>?/`~\\]/.test(p)) errors.push("1 ký tự đặc biệt (!@#$...)")
    if (errors.length > 0) {
      setMessage({ type: "error", text: `Mật khẩu phải có: ${errors.join(", ")}` })
      return
    }

    setLoading(true)

    try {
      await sendChangePasswordCode(passwordData.currentPassword)
      setMessage({ type: "success", text: "Mã xác thực đã được gửi đến email của bạn" })
      setPwStep("code")
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Lỗi kết nối. Vui lòng thử lại."
      setMessage({ type: "error", text })
    } finally {
      setLoading(false)
    }
  }

  // Bước 2: xác nhận mã + đổi mật khẩu
  const handleConfirmPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!pwCode.trim()) {
      setMessage({ type: "error", text: "Vui lòng nhập mã xác thực" })
      return
    }

    setLoading(true)

    try {
      await changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
        code: pwCode.trim(),
      })

      setMessage({ type: "success", text: "Đổi mật khẩu thành công! Vui lòng đăng nhập lại." })
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" })
      setPwCode("")
      setPwStep("form")

      // Logout after 2 seconds — đổi mật khẩu giờ thu hồi token cũ ở phía
      // server (xem middleware/auth.js: token_version), nên PHẢI xoá đúng nơi
      // token thật sự được lưu. auth.tsx dùng sessionStorage làm nguồn chính
      // (localStorage chỉ là fallback cũ) — trước đây chỉ xoá localStorage,
      // để sót token thật trong sessionStorage.
      setTimeout(() => {
        sessionStorage.removeItem("auth_token")
        sessionStorage.removeItem("user_data")
        localStorage.removeItem("auth_token")
        localStorage.removeItem("user_data")
        router.push("/login")
      }, 2000)
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Lỗi kết nối. Vui lòng thử lại."
      setMessage({ type: "error", text })
    } finally {
      setLoading(false)
    }
  }

  const handleResendPasswordCode = async () => {
    setMessage(null)
    setLoading(true)
    try {
      await sendChangePasswordCode(passwordData.currentPassword)
      setMessage({ type: "success", text: "Đã gửi lại mã xác thực" })
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Lỗi kết nối. Vui lòng thử lại."
      setMessage({ type: "error", text })
    } finally {
      setLoading(false)
    }
  }

  // Khách đổi cách nhận tiền hoàn. Chọn voucher khi khoản đã được duyệt thì
  // hệ thống phát mã NGAY — không phải chờ thêm ai bấm nút.
  // Kết quả kiểm tra số điện thoại, tính lại mỗi lần gõ.
  const ktSoDienThoai = kiemTraSoDienThoai(profileData.phone)
  const loiSoDienThoai = profileData.phone.trim() ? ktSoDienThoai.loi : null

  const doiCachNhanTien = async (r: MyRefund, kenh: "voucher" | "cong_thanh_toan") => {
    setDangChonKenh(r.id)
    setRefundMessage(null)
    try {
      const kq = await chonKenhHoanTien(r.id, kenh)
      setRefundMessage(kq.message)
      const moi = await getMyRefunds()
      setRefunds(moi.refunds)
      setRefundCauHinh(moi.cauHinh)
      if (kq.daThucHien) setMyVouchers(await getMyVouchers())
    } catch (e: any) {
      setRefundMessage(e?.message || "Không ghi nhận được lựa chọn")
    } finally {
      setDangChonKenh(null)
    }
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Hồ sơ cá nhân</h1>
          <p className="text-muted-foreground">Quản lý thông tin tài khoản của bạn</p>
        </div>

        {message && (
          <Alert className={`mb-6 ${message.type === "success" ? "bg-green-50 text-green-900 border-green-200" : "bg-red-50 text-red-900 border-red-200"}`}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* ── Thẻ tài khoản ───────────────────────────────────────────
              Những thông tin khách hay cần liếc qua: mình là ai, hạng gì, còn
              bao nhiêu điểm, đã đặt bao nhiêu vé. Đặt cố định bên trái để lúc
              nào cũng thấy, không phải chuyển tab.

              KHÔNG hiện ngày tham gia: nó không phục vụ thao tác nào của khách. */}
          <Card className="h-fit lg:sticky lg:top-6">
            <CardContent className="pt-6 text-center">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-3xl font-bold text-primary-foreground">
                {(profileData.first_name || profileData.username || "?").trim().charAt(0).toUpperCase()}
              </div>
              <h3 className="text-lg font-semibold leading-tight">
                {`${profileData.first_name} ${profileData.last_name}`.trim() || profileData.username}
              </h3>
              <p className="mt-0.5 break-all text-xs text-muted-foreground">{profileData.email}</p>

              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                  {user.is_admin ? "Quản trị viên" : "Thành viên"}
                </Badge>
                {user.is_google_account && (
                  <Badge variant="secondary" className="text-[11px]">Tài khoản Google</Badge>
                )}
              </div>

              <div className="mt-5 space-y-2 border-t pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Điểm thưởng</span>
                  <span className="font-semibold tabular-nums text-primary">
                    {pointsLoading ? "…" : pointsBalance.toLocaleString("vi-VN")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Vé đã đặt</span>
                  <span className="font-semibold tabular-nums">
                    {refundLoading ? "…" : soVeDaDat.toLocaleString("vi-VN")}
                  </span>
                </div>
              </div>

              <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                <a href="/bookings">
                  <Ticket className="mr-2 h-3.5 w-3.5" /> Vé của tôi
                </a>
              </Button>
            </CardContent>
          </Card>

          <div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full ${user.is_google_account ? "grid-cols-3" : "grid-cols-4"}`}>
            <TabsTrigger value="profile">
              <User className="w-4 h-4 mr-2" />
              Thông tin cá nhân
            </TabsTrigger>
            <TabsTrigger value="points">
              <Gift className="w-4 h-4 mr-2" />
              Điểm thưởng
            </TabsTrigger>
            {/* Khách phải tra lại được tiền hoàn và mã bồi thường của mình.
                Trước đây mã chỉ gửi qua email — mất email là mất tiền, vì mã
                bồi thường đúng bằng giá trị vé. */}
            <TabsTrigger value="refunds">
              <Wallet className="w-4 h-4 mr-2" />
              Hoàn tiền & mã của tôi
            </TabsTrigger>
            {!user.is_google_account && (
              <TabsTrigger value="password">
                <Lock className="w-4 h-4 mr-2" />
                Đổi mật khẩu
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="[&_form>div.space-y-2]:min-w-0 [&_form]:sm:grid [&_form]:sm:grid-cols-2 [&_form]:sm:gap-x-5 [&_form>div:last-child]:sm:col-span-2 [&_form>div.space-y-2:has(textarea)]:sm:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Thông tin cá nhân</CardTitle>
                <CardDescription>
                  {user.is_google_account
                    ? "Tài khoản Google — email không thể thay đổi"
                    : "Cập nhật thông tin cá nhân và địa chỉ email của bạn"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">Họ và tên đệm</Label>
                      <Input
                        id="first_name"
                        value={profileData.first_name}
                        onChange={(e) => setProfileData({ ...profileData, first_name: e.target.value })}
                        placeholder="Nguyễn Văn"
                        required
                        disabled={loading}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="last_name">Tên</Label>
                      <Input
                        id="last_name"
                        value={profileData.last_name}
                        onChange={(e) => setProfileData({ ...profileData, last_name: e.target.value })}
                        placeholder="An"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      placeholder="email@example.com"
                      required
                      disabled={loading || user.is_google_account}
                    />
                    {user.is_google_account && (
                      <p className="text-xs text-muted-foreground">Email được quản lý bởi Google, không thể thay đổi.</p>
                    )}
                  </div>

                  {profileData.email !== originalEmail && !user.is_google_account && (
                    <div className="space-y-2">
                      <Label htmlFor="emailChangePassword">Mật khẩu hiện tại (bắt buộc để đổi email)</Label>
                      <div className="relative">
                        <Input
                          id="emailChangePassword"
                          type={showEmailChangePassword ? "text" : "password"}
                          value={emailChangePassword}
                          onChange={(e) => setEmailChangePassword(e.target.value)}
                          placeholder="Nhập mật khẩu hiện tại"
                          required
                          disabled={loading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowEmailChangePassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          aria-label={showEmailChangePassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                        >
                          {showEmailChangePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">Vì lý do bảo mật, đổi email cần xác thực lại mật khẩu hiện tại.</p>
                    </div>
                  )}

                  {/* Kiểm tra định dạng NGAY KHI GÕ, không đợi bấm Lưu: sai
                      đầu số hay thiếu chữ số thì biết liền, không phải điền
                      xong cả biểu mẫu mới bị trả về. */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">Số điện thoại (Tùy chọn)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      placeholder="0912 345 678"
                      disabled={loading}
                      aria-invalid={!!loiSoDienThoai}
                      className={loiSoDienThoai ? "border-red-500 focus-visible:ring-red-500" : ""}
                    />
                    {loiSoDienThoai ? (
                      <p className="text-xs text-red-500">{loiSoDienThoai}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Số di động Việt Nam, 10 chữ số, bắt đầu bằng 03 · 05 · 07 · 08 · 09
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="date_of_birth">🎂 Ngày sinh (Tùy chọn)</Label>
                    <Input
                      id="date_of_birth"
                      type="date"
                      value={profileData.date_of_birth}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setProfileData({ ...profileData, date_of_birth: e.target.value })}
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      Khai ngày sinh để nhận mã ưu đãi giảm giá riêng vào tháng sinh nhật của bạn!
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    <Save className="w-4 h-4 mr-2" />
                    {loading ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="points" className="space-y-6">
            <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-rose-500/10 border-amber-500/20">
              <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-amber-500/15 flex items-center justify-center">
                    <Star className="h-7 w-7 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Số điểm hiện có</p>
                    <p className="text-3xl font-bold tabular-nums">{pointsLoading ? "…" : pointsBalance.toLocaleString("vi-VN")}</p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1 sm:text-right">
                  <p>🎫 1 điểm / 10.000đ khi thanh toán vé</p>
                  <p>⭐ +20 điểm khi đánh giá phim được duyệt</p>
                </div>
              </CardContent>
            </Card>

            <div>
              <h3 className="text-base font-semibold mb-3">Đổi điểm lấy ưu đãi</h3>
              {pointsLoading ? (
                <p className="text-sm text-muted-foreground">Đang tải...</p>
              ) : pointRewards.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có phần thưởng nào khả dụng.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pointRewards.map((r) => {
                    const affordable = pointsBalance >= r.points_cost
                    return (
                      <Card key={r.id} className={!affordable ? "opacity-60" : ""}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2 text-primary">
                            {r.discount_type === "percent" ? <Percent className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                            <CardTitle className="text-base">{r.title}</CardTitle>
                          </div>
                          <CardDescription>{r.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Giá trị</span>
                            <span className="font-medium">{rewardValueText(r)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Hiệu lực</span>
                            <span className="font-medium">{r.validity_days} ngày sau khi đổi</span>
                          </div>
                          <Button className="w-full gap-1.5" disabled={!affordable} onClick={() => setRedeemTarget(r)}>
                            <Star className="h-4 w-4" /> {affordable ? `Đổi ${r.points_cost} điểm` : `Cần ${r.points_cost} điểm`}
                          </Button>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-base font-semibold mb-3">Lịch sử điểm</h3>
              <Card>
                <CardContent className="p-0">
                  {pointsLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Đang tải...</p>
                  ) : pointsHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Chưa có giao dịch điểm nào.</p>
                  ) : (
                    <div className="divide-y">
                      {pointsHistory.map((h) => (
                        <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {h.type === "earn" ? (
                              <ArrowUpCircle className="h-5 w-5 text-green-500 shrink-0" />
                            ) : (
                              <ArrowDownCircle className="h-5 w-5 text-amber-500 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{h.reason}</p>
                              <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("vi-VN")}</p>
                            </div>
                          </div>
                          <Badge variant={h.type === "earn" ? "default" : "secondary"} className={h.type === "earn" ? "bg-green-500 shrink-0" : "shrink-0"}>
                            {h.amount > 0 ? "+" : ""}{h.amount}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── HOÀN TIỀN & MÃ CỦA TÔI ────────────────────────────────── */}
          <TabsContent value="refunds" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-emerald-500" /> Tiền hoàn của bạn
                </CardTitle>
                <CardDescription>
                  Khi suất chiếu bị huỷ hoặc bạn huỷ vé, tiền được trả lại theo đúng cách bạn đã thanh toán.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {refundMessage && (
                  <Alert className="mb-4 border-emerald-500/50">
                    <AlertDescription>{refundMessage}</AlertDescription>
                  </Alert>
                )}
                {/* Nói thật về môi trường thay vì hứa tiền về thẻ trong 3–7
                    ngày — trên sandbox không có đồng tiền thật nào chạy. */}
                {refundCauHinh.la_thu_nghiem && refunds.length > 0 && (
                  <Alert className="mb-4 border-amber-500/50">
                    <AlertDescription>{refundCauHinh.ghi_chu_thu_nghiem}</AlertDescription>
                  </Alert>
                )}
                {refundLoading ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Đang tải…</p>
                ) : refunds.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Bạn chưa có khoản hoàn tiền nào.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {refunds.map((r) => (
                      <div key={r.id} className="rounded-lg border p-4 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{r.movie_title || "Vé đã huỷ"}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.show_time} {r.show_date}{r.cinema_name ? ` · ${r.cinema_name}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">{r.booking_reference}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-emerald-600">
                              {r.so_tien.toLocaleString("vi-VN")}đ
                            </p>
                            <span
                              className={`inline-flex items-center gap-1 text-xs ${
                                r.trang_thai === "thanh_cong" ? "text-emerald-600"
                                  : r.trang_thai === "tu_choi" || r.trang_thai === "that_bai" ? "text-red-600"
                                  : "text-amber-600"
                              }`}
                            >
                              {r.trang_thai === "thanh_cong" ? <CheckCircle2 className="h-3 w-3" />
                                : r.trang_thai === "tu_choi" || r.trang_thai === "that_bai" ? <AlertCircle className="h-3 w-3" />
                                : <Clock3 className="h-3 w-3" />}
                              {r.trang_thai_nhan}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground space-y-1 border-t pt-2">
                          <p>Lý do: {r.ly_do}</p>
                          <p>Hình thức: {r.kenh_nhan}</p>
                          {r.trang_thai_mo_ta && <p>{r.trang_thai_mo_ta}</p>}
                          {/* Mã giao dịch hoàn là thứ khách cầm đi đối chiếu với
                              ngân hàng nếu tiền chưa thấy về — phải hiện ra. */}
                          {/* Hai mã khác nhau và khách cần cả hai khi làm việc
                              với ngân hàng: mã thanh toán gốc luôn có sẵn, mã
                              hoàn chỉ xuất hiện sau khi cổng chấp nhận lệnh. */}
                          {r.ma_giao_dich_goc && (
                            <p>
                              Mã giao dịch thanh toán:{" "}
                              <span className="font-mono text-foreground">{r.ma_giao_dich_goc}</span>
                            </p>
                          )}
                          {r.ma_giao_dich_hoan ? (
                            <p>
                              Mã giao dịch hoàn:{" "}
                              <span className="font-mono text-foreground">{r.ma_giao_dich_hoan}</span>
                            </p>
                          ) : r.kenh === "cong_thanh_toan" && r.trang_thai !== "thanh_cong" ? (
                            <p>Mã giao dịch hoàn sẽ có khi ngân hàng tiếp nhận lệnh.</p>
                          ) : null}
                          {r.ghi_chu_thoi_gian && <p className="text-amber-600">{r.ghi_chu_thoi_gian}</p>}
                          {r.voucher_code && (
                            <p>
                              Mã bồi thường:{" "}
                              <span className="font-mono text-foreground">{r.voucher_code}</span>
                            </p>
                          )}
                          {r.kenh_khach_chon && (
                            <p className="text-emerald-600">
                              Bạn đã chọn:{" "}
                              {r.kenh_khach_chon === "voucher"
                                ? "nhận voucher ngay"
                                : "hoàn về phương thức thanh toán ban đầu"}
                            </p>
                          )}
                        </div>

                        {/* KHÁCH TỰ CHỌN CÁCH NHẬN TIỀN.
                            Hai nhu cầu khác hẳn nhau: muốn xem phim khác ngay
                            tối nay thì cần tiền dùng được ngay; không định quay
                            lại rạp thì cần tiền về đúng thẻ. */}
                        {r.duoc_chon_lai && (
                          <div className="border-t pt-3 space-y-2">
                            <p className="text-xs font-medium">Bạn muốn nhận lại {r.so_tien.toLocaleString("vi-VN")}đ bằng cách nào?</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Button
                                size="sm"
                                variant={r.kenh === "voucher" ? "default" : "outline"}
                                disabled={dangChonKenh === r.id}
                                onClick={() => doiCachNhanTien(r, "voucher")}
                                className="h-auto py-2 flex-col items-start gap-0.5"
                              >
                                <span className="font-medium">Nhận voucher ngay</span>
                                <span className="text-[11px] font-normal opacity-80">
                                  Đúng {r.so_tien.toLocaleString("vi-VN")}đ · dùng được liền cho phim khác
                                </span>
                              </Button>
                              <Button
                                size="sm"
                                variant={r.kenh === "cong_thanh_toan" ? "default" : "outline"}
                                disabled={dangChonKenh === r.id}
                                onClick={() => doiCachNhanTien(r, "cong_thanh_toan")}
                                className="h-auto py-2 flex-col items-start gap-0.5"
                              >
                                <span className="font-medium">Hoàn về thẻ / ví</span>
                                <span className="text-[11px] font-normal opacity-80">
                                  Về đúng nơi đã thanh toán · chờ 3–7 ngày làm việc
                                </span>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="h-5 w-5 text-amber-500" /> Mã giảm giá riêng của bạn
                </CardTitle>
                <CardDescription>
                  Mã bồi thường, mã đổi từ điểm thưởng và mã sinh nhật. Chỉ tài khoản này dùng được.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {refundLoading ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Đang tải…</p>
                ) : myVouchers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Bạn chưa có mã giảm giá riêng nào.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {myVouchers.map((v) => (
                      <div
                        key={v.id}
                        className={`rounded-lg border p-4 space-y-1 ${v.con_dung_duoc ? "" : "opacity-60"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold tracking-wider">{v.code}</span>
                          <span className={`text-xs ${v.con_dung_duoc ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {v.trang_thai}
                          </span>
                        </div>
                        <p className="text-lg font-bold text-amber-600">
                          {v.discount_type === "fixed"
                            ? `${v.discount_value.toLocaleString("vi-VN")}đ`
                            : `Giảm ${v.discount_value}%`}
                        </p>
                        {v.la_boi_thuong && (
                          <p className="text-xs text-emerald-600">Tiền bồi thường vé đã huỷ</p>
                        )}
                        {v.description && <p className="text-xs text-muted-foreground">{v.description}</p>}
                        <p className="text-xs text-muted-foreground">
                          Hạn dùng: {new Date(v.valid_until).toLocaleDateString("vi-VN")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-muted">
              <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Chọn cách nhận tiền thế nào cho lợi?</p>
                <p>
                  <strong className="text-foreground">Voucher bồi thường</strong> — nhận ngay, giá trị đúng
                  bằng số tiền vé, không mất phí. Phù hợp nếu bạn vẫn muốn xem phim: đổi sang suất khác
                  ngay tối nay thay vì chờ ngân hàng.
                </p>
                <p>
                  <strong className="text-foreground">Hoàn về thẻ / ví</strong> — tiền quay lại đúng nơi bạn
                  đã thanh toán, qua ngân hàng phát hành, mất 3–7 ngày làm việc. Phù hợp nếu bạn không định
                  quay lại rạp.
                </p>
                <p>
                  Rạp <strong>không giữ số dư</strong> của bạn, nên không có bước &quot;rút tiền&quot; nào từ
                  tài khoản rạp về ngân hàng. Bạn đổi lựa chọn được cho tới khi khoản hoàn được thực hiện
                  xong.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {!user.is_google_account && (
          <TabsContent value="password">
            <Card>
              <CardHeader>
                <CardTitle>Đổi mật khẩu</CardTitle>
                <CardDescription>
                  Cập nhật mật khẩu của bạn để bảo mật tài khoản
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={pwStep === "form" ? handleSendPasswordCode : handleConfirmPasswordChange} className="space-y-4">
                  {pwStep === "code" && (
                    <div className="space-y-4">
                      <Alert>
                        <AlertDescription>
                          Mã xác thực đã được gửi đến email của bạn. Vui lòng kiểm tra (kể cả mục Spam) và nhập mã để xác nhận đổi mật khẩu.
                        </AlertDescription>
                      </Alert>
                      <div className="space-y-2">
                        <Label htmlFor="pwCode">Mã xác thực</Label>
                        <Input
                          id="pwCode"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="Nhập mã 6 số"
                          value={pwCode}
                          onChange={(e) => setPwCode(e.target.value)}
                          required
                          disabled={loading}
                          className="text-center text-lg tracking-widest"
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        <Lock className="w-4 h-4 mr-2" />
                        {loading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
                      </Button>
                      <div className="flex items-center justify-between text-sm">
                        <button
                          type="button"
                          className="text-muted-foreground hover:underline"
                          onClick={() => { setPwStep("form"); setPwCode(""); setMessage(null) }}
                          disabled={loading}
                        >
                          ← Quay lại
                        </button>
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={handleResendPasswordCode}
                          disabled={loading}
                        >
                          Gửi lại mã
                        </button>
                      </div>
                    </div>
                  )}

                  {pwStep === "form" && (
                  <>
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        placeholder="Nhập mật khẩu hiện tại"
                        required
                        disabled={loading}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        disabled={loading}
                        aria-label={showCurrentPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Mật khẩu mới</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        placeholder="Nhập mật khẩu mới"
                        required
                        disabled={loading}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        disabled={loading}
                        aria-label={showNewPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {/* Hiển thị trạng thái yêu cầu mật khẩu */}
                    {passwordData.newPassword && (() => {
                      const p = passwordData.newPassword
                      const checks = [
                        { ok: p.length >= 8,                          label: "≥8 ký tự" },
                        { ok: /[A-Z]/.test(p),                        label: "Chữ HOA" },
                        { ok: /[a-z]/.test(p),                        label: "Chữ thường" },
                        { ok: /[0-9]/.test(p),                        label: "Chữ số" },
                        { ok: /[!@#$%^&*()_+\-=\[\]{}|;':",.<>?]/.test(p), label: "Ký tự đặc biệt" },
                      ]
                      return (
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {checks.map(c => (
                            <span key={c.label} className={`text-[11px] px-2 py-0.5 rounded-full ${c.ok ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                              {c.ok ? "✓" : "✗"} {c.label}
                            </span>
                          ))}
                        </div>
                      )
                    })()}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        placeholder="Nhập lại mật khẩu mới"
                        required
                        disabled={loading}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={loading}
                        aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    <Lock className="w-4 h-4 mr-2" />
                    {loading ? "Đang gửi mã..." : "Tiếp tục"}
                  </Button>
                  </>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          )}
        </Tabs>
          </div>
        </div>
      </div>

      {/* Xác nhận đổi điểm */}
      <Dialog open={!!redeemTarget} onOpenChange={(o) => !o && setRedeemTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận đổi điểm</DialogTitle>
            <DialogDescription>
              Đổi <strong>{redeemTarget?.points_cost} điểm</strong> lấy <strong>"{redeemTarget?.title}"</strong>?
              Điểm sẽ bị trừ ngay và không thể hoàn lại.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemTarget(null)} disabled={redeeming}>Hủy</Button>
            <Button onClick={handleRedeem} disabled={redeeming}>{redeeming ? "Đang đổi..." : "Xác nhận đổi"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kết quả đổi điểm thành công */}
      <Dialog open={!!resultCode} onOpenChange={(o) => !o && setResultCode(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-green-500" /> Đổi điểm thành công!
            </DialogTitle>
            <DialogDescription>
              Mã voucher của bạn — chỉ tài khoản này dùng được, có hiệu lực đến{" "}
              {resultCode ? new Date(resultCode.validUntil).toLocaleDateString("vi-VN") : ""}.
            </DialogDescription>
          </DialogHeader>
          {resultCode && (
            <button
              onClick={handleCopyCode}
              className="flex items-center justify-center gap-2 font-mono font-bold text-base bg-muted hover:bg-muted/70 transition-colors rounded-lg px-4 py-2"
            >
              {resultCode.code}
              {codeCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            </button>
          )}
          <DialogFooter>
            <Button onClick={() => setResultCode(null)}>Đã hiểu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
