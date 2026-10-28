import { apiFetch } from "./client"

export interface PointTransaction {
  id: number
  amount: number
  type: "earn" | "redeem"
  reason: string
  reference_type: string | null
  reference_id: number | null
  created_at: string
}

export interface PointReward {
  id: number
  title: string
  description: string
  points_cost: number
  discount_type: "percent" | "fixed"
  discount_value: number
  max_discount_amount: number | null
  validity_days: number
}

export async function getPointsBalance(): Promise<number> {
  const data = await apiFetch<{ points: number }>("/api/points/balance")
  return data.points || 0
}

export async function getPointsHistory(limit = 50): Promise<PointTransaction[]> {
  const data = await apiFetch<{ history: PointTransaction[] }>(`/api/points/history?limit=${limit}`)
  return Array.isArray(data.history) ? data.history : []
}

export async function getPointRewards(): Promise<PointReward[]> {
  const data = await apiFetch<{ rewards: PointReward[] }>("/api/points/rewards")
  return Array.isArray(data.rewards) ? data.rewards : []
}

export async function redeemPointReward(rewardId: number): Promise<{ message: string; code: string; validUntil: string }> {
  return apiFetch(`/api/points/rewards/${rewardId}/redeem`, { method: "POST" })
}
