export default function BookingLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 bg-card border-b" />
      <div className="container mx-auto px-4 py-8">
        <div className="h-6 w-64 bg-muted rounded animate-pulse mb-8" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 border rounded-lg p-6 space-y-4">
            <div className="h-2 w-full max-w-md bg-primary/20 rounded animate-pulse mx-auto" />
            <div className="grid gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-1 justify-center">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <div key={j} className="w-8 h-8 bg-muted rounded-t-lg animate-pulse" />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="border rounded-lg p-4 h-64 bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  )
}
