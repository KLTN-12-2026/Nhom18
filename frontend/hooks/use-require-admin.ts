"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"

/**
 * Bảo vệ các trang /admin/* — chờ AuthProvider xác minh xong token (loading)
 * trước khi quyết định redirect, tránh đá về /login khi user thực ra đã
 * đăng nhập nhưng AuthProvider chưa kịp xác minh xong token (cùng dạng race
 * condition đã sửa ở /bookings, /favorites, /profile).
 *
 * Trước đây mỗi trang admin tự viết lại (hoặc quên viết) logic này, dẫn tới
 * bảo vệ route không đồng nhất: một số trang không có kiểm tra quyền nào,
 * một số chỉ chặn render mà không redirect. Dùng chung 1 hook để đảm bảo
 * hành vi nhất quán trên toàn khu vực admin.
 *
 * QUAN TRỌNG: chỉ redirect về /login khi HOÀN TOÀN chưa đăng nhập. Nếu đã
 * đăng nhập nhưng thiếu quyền (vd nhân viên không có can_access_admin), đá
 * về /login sẽ tạo vòng lặp khó hiểu (user đã có session hợp lệ mà vẫn bị
 * đẩy ra trang đăng nhập) — trang gọi hook nên tự hiện thông báo "Không có
 * quyền truy cập" dựa vào cờ `forbidden` thay vì bị redirect.
 */
export function useRequireAdmin({ adminOnly = false }: { adminOnly?: boolean } = {}) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  // `adminOnly` dành cho các trang mà BACKEND yêu cầu đúng vai trò admin
  // (requireAdmin), không phải chỉ nhân viên (requireStaff): quản lý phòng
  // chiếu, mã giảm giá, điểm thưởng, cài đặt hệ thống. Nếu chỉ kiểm tra
  // can_access_admin như trước, tài khoản quản lý rạp (cinema_manager) vào được
  // các trang đó nhưng MỌI thao tác đều bị backend trả 403 và trang cài đặt
  // hiện trắng — nhìn như tính năng hỏng, thực chất là sai lớp phân quyền.
  const hasAccess = adminOnly ? !!user?.can_manage_users : !!user?.can_access_admin

  const allowed = !loading && hasAccess
  const forbidden = !loading && !!user && !hasAccess
  return { user, loading, allowed, forbidden }
}
