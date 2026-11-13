import { apiFetch } from "../client"

export interface ChatbotIntentRow { intent: string; count: number }
export interface ChatbotSentimentRow { sentiment: string; count: number }
export interface ChatbotDownvotedRow {
  id: number
  message: string
  reply: string
  intent: string | null
  ai_available: number
  voted_at: string
}

export interface ChatbotUnansweredRow {
  id: number
  message: string
  created_at: string
}

export interface ChatbotDailyTrendRow {
  date: string
  total: number
  aiCount: number
  fallbackCount: number
  unansweredCount: number
  upvotes: number
  downvotes: number
}

export interface ChatbotTrendPeriodMetrics {
  total: number
  aiRate: number | null
  unansweredRate: number | null
  satisfactionRate: number | null
}

export interface ChatbotTrendComparison {
  today: ChatbotTrendPeriodMetrics
  yesterday: ChatbotTrendPeriodMetrics
  last7Days: ChatbotTrendPeriodMetrics
  prev7Days: ChatbotTrendPeriodMetrics
}

export interface ChatbotAnalytics {
  days: number
  summary: { total: number; aiCount: number; fallbackCount: number; hasCardsCount: number }
  intents: ChatbotIntentRow[]
  sentiments: ChatbotSentimentRow[]
  feedback: { up: number; down: number; total: number }
  recentDownvoted: ChatbotDownvotedRow[]
  recentUnanswered: ChatbotUnansweredRow[]
  dailyTrend: ChatbotDailyTrendRow[]
  trendComparison: ChatbotTrendComparison
}

export async function getChatbotAnalytics(days = 30): Promise<ChatbotAnalytics> {
  return apiFetch(`/api/chatbot-ai/analytics?days=${days}`)
}

export async function resetMarkovChain(): Promise<{ success: boolean }> {
  return apiFetch("/api/chatbot-ai/analytics/reset-markov", { method: "POST" })
}

// ─── Điều khiển chatbot từ dashboard (chỉ admin) ─────────────────────────────

export type ChatbotMode = "gemini" | "rules"

export interface ChatbotRuntimeConfig {
  /** 'gemini' = ưu tiên AI (lỗi thì tự rơi về luật cứng) | 'rules' = chỉ luật cứng */
  mode: ChatbotMode
  model: string
  /** Các model dùng được — mỗi model có hạn mức RIÊNG 20 lượt/ngày */
  models: { id: string; label: string; usedToday: number }[]
  hasKey: boolean
  /** Khoá đang dùng lấy từ đâu: admin dán trên dashboard, file .env, hay chưa có */
  keySource: "db" | "env" | "none"
  /** Khoá đã che, vd "AIzaSy••••1a2b" — backend không bao giờ trả khoá đầy đủ */
  keyMasked: string | null
  /** Giới hạn LƯỢT GỌI API mỗi ngày (gói miễn phí của Google: 20 lượt/model) */
  dailyLimit: number
  /** Số LƯỢT GỌI Gemini đã dùng hôm nay — 1 câu hỏi có thể tốn nhiều lượt */
  usedToday: number
  remaining: number
  /** Số CÂU HỎI được AI trả lời hôm nay */
  questionsToday: number
  /** Số lần Google trả 429 (hết hạn mức) hôm nay */
  quotaErrorsToday: number
  /** > 0 nghĩa là Gemini vừa báo hết hạn mức, đang tạm ngưng gọi trong bấy nhiêu giây */
  quotaCooldownSeconds: number
  /** Số khoá Gemini đang dùng — mỗi khoá là một dự án Google với hạn mức riêng */
  soKhoa: number
  /** Ước tính tổng lượt gọi/ngày = số khoá × số model × hạn mức mỗi model */
  tongSucChua: number
}

export async function getChatbotConfig(): Promise<ChatbotRuntimeConfig> {
  return apiFetch("/api/chatbot-ai/config")
}

export async function updateChatbotConfig(patch: {
  mode?: ChatbotMode
  /** Đổi model để có hạn mức mới; chuỗi rỗng = dùng GEMINI_MODEL trong .env */
  model?: string
  /** Khoá mới, hoặc nguyên link có ?key=... ; chuỗi rỗng = quay lại dùng khoá trong .env */
  apiKey?: string
  dailyLimit?: number
}): Promise<ChatbotRuntimeConfig> {
  return apiFetch("/api/chatbot-ai/config", { method: "POST", body: JSON.stringify(patch) })
}
