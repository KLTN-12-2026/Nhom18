"use client"

export const dynamic = "force-dynamic"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { MovieCard } from "@/components/movie-card"
import { NoFavorites } from "@/components/ui/empty-state"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { MovieGridSkeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth"
import { getFavorites } from "@/lib/api/favorites"
import type { Movie } from "@/lib/api/types"

export default function FavoritesPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [favorites, setFavorites] = useState<Movie[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Chờ AuthProvider xác minh xong token — tránh đá về /login khi user
    // vẫn đang null lúc đầu (chưa đọc xong sessionStorage) dù đã đăng nhập.
    if (authLoading) return

    if (!user) {
      router.push("/login")
      return
    }

    fetchFavorites()
  }, [user, authLoading])

  const fetchFavorites = async () => {
    try {
      setFavorites(await getFavorites())
    } catch (error) {
      console.error("Fetch favorites error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Bỏ yêu thích 1 phim ngay trên trang này phải loại nó khỏi danh sách NGAY
  // — trước đây MovieCard/FavoriteButton không có cách nào báo lại cho trang
  // cha, nút tim đổi màu tại chỗ nhưng phim vẫn còn trong lưới cho tới khi
  // người dùng tự F5.
  const handleFavoriteToggle = (movieId: number, isFavorite: boolean) => {
    if (!isFavorite) {
      setFavorites((prev) => prev.filter((m) => m.id !== movieId))
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Phim yêu thích</h1>
          <p className="text-muted-foreground">
            {favorites.length} phim trong danh sách yêu thích của bạn
          </p>
        </div>

        {isLoading ? (
          <MovieGridSkeleton count={6} />
        ) : favorites.length === 0 ? (
          <NoFavorites />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {favorites.map((movie) => (
              <MovieCard key={movie.id} movie={movie} onFavoriteToggle={handleFavoriteToggle} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
