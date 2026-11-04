import { apiFetch } from "../client"

export interface AdminBooking {
  reference: string
  status: string
  payment_status: string
  amount: number
  created_at: string
  movie: string
  cinema: string
  show_date: string
  show_time: string
  seats: string
  customer_name: string | null
  customer_email: string | null
}

export async function getAdminBookings(): Promise<AdminBooking[]> {
  const data = await apiFetch<{ bookings: AdminBooking[] }>("/api/admin/bookings")
  return Array.isArray(data.bookings) ? data.bookings : []
}

/** Marks the ticket cancelled and releases its seats back to the showtime. */
export async function cancelAdminBooking(reference: string | number): Promise<void> {
  await apiFetch(`/api/admin/bookings/${reference}/cancel`, { method: "POST" })
}
