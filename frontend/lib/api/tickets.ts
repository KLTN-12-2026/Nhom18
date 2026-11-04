import { apiFetch } from "./client"

export async function getMyTickets(): Promise<any[]> {
  const data = await apiFetch<{ tickets: any[] }>("/api/tickets/my-tickets")
  return Array.isArray(data.tickets) ? data.tickets : []
}

export async function getTicketById(id: number | string): Promise<any> {
  const data = await apiFetch<{ ticket: any }>(`/api/tickets/${id}`)
  return data.ticket ?? null
}

export async function cancelMyTicket(id: number | string): Promise<void> {
  await apiFetch(`/api/tickets/${id}/cancel-my`, { method: "PUT" })
}
