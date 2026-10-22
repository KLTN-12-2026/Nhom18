"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { HeroCarousel } from "@/components/hero-carousel"
import { MovieGrid } from "@/components/movie-grid"
import { MovieStatusTabs } from "@/components/movie-status-tabs"
import { Header } from "@/components/header"
import { MovieSearchFilter } from "@/components/movie-search-filter"
import { RecommendedMovies } from "@/components/recommended-movies"
import { TodayShowtimesSection } from "@/components/today-showtimes-section"
import { HeroSkeleton } from "@/components/skeletons/hero-skeleton"
import { MovieGridSkeleton } from "@/components/skeletons/movie-card-skeleton"
import { Filter } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useDebounce } from "@/hooks/use-debounce"
import { useHiddenItems } from "@/lib/admin-menu-prefs"
import { getMovies } from "@/lib/api/movies"
import type { Movie } from "@/lib/api/types"

export default function HomePage() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedGenre, setSelectedGenre] = useState("all")
  const [selectedRating, setSelectedRating] = useState("all")
  const [sortBy, setSortBy] = useState("popular")

  // Debounce search for better performance
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const hiddenItems = useHiddenItems()
  const isHidden = (key: string) => hiddenItems.includes(key)

  const fetchMovies = useCallback(async () => {
    try {
      const movies = await getMovies()
      setMovies(movies)
      setError(null)
    } catch (e) {
      console.error("Failed to fetch movies:", e)
      setError(e instanceof Error ? e.message : "Không thể tải phim")
      setMovies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMovies()
  }, [fetchMovies])

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

    // Search filter with debounced query
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase()
      result = result.filter(movie => 
        movie.title.toLowerCase().includes(query) ||
        movie.description.toLowerCase().includes(query)
      )
    }

    // Genre filter
    if (selectedGenre && selectedGenre !== 'all') {
      result = result.filter(movie => movie.genre === selectedGenre)
    }

    // Rating filter
    if (selectedRating && selectedRating !== 'all') {
      result = result.filter(movie => movie.rating === selectedRating)
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
        break
      case 'oldest':
        result.sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())
        break
      case 'a-z':
        result.sort((a, b) => a.title.localeCompare(b.title, 'vi'))
        break
      case 'z-a':
        result.sort((a, b) => b.title.localeCompare(a.title, 'vi'))
        break
      case 'popular':
      default:
        // Keep original order (from database)
        break
    }

    return result
  }, [movies, debouncedSearchQuery, selectedGenre, selectedRating, sortBy])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <HeroSkeleton />
        <MovieGridSkeleton count={12} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <div className="text-destructive">❌ Lỗi: {error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  const featuredMovie = filteredMovies[0]
  const hasResults = filteredMovies.length > 0
  const hasActiveFilters = debouncedSearchQuery || selectedGenre !== 'all' || selectedRating !== 'all'

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        {/* Hero Carousel - Only show when no filters active */}
        {!hasActiveFilters && movies.length > 0 && !isHidden("home:hero-carousel") && (
          <HeroCarousel movies={movies} />
        )}

        {/* Section Divider */}
        {!hasActiveFilters && !isHidden("home:today-showtimes") && (
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center gap-4">
              <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
              <div className="flex items-center gap-2 px-4">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Suất chiếu hôm nay</span>
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
              </div>
              <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
            </div>
          </div>
        )}

        {/* Today's Showtimes - Prominent section */}
        {!hasActiveFilters && !isHidden("home:today-showtimes") && (
          <TodayShowtimesSection />
        )}
        
        {/* Section Divider */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center gap-4">
            <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
            <div className="flex items-center gap-2 px-4">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Tìm phim</span>
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{animationDelay: '0.2s'}}></div>
            </div>
            <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
          </div>
        </div>
        
        {/* Search & Filter Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pb-8" id="movies">
          <MovieSearchFilter
            searchValue={searchQuery}
            genreValue={selectedGenre}
            ratingValue={selectedRating}
            sortValue={sortBy}
            onSearchChange={setSearchQuery}
            onGenreChange={setSelectedGenre}
            onRatingChange={setSelectedRating}
            onSortChange={setSortBy}
            genres={genres}
            ratings={ratings}
          />
        </div>

        {/* Results */}
        {hasResults ? (
          <>
            {/* Results counter when filters are active */}
            {hasActiveFilters && (
              <div className="container mx-auto px-4 sm:px-6 lg:px-8 mb-6">
                <div className="flex items-center gap-3">
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

                  <button
                    onClick={() => {
                      setSearchQuery("")
                      setSelectedGenre("all")
                      setSelectedRating("all")
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Xóa bộ lọc
                  </button>
                </div>
              </div>
            )}

            {!hasActiveFilters && !isHidden("home:recommended") && (
              <>
                {/* Section Divider */}
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                  <div className="flex items-center gap-4">
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
                    <div className="flex items-center gap-2 px-4">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{animationDelay: '0.4s'}}></div>
                      <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Đề xuất cho bạn</span>
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{animationDelay: '0.4s'}}></div>
                    </div>
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
                  </div>
                </div>

                <div className="container mx-auto px-4 sm:px-6 lg:px-8 mb-12">
                  <RecommendedMovies />
                </div>
              </>
            )}
            
            {/* Show Status Tabs when no filters, otherwise show filtered grid */}
            {hasActiveFilters ? (
              <MovieGrid
                movies={filteredMovies}
                title="Kết quả tìm kiếm"
              />
            ) : !isHidden("home:schedule-tabs") ? (
              <>
                {/* Section Divider */}
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                  <div className="flex items-center gap-4">
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
                    <div className="flex items-center gap-2 px-4">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{animationDelay: '0.6s'}}></div>
                      <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Khám phá phim theo trạng thái</span>
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{animationDelay: '0.6s'}}></div>
                    </div>
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
                  </div>
                </div>

                <div className="container mx-auto px-4 sm:px-6 lg:px-8 mb-16">
                  <MovieStatusTabs movies={filteredMovies} loading={loading} />
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
            <div className="text-6xl mb-4">🎬</div>
            <h3 className="text-2xl font-bold mb-2">Không tìm thấy phim</h3>
            <p className="text-muted-foreground mb-6">
              Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm
            </p>
            <button
              onClick={() => {
                setSearchQuery("")
                setSelectedGenre("all")
                setSelectedRating("all")
              }}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
