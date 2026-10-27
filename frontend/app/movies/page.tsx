"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Header } from "@/components/header"
import { Breadcrumb } from "@/components/breadcrumb"
import { MovieCard } from "@/components/movie-card"
import { MovieSearchFilter } from "@/components/movie-search-filter"
import { Film, Filter } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getMovies } from "@/lib/api/movies"
import type { Movie } from "@/lib/api/types"

export default function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  
  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedGenre, setSelectedGenre] = useState("all")
  const [selectedRating, setSelectedRating] = useState("all")
  const [selectedYear, setSelectedYear] = useState("all")
  const [sortBy, setSortBy] = useState("popular")

  useEffect(() => {
    loadMovies()
  }, [])

  const loadMovies = useCallback(async () => {
    try {
      setLoading(true)
      const movies = await getMovies()
      setMovies(movies)
    } catch (error) {
      console.error("Error loading movies:", error)
      setMovies([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Extract unique values for filters
  const genres = useMemo(() => {
    const uniqueGenres = new Set(movies.map(m => m.genre))
    return Array.from(uniqueGenres).sort()
  }, [movies])

  const ratings = useMemo(() => {
    const uniqueRatings = new Set(movies.map(m => m.rating))
    return Array.from(uniqueRatings).sort()
  }, [movies])

  // Filter and sort movies
  const filteredMovies = useMemo(() => {
    let result = [...movies]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (movie) =>
          movie.title.toLowerCase().includes(query) ||
          movie.description.toLowerCase().includes(query) ||
          movie.genre?.toLowerCase().includes(query)
      )
    }

    // Genre filter
    if (selectedGenre && selectedGenre !== 'all') {
      result = result.filter((movie) => movie.genre === selectedGenre)
    }

    // Rating filter
    if (selectedRating && selectedRating !== 'all') {
      result = result.filter((movie) => movie.rating === selectedRating)
    }

    // Year filter
    if (selectedYear && selectedYear !== 'all') {
      result = result.filter((movie) => {
        const movieYear = String(movie.original_year ?? new Date(movie.release_date).getFullYear())
        return movieYear === selectedYear
      })
    }

    // Sort
    switch (sortBy) {
      case "newest":
        result.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
        break
      case "oldest":
        result.sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())
        break
      case "a-z":
        result.sort((a, b) => a.title.localeCompare(b.title, "vi"))
        break
      case "z-a":
        result.sort((a, b) => b.title.localeCompare(a.title, "vi"))
        break
      case "popular":
      default:
        break
    }

    return result
  }, [movies, searchQuery, selectedGenre, selectedRating, selectedYear, sortBy])

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Phim", icon: <Film className="h-4 w-4" /> }
          ]}
          className="mb-6"
        />

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Tất cả phim</h1>
          <p className="text-muted-foreground">
            Khám phá {movies.length} bộ phim trong kho phim của chúng tôi
          </p>
        </div>

        {/* Search & Filter Component */}
        <div className="mb-8">
          <MovieSearchFilter
            searchValue={searchQuery}
            genreValue={selectedGenre}
            ratingValue={selectedRating}
            yearValue={selectedYear}
            sortValue={sortBy}
            onSearchChange={setSearchQuery}
            onGenreChange={setSelectedGenre}
            onRatingChange={setSelectedRating}
            onYearChange={setSelectedYear}
            onSortChange={setSortBy}
            genres={genres}
            ratings={ratings}
          />
        </div>

        {/* Results Count */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Tìm thấy {" "}
              <Badge variant="secondary" className="font-semibold">
                {filteredMovies.length}
              </Badge>
              {" "} phim
              {searchQuery && (
                <span className="ml-1">
                  cho <span className="font-medium text-foreground">"{searchQuery}"</span>
                </span>
              )}
            </p>
          </div>

          {/* Active filters indicator */}
          {(selectedGenre !== "all" || selectedRating !== "all" || selectedYear !== "all" || searchQuery) && (
            <button
              onClick={() => {
                setSearchQuery("")
                setSelectedGenre("all")
                setSelectedRating("all")
                setSelectedYear("all")
              }}
              className="text-xs text-primary hover:underline"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>

        {/* Movies Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] bg-muted rounded-lg" />
                <div className="mt-3 h-4 bg-muted rounded w-3/4" />
                <div className="mt-2 h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredMovies.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {filteredMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎬</div>
            <h3 className="text-xl font-semibold mb-2">Không tìm thấy phim</h3>
            <p className="text-muted-foreground mb-6">
              Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm
            </p>
            <button
              onClick={() => {
                setSearchQuery("")
                setSelectedGenre("all")
                setSelectedRating("all")
                setSelectedYear("all")
              }}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
