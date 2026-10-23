"use client"

import { useEffect, useState } from "react"
import { Cake, Copy, Check, X } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { getActiveBirthdayVoucher, type ActiveBirthdayVoucher } from "@/lib/api/vouchers"

const DISMISS_KEY = "birthday_banner_dismissed_month"

/** Banner ưu đãi sinh nhật — chỉ hiện khi user đã đăng nhập, đã khai ngày
 * sinh trong hồ sơ, VÀ tháng hiện tại trùng tháng sinh (so khớp ở CLIENT chỉ
 * để quyết định hiện/ẩn banner — điều kiện thật sự được backend kiểm tra lại
 * khi áp mã lúc thanh toán, xem Voucher.validate() phía server).
 *
 * Nội dung mã/mô tả/% giảm lấy TRỰC TIẾP từ voucher đang bật trong DB (API
 * /api/vouchers/active-birthday) — trước đây các giá trị này hardcode sẵn
 * trong component ("HAPPYBIRTHDAY"/"20%/50k"), nên nếu admin sửa mã ở trang
 * /admin/vouchers thì banner vẫn hiện nội dung CŨ, sai lệch với thực tế.
 *
 * Có thể đóng banner, nhớ theo THÁNG (sessionStorage) để không hiện lại phiền
 * trong cùng tháng đó nhưng vẫn hiện lại đúng vào tháng sinh nhật năm sau. */
export function BirthdayBanner() {
  const { user } = useAuth()
  const [voucher, setVoucher] = useState<ActiveBirthdayVoucher | null>(null)
  const [dismissed, setDismissed] = useState(true)
  const [copied, setCopied] = useState(false)

  const isBirthdayMonth = (() => {
    if (!user?.date_of_birth) return false
    const dob = new Date(user.date_of_birth)
    return dob.getMonth() === new Date().getMonth()
  })()

  useEffect(() => {
    if (!isBirthdayMonth) return
    const monthKey = `${new Date().getFullYear()}-${new Date().getMonth()}`
    const dismissedMonth = sessionStorage.getItem(DISMISS_KEY)
    setDismissed(dismissedMonth === monthKey)

    getActiveBirthdayVoucher()
      .then(setVoucher)
      .catch(() => setVoucher(null))
  }, [isBirthdayMonth])

  if (!isBirthdayMonth || dismissed || !voucher) return null

  const handleDismiss = () => {
    const monthKey = `${new Date().getFullYear()}-${new Date().getMonth()}`
    sessionStorage.setItem(DISMISS_KEY, monthKey)
    setDismissed(true)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(voucher.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Trình duyệt chặn clipboard API (vd http không an toàn) — mã vẫn hiện
      // sẵn trên banner để người dùng tự chọn/copy thủ công.
    }
  }

  return (
    <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm relative">
        <Cake className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          🎉 Chúc mừng tháng sinh nhật của bạn! Dùng mã
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 font-mono font-bold bg-white/20 hover:bg-white/30 transition-colors rounded-md px-2 py-0.5"
        >
          {voucher.code}
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <span>để {voucher.discount_text.toLowerCase()} khi đặt vé tháng này!</span>
        <button
          onClick={handleDismiss}
          aria-label="Đóng thông báo"
          className="absolute right-4 top-1/2 -translate-y-1/2 sm:static sm:translate-y-0 text-white/80 hover:text-white shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
