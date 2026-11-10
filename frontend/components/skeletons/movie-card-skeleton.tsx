import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function MovieCardSkeleton() {
  return (
    <Card className="overflow-hidden bg-card border-border">
      {/* Poster skeleton */}
      <div className="relative aspect-[3/4] overflow-hidden">
        <Skeleton className="w-full h-full" />
      </div>

      <CardContent className="p-4">
        {/* Title and rating */}
        <div className="flex items-start justify-between mb-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-5 w-10 ml-2" />
        </div>

        {/* Duration and genre */}
        <div className="flex items-center gap-4 mb-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>

        {/* Description */}
        <div className="space-y-2 mb-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </CardContent>
    </Card>
  )
}

export function MovieGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <Skeleton className="h-9 w-48" />
          <div className="h-px bg-gradient-to-r from-primary/50 to-transparent flex-1 ml-8" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
          {Array.from({ length: count }).map((_, i) => (
            <MovieCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
