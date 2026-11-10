export default function BookingsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 bg-card border-b" />
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-3">
            <div className="h-5 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
