"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api/client"
import { exchangeGoogleCode } from "@/lib/api/auth"

// Chỉ chấp nhận redirect nội bộ — chặn open redirect qua URL protocol-relative
// (vd "//evil.com") hoặc URL có scheme khác. Khớp với isSafeReturnPath() phía
// backend (authController.js) — kiểm tra lại lần nữa ở đây vì `returnTo` là
// giá trị lấy trực tiếp từ query string, không nên tin tưởng dù backend đã lọc.
function isSafeReturnPath(path: string): boolean {
  if (!path) return false
  if (!path.startsWith("/")) return false
  if (path.startsWith("//")) return false
  if (path.startsWith("/\\")) return false
  return true
}

export default function AuthCallbackPage() {
  const [error, setError] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const returnToParam = params.get("returnTo") || "/"
    const returnTo = isSafeReturnPath(returnToParam) ? returnToParam : "/"
    const errorCode = params.get("error")

    if (errorCode) {
      const messages: Record<string, string> = {
        google_not_configured: "Đăng nhập Google hiện chưa khả dụng, vui lòng dùng email/mật khẩu",
        google_cancelled: "Đăng nhập Google bị hủy",
        account_blocked: "Tài khoản đã bị khóa",
        google_auth_failed: "Đăng nhập Google thất bại",
        google_token_failed: "Lỗi xác thực Google",
        google_no_email: "Không lấy được email từ Google",
        google_email_not_verified: "Email Google chưa được xác minh — vui lòng đăng nhập bằng mật khẩu hoặc xác minh email trong tài khoản Google trước",
        user_creation_failed: "Không thể tạo tài khoản",
      }
      setError(messages[errorCode] || "Đăng nhập thất bại")
      setTimeout(() => { window.location.href = "/login" }, 3000)
      return
    }

    if (!code) {
      setError("Không nhận được thông tin xác thực")
      setTimeout(() => { window.location.href = "/login" }, 3000)
      return
    }

    const finishLogin = async () => {
      try {
        // Đổi code (dùng 1 lần, sống 60s) lấy JWT thật — token không còn nằm
        // trực tiếp trên URL nên không bị lưu vào lịch sử trình duyệt/log server.
        const { token } = await exchangeGoogleCode(code)
        const data = await apiFetch<{ user: any }>("/api/auth/profile", {
          auth: false,
          headers: { Authorization: `Bearer ${token}` },
        })
        const u = data.user

        const user = {
          id: u.id,
          email: u.email,
          first_name: u.username?.split(" ")[0] || u.username || "",
          last_name: u.username?.split(" ").slice(1).join(" ") || "",
          phone: u.phone || "",
          role: u.role as "user" | "cinema_manager" | "admin",
          is_admin: u.role === "admin",
          is_cinema_manager: u.role === "cinema_manager",
          can_access_admin: u.role === "admin" || u.role === "cinema_manager",
          can_manage_users: u.role === "admin",
        }

        sessionStorage.setItem("auth_token", token)
        sessionStorage.setItem("user_data", JSON.stringify(user))

        // Hard redirect so AuthProvider re-initializes with the new session
        // (returnTo đã được validate bằng isSafeReturnPath ở trên)
        window.location.href = returnTo
      } catch {
        setError("Không thể hoàn tất đăng nhập")
        setTimeout(() => { window.location.href = "/login" }, 3000)
      }
    }

    finishLogin()
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-destructive text-lg font-medium">{error}</p>
          <p className="text-muted-foreground text-sm">Đang chuyển về trang đăng nhập...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="text-muted-foreground">Đang hoàn tất đăng nhập với Google...</p>
      </div>
    </div>
  )
}
