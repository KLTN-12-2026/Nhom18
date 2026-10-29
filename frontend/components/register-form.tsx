"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, UserPlus } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"

// Social login icon (inline SVG for Google)
const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

export function RegisterForm() {
  const router = useRouter()
  const { register, sendRegistrationCode } = useAuth()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    first_name: "",
    last_name: "",
    phone: "",
    date_of_birth: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [errors, setErrors] = useState<Array<string | { field: string; message: string }>>([])
  const [loading, setLoading] = useState(false)

  // Bước xác thực email: "form" = đang điền thông tin, "code" = đã gửi mã, chờ xác nhận
  const [step, setStep] = useState<"form" | "code">("form")
  const [code, setCode] = useState("")

  const handleSocialLogin = (provider: 'google') => {
    const base = (process.env.NEXT_PUBLIC_API_URL as string) || "http://localhost:5000"
    const returnTo = encodeURIComponent("/")
    window.location.href = `${base}/api/auth/google?returnTo=${returnTo}`
  }

  // Bước 1: kiểm tra hợp lệ rồi gửi mã xác thực về email
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setErrors([])

    if (formData.password !== formData.confirmPassword) {
      setError("Mật khẩu không khớp")
      return
    }

    if (formData.password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự")
      return
    }

    setLoading(true)
    const result = await sendRegistrationCode(formData.email)
    setLoading(false)

    if (result.success) {
      toast.success("Đã gửi mã xác thực", { description: `Vui lòng kiểm tra email ${formData.email}` })
      setStep("code")
    } else {
      setError(result.error || "Không thể gửi mã xác thực")
    }
  }

  // Bước 2: xác nhận mã rồi tạo tài khoản
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setErrors([])

    if (!code.trim()) {
      setError("Vui lòng nhập mã xác thực")
      return
    }

    setLoading(true)

    const result = await register({
      email: formData.email,
      password: formData.password,
      first_name: formData.first_name,
      last_name: formData.last_name,
      phone: formData.phone || undefined,
      date_of_birth: formData.date_of_birth || undefined,
      code: code.trim(),
    })

    if (result.success) {
      router.push("/")
    } else {
      // Check if we have multiple errors (from backend validation)
      if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
        setError(result.error || "Vui lòng kiểm tra các lỗi sau:")
        setErrors(result.errors)
      } else {
        setError(result.error || "Đăng ký thất bại")
      }
    }

    setLoading(false)
  }

  const handleResendCode = async () => {
    setError("")
    setLoading(true)
    const result = await sendRegistrationCode(formData.email)
    setLoading(false)
    if (result.success) {
      toast.success("Đã gửi lại mã xác thực")
    } else {
      setError(result.error || "Không thể gửi lại mã xác thực")
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
          <UserPlus className="h-6 w-6 text-primary" />
          Tạo tài khoản
        </CardTitle>
        <CardDescription>Tham gia CinemaGold để trải nghiệm xem phim tốt nhất</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={step === "form" ? handleSendCode : handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                <div>{error}</div>
                {errors.length > 0 && (
                  <ul className="mt-2 ml-4 list-disc space-y-1">
                    {errors.map((err, idx) => (
                      <li key={idx}>
                        {typeof err === 'string' ? err : err.message || JSON.stringify(err)}
                      </li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

          {step === "code" && (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Mã xác thực đã được gửi đến <strong>{formData.email}</strong>. Vui lòng kiểm tra email (kể cả mục Spam) và nhập mã dưới đây để hoàn tất đăng ký.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="code">Mã xác thực</Label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Nhập mã 6 số"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  disabled={loading}
                  className="text-center text-lg tracking-widest"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Đang tạo tài khoản..." : "Hoàn tất đăng ký"}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => { setStep("form"); setError(""); setCode("") }}
                  disabled={loading}
                >
                  ← Quay lại
                </button>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={handleResendCode}
                  disabled={loading}
                >
                  Gửi lại mã
                </button>
              </div>
            </div>
          )}

          {step === "form" && (
          <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Họ và tên đệm</Label>
              <Input
                id="first_name"
                name="first_name"
                type="text"
                placeholder="Nguyễn Văn"
                value={formData.first_name}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="last_name">Tên</Label>
              <Input
                id="last_name"
                name="last_name"
                type="text"
                placeholder="A"
                value={formData.last_name}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="email@example.com"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Số điện thoại (Tuỳ chọn)</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="0912345678"
              value={formData.phone}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date_of_birth">🎂 Ngày sinh (Tuỳ chọn)</Label>
            <Input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={formData.date_of_birth}
              onChange={handleChange}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Khai ngày sinh để nhận mã ưu đãi giảm giá riêng vào tháng sinh nhật của bạn!
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Tạo mật khẩu"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Nhập lại mật khẩu"
                value={formData.confirmPassword}
                onChange={handleChange}
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
            {loading ? "Đang gửi mã..." : "Tiếp tục"}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Hoặc đăng ký với</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => handleSocialLogin('google')}
            disabled={loading}
            className="w-full"
          >
            <GoogleIcon />
            <span className="ml-2">Google</span>
          </Button>

          <div className="text-center mt-4">
            <p className="text-sm text-muted-foreground">
              Đã có tài khoản?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Đăng nhập
              </Link>
            </p>
          </div>
          </>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
