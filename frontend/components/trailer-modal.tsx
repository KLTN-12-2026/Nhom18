"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Play, X, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"

interface TrailerModalProps {
  trailerUrl?: string
  movieTitle: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

// Extract YouTube video ID from various URL formats
function getYouTubeId(url: string): string | null {
  if (!url) return null
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct ID
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  
  return null
}

function TrailerModal({ trailerUrl, movieTitle, open, onOpenChange }: TrailerModalProps) {
  const [isMuted, setIsMuted] = useState(false)
  const videoId = trailerUrl ? getYouTubeId(trailerUrl) : null

  if (!videoId) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-black border-0">
        <DialogTitle className="sr-only">{movieTitle} - Trailer</DialogTitle>
        
        <div className="relative aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&rel=0`}
            title={`${movieTitle} Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
          
          {/* Custom Controls Overlay */}
          <div className="absolute top-4 right-4 flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              className="h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur"
              onClick={() => setIsMuted(!isMuted)}
              aria-label={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default TrailerModal

// Inline Trailer Button Component
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
        <TrailerModal 
          trailerUrl={trailerUrl}
          movieTitle={movieTitle}
          open={open}
          onOpenChange={setOpen}
        />
      </>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
      >
        <Play className="h-4 w-4 mr-2" />
        Trailer
      </Button>
      <TrailerModal 
        trailerUrl={trailerUrl}
        movieTitle={movieTitle}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
