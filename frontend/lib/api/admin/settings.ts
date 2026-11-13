import { apiFetch } from "../client"

export interface SettingsData {
  site_name: string
  site_description: string
  maintenance_mode: boolean
  booking_enabled: boolean
  max_seats_per_booking: number
  contact_email: string
  support_phone: string
  terms_conditions: string
}

export async function getSettings(): Promise<Partial<SettingsData>> {
  const data = await apiFetch<{ settings: Partial<SettingsData> }>("/api/admin/settings")
  return data.settings || {}
}

export async function updateSettings(settings: SettingsData): Promise<void> {
  await apiFetch("/api/admin/settings", { method: "POST", body: JSON.stringify(settings) })
}

/** Was checking the wrong path (/health instead of /api/health), so backend status always showed offline. */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    await apiFetch("/api/health", { auth: false, signal: AbortSignal.timeout(3000) } as any)
    return true
  } catch {
    return false
  }
}
