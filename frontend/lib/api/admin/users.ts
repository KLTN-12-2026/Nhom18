import { apiFetch } from "../client"

export interface AdminUser {
  id: number
  username: string
  full_name?: string | null
  email: string
  role: string
  is_blocked: boolean
  created_at: string
  /** Rạp mà quản lý này phụ trách (chỉ có với role = cinema_manager). */
  cinema_id?: number | null
  cinema_name?: string | null
}

export interface UserStats {
  total: number
  admins: number
  blocked: number
  newThisMonth: number
}

export interface UsersPage {
  users: AdminUser[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  // Thống kê tính trên TOÀN BỘ người dùng (SQL phía server), không phải đếm
  // trên mảng users của trang hiện tại.
  stats?: UserStats
}

export async function getUsers(page = 1, limit = 200): Promise<UsersPage> {
  const data = await apiFetch<UsersPage>(`/api/admin/users?page=${page}&limit=${limit}`)
  return {
    users: Array.isArray(data.users) ? data.users : [],
    pagination: data.pagination,
    stats: data.stats,
  }
}

export async function toggleUserBlock(userId: number | string): Promise<void> {
  await apiFetch(`/api/admin/users/${userId}/toggle-block`, { method: "PUT" })
}

/**
 * @param cinemaId - BẮT BUỘC khi role = "cinema_manager": mỗi quản lý phải gắn
 *   với đúng 1 rạp, nếu không backend sẽ chặn mọi thao tác của họ.
 */
export async function updateUserRole(
  userId: number | string,
  role: string,
  cinemaId?: number | null,
): Promise<void> {
  await apiFetch(`/api/admin/users/${userId}/role`, {
    method: "PUT",
    body: JSON.stringify({ role, cinema_id: cinemaId ?? null }),
  })
}
