import { apiFetch } from "../client"
import type { Movie } from "@/lib/api/types"

export interface MovieInput {
  title: string
  genre: string
  rating: string
  duration: number
  description: string
  release_date: string
  original_year: number | string
  poster_url: string
  trailer_url: string
  status: string
}

/**
 * Movie CRUD lives under /api/movies (staff-only for write methods), not
 * /api/admin/movies — there is no such admin-prefixed route on the backend.
 */
export async function createMovie(input: MovieInput): Promise<{ id?: number; movie?: Movie }> {
  return apiFetch("/api/movies", { method: "POST", body: JSON.stringify(input) })
}

export async function updateMovie(id: number | string, input: MovieInput): Promise<void> {
  await apiFetch(`/api/movies/${id}`, { method: "PUT", body: JSON.stringify(input) })
}

export async function deleteMovie(id: number | string): Promise<void> {
  await apiFetch(`/api/movies/${id}`, { method: "DELETE" })
}
