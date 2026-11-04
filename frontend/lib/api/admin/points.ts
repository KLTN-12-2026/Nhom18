import { apiFetch } from "../client"

export interface AdminPointReward {
  id: number
  title: string
  description: string
  points_cost: number
  discount_type: "percent" | "fixed"
  discount_value: number
  max_discount_amount: number | null
  validity_days: number
  is_active: boolean | number
  created_at: string
}

export async function listPointRewardsAdmin(): Promise<AdminPointReward[]> {
  const data = await apiFetch<{ rewards: AdminPointReward[] }>("/api/points/admin/rewards")
  return Array.isArray(data.rewards) ? data.rewards : []
}

export interface PointRewardInput {
  title: string
  description: string
  points_cost: number
  discount_type: "percent" | "fixed"
  discount_value: number
  max_discount_amount?: number | null
  validity_days?: number
  is_active?: boolean
}

export async function createPointRewardAdmin(input: PointRewardInput): Promise<void> {
  await apiFetch("/api/points/admin/rewards", { method: "POST", body: JSON.stringify(input) })
}

export async function updatePointRewardAdmin(id: number | string, input: Partial<PointRewardInput>): Promise<void> {
  await apiFetch(`/api/points/admin/rewards/${id}`, { method: "PUT", body: JSON.stringify(input) })
}

export async function deletePointRewardAdmin(id: number | string): Promise<void> {
  await apiFetch(`/api/points/admin/rewards/${id}`, { method: "DELETE" })
}
