import { apiFetch } from "./client"
import type { Cinema } from "@/lib/api/types"

export async function getCinemas(): Promise<Cinema[]> {
  const data = await apiFetch<{ cinemas: Cinema[] }>("/api/cinemas", { auth: false, ttl: 600 })
  return Array.isArray(data.cinemas) ? data.cinemas : []
}
