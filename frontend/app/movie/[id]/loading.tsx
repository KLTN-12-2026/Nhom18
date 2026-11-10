export default function MovieDetailLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 bg-card border-b" />
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="w-48 h-72 bg-muted rounded-lg animate-pulse shrink-0" />
          <div className="flex-1 space-y-4">
            <div className="h-8 w-3/4 bg-muted rounded animate-pulse" />
            <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
            <div className="h-24 bg-muted rounded animate-pulse" />
            <div className="h-10 w-40 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
