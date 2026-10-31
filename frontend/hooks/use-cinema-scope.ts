"use client"

import { useAuth } from "@/lib/auth"

/**
 * Phạm vi rạp của người đang đăng nhập.
 *
 * Quản lý chi nhánh chỉ được xem số liệu của ĐÚNG rạp mình. Backend đã ép
 * phạm vi này (getScopedCinemaId đè lên tham số ?cinemaId= client gửi lên),
 * nên hook này KHÔNG phải là lớp bảo mật — nó chỉ để giao diện nói đúng sự
 * thật: không hiện bộ lọc "Tất cả rạp" cho người vốn dĩ không xem được tất
 * cả rạp, và không gọi những API toàn chuỗi chắc chắn sẽ trả về 403.
 */
export function useCinemaScope() {
  const { user } = useAuth()
  const isManager = user?.role === "cinema_manager"
  const scopedCinemaId = isManager ? (user?.cinema_id ?? null) : null

  return {
    /** Quản lý chi nhánh (không phải admin) */
    isManager,
    /** Chỉ xem được toàn chuỗi khi là admin */
    canSeeAllCinemas: !isManager,
    /** id rạp bị giới hạn, null nếu là admin */
    scopedCinemaId,
    /** giá trị cho các bộ lọc đang dùng chuỗi ("all" | "3") */
    scopedFilterValue: scopedCinemaId != null ? String(scopedCinemaId) : "all",
    cinemaName: isManager ? (user?.cinema_name ?? null) : null,
    /** Quản lý chưa được gán rạp — mọi API số liệu sẽ trả 403 */
    unassigned: Boolean(isManager && !scopedCinemaId),
  }
}
