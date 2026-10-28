"use client"

import { useState, useEffect } from "react"
import { MovieCard } from "./movie-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { getMovies } from "@/lib/api/movies"
import type { Movie } from "@/lib/api/types"

interface SimilarMoviesProps {
  genre: string
  currentMovieId: number
  limit?: number
}

export function SimilarMovies({ genre, currentMovieId, limit = 6 }: SimilarMoviesProps) {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSimilarMovies = async () => {
      try {
        const movies = await getMovies()
        // Filter movies by same genre, exclude current movie
        const similar = movies
          .filter((m) => m.genre === genre && m.id !== currentMovieId)
          .slice(0, limit)

        setMovies(similar)
      } catch (error) {
        console.error("Error fetching similar movies:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchSimilarMovies()
  }, [genre, currentMovieId, limit])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Phim tương tự</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] bg-muted rounded-lg" />
                <div className="mt-2 h-4 bg-muted rounded w-3/4" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (movies.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phim tương tự</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
