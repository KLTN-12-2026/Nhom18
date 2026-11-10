import { HeroSkeleton } from "@/components/skeletons/hero-skeleton"
import { MovieGridSkeleton } from "@/components/skeletons/movie-card-skeleton"

export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 bg-card border-b" />
      <HeroSkeleton />
      <MovieGridSkeleton count={12} />
    </div>
  )
}
