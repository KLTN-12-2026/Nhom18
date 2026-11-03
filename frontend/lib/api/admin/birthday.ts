import { apiFetch } from "../client"
import type { ActiveBirthdayVoucher } from "../vouchers"

export interface BirthdayUser {
  id: number
  username: string
  full_name: string | null
  email: string
  date_of_birth: string
}

export interface BirthdayGreetingLogEntry {
  id: number
  user_id: number
  username: string
  full_name: string | null
  email: string
  created_at: string
  data: { voucherCode?: string; discountText?: string } | null
}

export interface BirthdayOverview {
  todayBirthdays: BirthdayUser[]
  recentGreetings: BirthdayGreetingLogEntry[]
  missingDobCount: number
  activeVoucher: ActiveBirthdayVoucher | null
}

export async function getBirthdayOverview(): Promise<BirthdayOverview> {
  return apiFetch("/api/admin/birthday/overview")
}

export async function runBirthdayCheckNow(): Promise<{ message: string; checked: number; sent: number }> {
  return apiFetch("/api/admin/birthday/run", { method: "POST" })
}

export async function sendBirthdayToUser(userId: number): Promise<{ message: string }> {
  return apiFetch(`/api/admin/birthday/users/${userId}/send`, { method: "POST" })
}
