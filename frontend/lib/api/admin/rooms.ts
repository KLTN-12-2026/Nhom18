import { apiFetch } from "../client"

export interface AdminRoom {
  id: number
  cinema_id: number
  cinema_name?: string
  cinema_location?: string
  room_name: string
  total_seats: number
  room_type: string
  features: string[]
  is_active: boolean
}

export async function listRoomsAdmin(): Promise<AdminRoom[]> {
  const data = await apiFetch<{ rooms: AdminRoom[] }>("/api/rooms")
  return Array.isArray(data.rooms) ? data.rooms : []
}

export interface RoomFormInput {
  cinema_id: number | string
  room_name: string
  total_seats: number
  room_type: string
  features: string[]
}

export async function createRoomAdmin(input: RoomFormInput): Promise<void> {
  await apiFetch("/api/rooms", { method: "POST", body: JSON.stringify(input) })
}

export async function updateRoomAdmin(
  id: number | string,
  input: Partial<RoomFormInput & { is_active: boolean }>,
): Promise<void> {
  await apiFetch(`/api/rooms/${id}`, { method: "PUT", body: JSON.stringify(input) })
}

/** Backend luôn xoá mềm (is_active = false), không xoá cứng — an toàn dù phòng đang có suất chiếu. */
export async function deleteRoomAdmin(id: number | string): Promise<void> {
  await apiFetch(`/api/rooms/${id}`, { method: "DELETE" })
}
