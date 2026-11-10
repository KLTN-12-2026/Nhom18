"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Film, TrendingUp, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { formatVND } from "@/lib/utils"
import { getCinemasTopMovies } from "@/lib/api/admin/cinema-stats"

interface TopMovie {
  movie_id: number
  title: string
  poster_url: string | null
  tickets_sold: number
  revenue: number
}

interface CinemaTopMovies {
  cinema_id: number
  cinema_name: string
  top_movies: TopMovie[]
}

interface CinemasTopMoviesProps {
  topN?: number
  daysBack?: number
  selectedCinemaId?: string
}

export function CinemasTopMovies({ topN = 3, daysBack = 30, selectedCinemaId }: CinemasTopMoviesProps) {
  const [data, setData] = useState<CinemaTopMovies[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setData(await getCinemasTopMovies(topN, daysBack))
      } catch (error) {
        console.error('Error fetching top movies by cinemas:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [topN, daysBack])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5 text-purple-600" />
            Top phim theo từng rạp
          </CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-5 w-5 text-purple-600" />
          Top {topN} phim bán chạy theo từng rạp
        </CardTitle>
        <CardDescription>
          {daysBack} ngày gần nhất
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {data.map((cinema) => (
            <div key={cinema.cinema_id} className="border-b border-border pb-4 last:border-0 last:pb-0">
              {/* Cinema Header */}
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">{cinema.cinema_name}</h3>
              </div>

              {/* Top Movies List */}
              {cinema.top_movies.length > 0 ? (
                <div className="space-y-2">
                  {cinema.top_movies.map((movie, index) => (
                    <div 
                      key={movie.movie_id} 
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      {/* Rank Badge */}
                      <div className={`
                        flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                        ${index === 0 ? 'bg-yellow-500 text-white' : 
                          index === 1 ? 'bg-gray-400 text-white' : 
                          index === 2 ? 'bg-amber-600 text-white' : 
                          'bg-muted text-muted-foreground'}
                      `}>
                        {index + 1}
                      </div>

                      {/* Movie Poster */}
                      <div className="relative w-12 h-16 rounded overflow-hidden flex-shrink-0">
                        {movie.poster_url ? (
                          <Image
                            src={movie.poster_url}
                            alt={movie.title}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <Film className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Movie Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{movie.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {movie.tickets_sold} vé
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatVND(movie.revenue)}
                          </span>
                        </div>
                      </div>

                      {/* Trend Icon */}
                      {index === 0 && (
                        <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Chưa có dữ liệu
                </p>
              )}
            </div>
          ))}

          {data.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Không có dữ liệu hiển thị
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
