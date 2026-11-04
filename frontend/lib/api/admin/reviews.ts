import { apiFetch } from "../client"

export interface AdminReview {
  id: number
  movie_id: number
  movie_title: string
  poster_url: string | null
  user_id: number
  username: string
  email: string
  rating: number | null
  review_text: string
  sentiment_label: "positive" | "neutral" | "negative" | null
  sentiment_score: number | null
  moderation_status: "approved" | "flagged" | "rejected"
  moderation_reason: string | null
  moderated_at: string | null
  points_awarded: boolean | number
  created_at: string
  updated_at: string
  helpful_count: number
}

export interface ReviewFilters {
  sentiment?: "positive" | "neutral" | "negative"
  movieId?: number | string
  moderationStatus?: "approved" | "flagged" | "rejected"
  limit?: number
}

export interface AdminReviewList {
  reviews: AdminReview[]
  /** Tổng số đánh giá đang chờ duyệt trên TOÀN HỆ THỐNG (không phụ thuộc bộ lọc/tab đang xem). */
  flaggedTotal: number
}

export async function listReviewsAdmin(filters: ReviewFilters = {}): Promise<AdminReviewList> {
  const params = new URLSearchParams()
  if (filters.sentiment) params.set("sentiment", filters.sentiment)
  if (filters.movieId) params.set("movieId", String(filters.movieId))
  if (filters.moderationStatus) params.set("moderationStatus", filters.moderationStatus)
  if (filters.limit) params.set("limit", String(filters.limit))
  const qs = params.toString()

  const data = await apiFetch<{ reviews: AdminReview[]; flaggedTotal?: number }>(
    `/api/reviews/admin/list${qs ? `?${qs}` : ""}`,
  )
  return {
    reviews: Array.isArray(data.reviews) ? data.reviews : [],
    flaggedTotal: Number(data.flaggedTotal) || 0,
  }
}

export async function approveReviewAdmin(reviewId: number | string): Promise<{ message: string }> {
  return apiFetch(`/api/reviews/admin/${reviewId}/approve`, { method: "POST" })
}

export async function rejectReviewAdmin(reviewId: number | string, reason?: string): Promise<{ message: string }> {
  return apiFetch(`/api/reviews/admin/${reviewId}/reject`, { method: "POST", body: JSON.stringify({ reason }) })
}

export async function deleteReviewAdmin(reviewId: number | string): Promise<void> {
  await apiFetch(`/api/reviews/admin/${reviewId}`, { method: "DELETE" })
}
