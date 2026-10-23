import { apiFetch } from "./client"

export async function sendChatMessage(message: string, history: unknown[]): Promise<any> {
  return apiFetch("/api/chatbot-ai/chat", { method: "POST", body: JSON.stringify({ message, history }) })
}

export async function sendChatFeedback(interactionId: number, rating: "up" | "down"): Promise<any> {
  return apiFetch("/api/chatbot-ai/feedback", { method: "POST", body: JSON.stringify({ interactionId, rating }) })
}
