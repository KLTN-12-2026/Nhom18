import { apiFetch } from "./client"
import type { Movie } from "@/lib/api/types"

export async function getFavorites(): Promise<Movie[]> {
  const data = await apiFetch<{ favorites: Movie[] }>("/api/favorites")
  return Array.isArray(data.favorites) ? data.favorites : []
}

export async function checkFavorite(movieId: number): Promise<boolean> {
  const data = await apiFetch<{ isFavorite: boolean }>(`/api/favorites/${movieId}`)
  return !!data.isFavorite
}

export async function addFavorite(movieId: number): Promise<{ message?: string }> {
  return apiFetch(`/api/favorites/${movieId}`, { method: "POST" })
}

export async function removeFavorite(movieId: number): Promise<{ message?: string }> {
  return apiFetch(`/api/favorites/${movieId}`, { method: "DELETE" })
}
