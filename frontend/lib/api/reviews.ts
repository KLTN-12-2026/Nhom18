import { apiFetch } from "./client"

export interface Review {
  id: number
  rating: number
  review_text: string
  sentiment_label?: "positive" | "neutral" | "negative" | null
  sentiment_score?: number | null
  created_at: string
  user_id: number
  username: string
  helpful_count: number
}

export async function getReviews(movieId: number): Promise<Review[]> {
  const data = await apiFetch<{ reviews: Review[] }>(`/api/reviews/${movieId}`, { auth: false })
  return Array.isArray(data.reviews) ? data.reviews : []
}

export interface SubmitReviewResponse {
  success: boolean
  message: string
  moderationStatus: "approved" | "flagged"
  moderationReason: string | null
  pointsAwarded: number
}

export async function submitReview(
  movieId: number,
  input: { rating: number | null; review_text: string },
): Promise<SubmitReviewResponse> {
  return apiFetch(`/api/reviews/${movieId}`, { method: "POST", body: JSON.stringify(input) })
}

/** Note: backend deletes by movieId (the authenticated user's own review for that movie), not by reviewId. */
export async function deleteReview(movieId: number): Promise<void> {
  await apiFetch(`/api/reviews/${movieId}`, { method: "DELETE" })
}

export async function markReviewHelpful(reviewId: number): Promise<void> {
  await apiFetch(`/api/reviews/${reviewId}/helpful`, { method: "POST" })
}

export async function submitRating(
  movieId: number,
  rating: number,
): Promise<{ averageRating: number; ratingCount: number }> {
  return apiFetch(`/api/ratings/${movieId}`, { method: "POST", body: JSON.stringify({ rating }) })
}
