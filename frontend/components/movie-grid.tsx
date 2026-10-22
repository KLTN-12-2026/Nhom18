import { memo } from "react"
import { MovieCard } from "./movie-card"
import type { Movie } from "@/lib/api/types"

interface MovieGridProps {
  movies: Movie[]
  title?: string
}

const MovieGridComponent = ({ movies, title = "Now Showing" }: MovieGridProps) => {
  return (
    <section className="py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold text-foreground">{title}</h2>
          <div className="h-px bg-gradient-to-r from-primary/50 to-transparent flex-1 ml-8" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      </div>
    </section>
  )
}

MovieGridComponent.displayName = 'MovieGrid'

export const MovieGrid = memo(MovieGridComponent)
