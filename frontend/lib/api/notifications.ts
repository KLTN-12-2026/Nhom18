import { apiFetch } from "./client"

export interface AppNotification {
  id: number
  type: string
  title: string
  message: string
  data: Record<string, any> | null
  is_read: boolean | number
  created_at: string
}

export async function getNotifications(limit = 20): Promise<AppNotification[]> {
  const data = await apiFetch<{ notifications: AppNotification[] }>(`/api/notifications?limit=${limit}`)
  return Array.isArray(data.notifications) ? data.notifications : []
}

export async function getUnreadNotificationCount(): Promise<number> {
  const data = await apiFetch<{ count: number }>("/api/notifications/unread-count")
  return data.count || 0
}

export async function markNotificationRead(id: number): Promise<void> {
  await apiFetch(`/api/notifications/${id}/read`, { method: "POST" })
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/api/notifications/read-all", { method: "POST" })
}
