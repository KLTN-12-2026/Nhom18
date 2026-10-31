"use client"

export const dynamic = "force-dynamic"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Mail, KeyRound } from "lucide-react"
import { forgotPassword, resetPassword } from "@/lib/api/auth"
import { ApiError } from "@/lib/api/client"

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<"email" | "reset">("email")
  const [email, setEmail] = useState("")
  const [resetCode, setResetCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null)

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setLoading(true)

    try {
      await forgotPassword(email)
      setMessage({
        type: "success",
        text: "Mã xác thực đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư!"
      })
      setStep("reset")
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Lỗi kết nối. Vui lòng thử lại."
      setMessage({ type: "error", text })
    } finally {
      setLoading(false)
    }
  }

  // Nút "Gửi lại mã" trước đây chỉ quay về bước nhập email và xoá form,
  // KHÔNG hề gọi lại API gửi mã — người dùng bấm xong tưởng mã mới đã được
  // gửi, nhưng thực ra phải tự nhập lại email và bấm "Gửi mã xác thực" lần
  // nữa mới thực sự có mã mới. Gọi lại đúng API forgotPassword() ở đây,
  // giữ nguyên bước "reset" (không cần bắt nhập lại email vì đã có sẵn).
  const handleResendCode = async () => {
    setMessage(null)
    setResending(true)
    try {
      await forgotPassword(email)
      setMessage({ type: "success", text: "Mã xác thực mới đã được gửi đến email của bạn!" })
      setResetCode("")
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Lỗi kết nối. Vui lòng thử lại."
      setMessage({ type: "error", text })
    } finally {
      setResending(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Mật khẩu mới không khớp!" })
      return
    }

    // Khớp với yêu cầu backend: 8 ký tự, hoa, thường, số, ký tự đặc biệt
    const p = newPassword
    const errors: string[] = []
    if (p.length < 8)         errors.push("ít nhất 8 ký tự")
    if (!/[A-Z]/.test(p))     errors.push("1 chữ HOA")
    if (!/[a-z]/.test(p))     errors.push("1 chữ thường")
    if (!/[0-9]/.test(p))     errors.push("1 chữ số")
    if (!/[!@#$%^&*()_+\-=\[\]{}|;':",.<>?/`~\\]/.test(p)) errors.push("1 ký tự đặc biệt (!@#$...)")
    if (errors.length > 0) {
      setMessage({ type: "error", text: `Mật khẩu phải có: ${errors.join(", ")}` })
      return
    }

    setLoading(true)

    try {
      await resetPassword(email, resetCode, newPassword)
      setMessage({
        type: "success",
        text: "Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập..."
      })
      setTimeout(() => router.push("/login"), 2000)
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Lỗi kết nối. Vui lòng thử lại."
      setMessage({ type: "error", text })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center mb-4">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Quay lại
              </Button>
            </Link>
          </div>
          <CardTitle className="text-2xl font-bold">
            {step === "email" ? "Quên mật khẩu" : "Đặt lại mật khẩu"}
          </CardTitle>
          <CardDescription>
            {step === "email" 
              ? "Nhập email của bạn để nhận mã xác thực" 
              : "Nhập mã xác thực và mật khẩu mới"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {message && (
            <Alert className={`mb-4 ${message.type === "success" ? "bg-green-50 text-green-900 border-green-200" : "bg-red-50 text-red-900 border-red-200"}`}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {step === "email" ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    disabled={loading}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Chúng tôi sẽ gửi mã xác thực 6 số đến email này
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Đang gửi..." : "Gửi mã xác thực"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resetCode">Mã xác thực</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="resetCode"
                    type="text"
                    placeholder="Nhập mã 6 số"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="pl-10"
                    maxLength={6}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Mật khẩu mới</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="8+ ký tự, có hoa, thường, số, ký tự đặc biệt"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendCode}
                  disabled={loading || resending}
                  className="flex-1"
                >
                  {resending ? "Đang gửi..." : "Gửi lại mã"}
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? "Đang xử lý..." : "Đặt lại mật khẩu"}
                </Button>
              </div>

              <button
                type="button"
                className="text-xs text-center w-full text-muted-foreground hover:text-primary hover:underline"
                onClick={() => {
                  setStep("email")
                  setResetCode("")
                  setNewPassword("")
                  setConfirmPassword("")
                  setMessage(null)
                }}
                disabled={loading || resending}
              >
                Nhập sai email? Quay lại
              </button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-center text-muted-foreground">
            Nhớ mật khẩu?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Đăng nhập ngay
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
