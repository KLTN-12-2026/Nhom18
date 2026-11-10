"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * Cho phép admin ẩn bớt các mục menu, khối dashboard, hoặc khối trang chủ
 * mà họ ít dùng. Đây CHỈ là tuỳ chọn hiển thị cá nhân lưu trên trình duyệt
 * (localStorage) — KHÔNG phải phân quyền:
 * - Ẩn khỏi UI, nhưng route/API/chức năng phía sau vẫn hoạt động bình thường
 * - Không ngăn truy cập trực tiếp qua URL
 * - Chỉ áp dụng trên trình duyệt hiện tại, admin khác không bị ảnh hưởng
 */
export interface ToggleableItem {
  key: string
  label: string
}

// "Trang chủ" và "Cài đặt hệ thống" không cho ẩn để admin luôn có đường vào bật lại.
export const ADMIN_MENU_ITEMS: ToggleableItem[] = [
  { key: "/admin/movies", label: "Danh sách phim" },
  { key: "/admin/cinemas", label: "Quản lý rạp chiếu" },
  { key: "/admin/rooms", label: "Quản lý phòng chiếu" },
  { key: "/admin/showtimes", label: "Quản lý suất chiếu" },
  { key: "/admin/auto-generate-showtimes", label: "Tự động tạo lịch chiếu" },
  { key: "/admin/vouchers", label: "Mã giảm giá" },
  { key: "/admin/points", label: "Điểm thưởng" },
  { key: "/admin/users", label: "Người dùng" },
  { key: "/admin/bookings", label: "Quản lý đặt vé" },
  { key: "/admin/reviews", label: "Kiểm duyệt đánh giá" },
  { key: "/admin/reports", label: "Báo cáo thống kê" },
  { key: "/admin/chatbot", label: "Xu hướng Chatbot AI" },
]

export const DASHBOARD_WIDGETS: ToggleableItem[] = [
  { key: "widget:admin-stats", label: "Thống kê tổng quan (KPI)" },
  { key: "widget:operational-kpis", label: "KPI vận hành (lấp đầy, vé chờ, vé hủy)" },
  { key: "widget:revenue-chart", label: "Biểu đồ doanh thu" },
  { key: "widget:today-showtimes", label: "Suất chiếu hôm nay" },
  { key: "widget:top-movies-chart", label: "Top phim theo doanh thu" },
  { key: "widget:recent-bookings", label: "Đặt vé gần đây" },
  { key: "widget:cinemas-revenue-chart", label: "So sánh doanh thu giữa rạp" },
  { key: "widget:chatbot-control", label: "Điều khiển chatbot (Gemini / luật cứng)" },
]

export const HOMEPAGE_SECTIONS: ToggleableItem[] = [
  { key: "home:hero-carousel", label: "Banner phim nổi bật (đầu trang)" },
  { key: "home:today-showtimes", label: "Suất chiếu hôm nay" },
  { key: "home:schedule-tabs", label: "Lịch chiếu phim (Đang chiếu/Sắp chiếu/Sớm ra mắt)" },
  { key: "home:recommended", label: "Đề xuất cho bạn" },
]

export const MOVIE_DETAIL_SECTIONS: ToggleableItem[] = [
  { key: "movie:similar-movies", label: "Phim tương tự (trang chi tiết phim)" },
]

export const USER_FEATURES: ToggleableItem[] = [
  { key: "feature:favorites", label: "Yêu thích (header & menu di động)" },
]

const DEFAULT_HIDDEN_KEYS: string[] = []

const STORAGE_KEY = "admin_hidden_ui_items"
const EVENT_NAME = "admin-menu-prefs-changed"

export function getHiddenItems(): string[] {
  if (typeof window === "undefined") return DEFAULT_HIDDEN_KEYS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    // Chưa từng tuỳ chỉnh gì (raw === null) -> áp dụng danh sách ẩn mặc định.
    // Đã tuỳ chỉnh rồi (kể cả đã lưu thành []) -> tôn trọng đúng lựa chọn đã lưu.
    if (raw === null) return DEFAULT_HIDDEN_KEYS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : DEFAULT_HIDDEN_KEYS
  } catch {
    return DEFAULT_HIDDEN_KEYS
  }
}

function setHiddenItems(hidden: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden))
  window.dispatchEvent(new Event(EVENT_NAME))
}

export function setItemHidden(key: string, hidden: boolean) {
  const current = getHiddenItems()
  const next = hidden ? [...new Set([...current, key])] : current.filter((k) => k !== key)
  setHiddenItems(next)
}

/** Đăng ký callback khi danh sách ẩn thay đổi (cùng tab hoặc tab khác). Trả về hàm hủy đăng ký. */
export function onMenuPrefsChanged(cb: () => void) {
  window.addEventListener(EVENT_NAME, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(EVENT_NAME, cb)
    window.removeEventListener("storage", cb)
  }
}

/** Hook tiện dụng: trả về danh sách key đang bị ẩn, tự cập nhật khi có thay đổi. */
export function useHiddenItems(): string[] {
  const [hidden, setHidden] = useState<string[]>([])
  const refresh = useCallback(() => setHidden(getHiddenItems()), [])

  useEffect(() => {
    refresh()
    return onMenuPrefsChanged(refresh)
  }, [refresh])

  return hidden
}

// Giữ tên cũ để không phải sửa lại admin-sidebar.tsx
export const getHiddenMenuItems = getHiddenItems
export const setMenuItemHidden = setItemHidden
