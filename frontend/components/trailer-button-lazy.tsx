"use client"

import { lazy, Suspense, useState } from "react"
import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"
import { cn } from "@/lib/utils"

const TrailerModal = lazy(() => import("@/components/trailer-modal"))

export function TrailerButton({ 
  trailerUrl, 
  movieTitle,
  variant = "default",
  className 
}: { 
  trailerUrl?: string
  movieTitle: string
  variant?: "default" | "hero"
  className?: string
}) {
  const [open, setOpen] = useState(false)

  if (!trailerUrl) return null

  if (variant === "hero") {
    return (
      <>
        <Button
          size="lg"
          variant="outline"
          className={cn("backdrop-blur-sm bg-background/50", className)}
          onClick={() => setOpen(true)}
        >
          <Play className="h-5 w-5 mr-2" />
          Xem Trailer
        </Button>
        {open && (
          <Suspense fallback={<div />}>
            <TrailerModal 
              trailerUrl={trailerUrl}
              movieTitle={movieTitle}
              open={open}
              onOpenChange={setOpen}
            />
          </Suspense>
        )}
      </>
    )
  }

  return (
    <>
      <Button
        variant="secondary"
        className={cn("w-full", className)}
        onClick={() => setOpen(true)}
      >
        <Play className="h-4 w-4 mr-2" />
        Trailer
      </Button>
      {open && (
        <Suspense fallback={<div />}>
          <TrailerModal 
            trailerUrl={trailerUrl}
            movieTitle={movieTitle}
            open={open}
            onOpenChange={setOpen}
          />
        </Suspense>
      )}
    </>
  )
}
