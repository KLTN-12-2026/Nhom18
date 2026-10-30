import { apiFetch } from "../client"
import { getCinemas } from "../cinemas"

export interface AdminCinema {
  id: number
  name: string
  address: string
  screens: number
  total_seats: number
  is_active: boolean
}

/** Forme thật trả về bởi GET /api/cinemas — Cinema (lib/api/types.ts) chỉ khai báo phần công khai tối thiểu. */
interface RawCinemaWithRooms {
  id: number
  name: string
  location: string
  is_active?: boolean
  rooms?: Array<{ cinema_id: number; id: number; name: string; room_type: string; seat_capacity: number }>
}

export async function listCinemasAdmin(): Promise<AdminCinema[]> {
  const cinemas = (await getCinemas()) as unknown as RawCinemaWithRooms[]
  return cinemas.map((c) => ({
    id: c.id,
    name: c.name,
    address: c.location || "",
    screens: c.rooms?.length || 0,
    total_seats: c.rooms?.reduce((s, r) => s + (r.seat_capacity || 0), 0) || 0,
    is_active: typeof c.is_active !== "undefined" ? Boolean(c.is_active) : true,
  }))
}

export async function createCinemaAdmin(input: { name: string; address: string; is_active: boolean }): Promise<void> {
  await apiFetch("/api/admin/cinemas", {
    method: "POST",
    body: JSON.stringify({ name: input.name, location: input.address, is_active: input.is_active }),
  })
}

export async function updateCinemaAdmin(
  id: number | string,
  input: Partial<{ name: string; address: string; is_active: boolean }>,
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.address !== undefined) body.location = input.address
  if (input.is_active !== undefined) body.is_active = input.is_active
  await apiFetch(`/api/admin/cinemas/${id}`, { method: "PUT", body: JSON.stringify(body) })
}

/**
 * If the cinema already has rooms/showtimes, the backend deactivates it
 * instead of deleting (a hard delete would cascade-delete historical
 * ticket data via the cinema -> showtimes -> tickets foreign keys).
 */
// Backend trả về message KHÁC NHAU tuỳ trường hợp: xoá thật (rạp chưa có
// phòng/suất chiếu) hoặc chỉ chuyển sang ngừng hoạt động (rạp đã có dữ liệu
// liên quan, xoá cứng sẽ mất lịch sử vé) — trả nguyên message để UI hiển thị
// đúng, không tự bịa ra "Đã xoá" trong mọi trường hợp.
export async function deleteCinemaAdmin(id: number | string): Promise<{ message: string }> {
  return apiFetch(`/api/admin/cinemas/${id}`, { method: "DELETE" })
}
