"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { MovieCard } from "@/components/movie-card"
import { Loader2 } from "lucide-react"
import type { Movie } from "@/lib/api/types"

interface MovieStatusTabsProps {
  movies: Movie[]
  loading?: boolean
}

export function MovieStatusTabs({ movies, loading = false }: MovieStatusTabsProps) {
  const [activeTab, setActiveTab] = useState<string>("NOW_SHOWING")

  // Group movies by status (default to NOW_SHOWING if not set)
  const nowShowing = movies.filter(m => !m.status || m.status === "NOW_SHOWING")
  const comingSoon = movies.filter(m => m.status === "COMING_SOON")
  const upcoming = movies.filter(m => m.status === "UPCOMING")

  const renderMovieGrid = (movieList: Movie[], emptyMessage: string) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Đang tải...</span>
        </div>
      )
    }

    if (movieList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg text-muted-foreground">{emptyMessage}</p>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
        {movieList.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
    )
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-3 mb-8">
        <TabsTrigger value="NOW_SHOWING" className="text-sm sm:text-base">
          Đang Chiếu
          <span className="ml-2 text-xs bg-primary/20 px-2 py-0.5 rounded-full">
            {nowShowing.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="COMING_SOON" className="text-sm sm:text-base">
          Sắp Chiếu
          <span className="ml-2 text-xs bg-orange-500/20 px-2 py-0.5 rounded-full">
            {comingSoon.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="UPCOMING" className="text-sm sm:text-base">
          Sớm Ra Mắt
          <span className="ml-2 text-xs bg-blue-500/20 px-2 py-0.5 rounded-full">
            {upcoming.length}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="NOW_SHOWING" className="mt-6">
        {renderMovieGrid(nowShowing, "Hiện không có phim nào đang chiếu")}
      </TabsContent>

      <TabsContent value="COMING_SOON" className="mt-6">
        {renderMovieGrid(comingSoon, "Hiện không có phim nào sắp chiếu")}
      </TabsContent>

      <TabsContent value="UPCOMING" className="mt-6">
        {renderMovieGrid(upcoming, "Hiện không có phim nào sắp ra mắt")}
      </TabsContent>
    </Tabs>
  )
}
