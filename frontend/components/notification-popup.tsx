"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Cake, CalendarClock, Star, AlertCircle, AlertTriangle, Bell, Copy, Check, Inbox, Popcorn, Wallet, RotateCcw, Ticket as TicketIcon } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { getNotifications, markNotificationRead, type AppNotification } from "@/lib/api/notifications"

const POLL_MS = 45_000

const TYPE_META: Record<string, { icon: typeof Bell; ctaLabel?: string; ctaHref?: string }> = {
  birthday_greeting: { icon: Cake, ctaLabel: "Đặt vé ngay", ctaHref: "/movies" },
  dob_reminder: { icon: CalendarClock, ctaLabel: "Cập nhật hồ sơ", ctaHref: "/profile" },
  points_earned: { icon: Star, ctaLabel: "Xem điểm thưởng", ctaHref: "/profile?tab=points" },
  review_rejected: { icon: AlertCircle },
  // Rạp báo sự cố suất chiếu khách đã mua (huỷ + hoàn tiền, hoặc chậm giờ)
  // Suất bị huỷ → việc khách cần làm là CHỌN cách nhận tiền, không phải xem
  // lại cái vé vừa mất. Dẫn thẳng tới đúng chỗ đó.
  showtime_incident: { icon: AlertTriangle, ctaLabel: "Chọn cách nhận tiền", ctaHref: "/profile?tab=refunds" },
  // Tiền đã thực sự hoàn xong — chỉ gửi khi cổng xác nhận / voucher đã phát,
  // KHÔNG gửi lúc mới huỷ vé (xem refund.service.js)
  refund_completed: { icon: Wallet, ctaLabel: "Xem khoản hoàn tiền", ctaHref: "/profile?tab=refunds" },
  // Huỷ vé trả lại mã đã dùng. Không báo thì khách tưởng mất mã — nghiêm trọng
  // với mã bồi thường vì nó bằng đúng nguyên giá vé.
  voucher_restored: { icon: TicketIcon, ctaLabel: "Xem mã của tôi", ctaHref: "/profile?tab=refunds" },
  // Suất bị huỷ nay mở bán lại — vé cũ KHÔNG tự khôi phục, khách phải đặt lại
  showtime_restored: { icon: RotateCcw, ctaLabel: "Đặt lại vé", ctaHref: "/showtimes" },
  // Sáu loại dưới đây gửi cho NHÂN VIÊN (admin/quản lý chi nhánh), không phải khách
  branch_request: { icon: Inbox, ctaLabel: "Xem yêu cầu", ctaHref: "/admin/combos" },
  branch_request_result: { icon: Popcorn, ctaLabel: "Xem kho bắp nước", ctaHref: "/admin/combos" },
  branch_incident: { icon: AlertTriangle, ctaLabel: "Xem suất chiếu", ctaHref: "/admin/showtimes" },
  branch_activity: { icon: Popcorn, ctaLabel: "Xem nhật ký", ctaHref: "/admin/combos" },
  // Tiền của khách đang treo chờ quản trị viên duyệt
  refund_pending: { icon: Wallet, ctaLabel: "Duyệt hoàn tiền", ctaHref: "/admin/refunds" },
  // Cổng thanh toán từ chối — vé đã huỷ mà tiền chưa đi, phải xử lý tay
  refund_failed: { icon: AlertTriangle, ctaLabel: "Xử lý ngay", ctaHref: "/admin/refunds" },
}

/**
 * Thông báo hiện TRỰC TIẾP cho người dùng bằng 1 khuôn hình chữ nhật vừa,
 * chính giữa màn hình — thay cho chuông phải bấm mới xem được. Mounted 1 lần
 * ở layout gốc nên hoạt động trên MỌI trang khi đã đăng nhập. Vòng lặp: tải
 * danh sách thông báo → lọc CHƯA ĐỌC → hiện lần lượt từng cái → đánh dấu đã
 * đọc khi đóng → hiện cái tiếp theo (nếu còn) hoặc đóng hẳn.
 */
export function NotificationPopup() {
  const { user } = useAuth()
  const router = useRouter()
  const [queue, setQueue] = useState<AppNotification[]>([])
  const [copied, setCopied] = useState(false)
  const shownIds = useRef<Set<number>>(new Set())

  const fetchUnread = useCallback(async () => {
    try {
      const all = await getNotifications(20)
      const unseen = all.filter((n) => !n.is_read && !shownIds.current.has(n.id))
      if (unseen.length === 0) return
      unseen.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      unseen.forEach((n) => shownIds.current.add(n.id))
      setQueue((prev) => [...prev, ...unseen])
    } catch {
      /* im lặng — popup thông báo không phải luồng nghiệp vụ chính */
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setQueue([])
      shownIds.current.clear()
      return
    }
    fetchUnread()
    const id = setInterval(fetchUnread, POLL_MS)
    return () => clearInterval(id)
  }, [user, fetchUnread])

  const current = queue[0]

  const handleDismiss = async () => {
    if (!current) return
    setCopied(false)
    setQueue((prev) => prev.slice(1))
    try {
      await markNotificationRead(current.id)
    } catch {
      /* best-effort */
    }
  }

  const handleCta = async () => {
    if (!current) return
    const href = TYPE_META[current.type]?.ctaHref
    await handleDismiss()
    if (href) router.push(href)
  }

  const handleCopyCode = async () => {
    const code = current?.data?.voucherCode
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard bị chặn — mã vẫn hiện sẵn trong modal để copy tay */
    }
  }

  if (!current) return null

  const meta = TYPE_META[current.type] || { icon: Bell }
  const Icon = meta.icon
  const voucherCode: string | undefined = current.data?.voucherCode

  return (
    <Dialog open onOpenChange={(open) => !open && handleDismiss()}>
      {/* Khuôn hình chữ nhật vừa, chính giữa — không avatar/icon lớn, không
          trang trí thừa, chỉ tiêu đề + nội dung + (tuỳ loại) mã voucher + nút. */}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4.5 w-4.5 text-primary shrink-0" />
            {current.title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{current.message}</DialogDescription>
        </DialogHeader>

        {voucherCode && (
          <button
            onClick={handleCopyCode}
            className="flex items-center justify-center gap-2 font-mono font-semibold text-sm bg-muted hover:bg-muted/70 transition-colors rounded-md px-3 py-2"
          >
            {voucherCode}
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        )}

        {queue.length > 1 && (
          <p className="text-xs text-muted-foreground">Còn {queue.length - 1} thông báo khác</p>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" size="sm" onClick={handleDismiss}>Đóng</Button>
          {meta.ctaHref && <Button size="sm" onClick={handleCta}>{meta.ctaLabel}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
