export default function ShowtimesLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 bg-card border-b" />
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="h-10 w-full max-w-md bg-muted rounded animate-pulse" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex gap-4">
                <div className="h-24 w-16 bg-muted rounded animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-1/2 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
                  <div className="flex gap-2">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="h-8 w-16 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
