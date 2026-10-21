"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TrailerButton } from "@/components/trailer-button-lazy"
import { Clock, Calendar, Ticket } from "lucide-react"
import type { Movie } from "@/lib/api/types"

interface HeroSectionProps {
  featuredMovie: Movie
}

export function HeroSection({ featuredMovie }: HeroSectionProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-[70vh] bg-background" />
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  return (
    <section className="relative h-[70vh] overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src={featuredMovie.poster_url || "/placeholder.svg"}
          alt={featuredMovie.title}
          fill
          className="object-cover"
          priority
          quality={85}
          sizes="100vw"
          placeholder="blur"
          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative h-full flex items-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-4">
              Phim nổi bật
            </Badge>

            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 text-balance">{featuredMovie.title}</h1>

            <div className="flex items-center gap-6 text-white/80 mb-6">
              <span className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {formatDuration(featuredMovie.duration)}
              </span>
              <span className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {new Date(featuredMovie.release_date).getFullYear()}
              </span>
              <Badge variant="outline" className="border-white/30 text-white">
                {featuredMovie.rating}
              </Badge>
              <span>{featuredMovie.genre}</span>
            </div>

            <p className="text-lg text-white/90 mb-8 text-pretty leading-relaxed">{featuredMovie.description}</p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" asChild className="text-lg px-8">
                <Link href={`/movie/${featuredMovie.id}`}>
                  <Ticket className="h-5 w-5 mr-2" />
                  Đặt vé
                </Link>
              </Button>
              <TrailerButton 
                trailerUrl={featuredMovie.trailer_url}
                movieTitle={featuredMovie.title}
                variant="hero"
                className="text-lg px-8"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
