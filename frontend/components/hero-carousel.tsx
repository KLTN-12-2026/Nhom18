'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrailerButton } from '@/components/trailer-button-lazy'
import { Clock, Calendar, Ticket, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Movie } from '@/lib/api/types'

interface HeroCarouselProps {
  movies: Movie[]
}

export function HeroCarousel({ movies }: HeroCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { 
      loop: true,
      duration: 20, // Faster transition for better UX
      skipSnaps: false,
    },
    [Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })]
  )

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([])

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev()
  }, [emblaApi])

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext()
  }, [emblaApi])

  const scrollTo = useCallback(
    (index: number) => {
      if (emblaApi) emblaApi.scrollTo(index)
    },
    [emblaApi]
  )

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    setScrollSnaps(emblaApi.scrollSnapList())
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)

    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('reInit', onSelect)
    }
  }, [emblaApi, onSelect])

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  // Phim nổi bật đọc từ CSDL (cột movies.featured_order), KHÔNG ghim cứng ID
  // trong mã nguồn nữa. Trước đây danh sách là mảng [21, 54, 70, 76, 74] nằm
  // ngay tại đây, kéo theo hai vấn đề: đổi phim banner phải build lại cả
  // frontend, và backend không thể biết banner đang chiếu phim nào nên bộ sinh
  // lịch chiếu tự động không ưu tiên được đúng 5 phim này (xem migration 31).
  const featuredMovies = useMemo(() => {
    if (!movies || movies.length === 0) return []

    const featured = movies
      .filter((m) => m.featured_order != null)
      .sort((a, b) => (a.featured_order as number) - (b.featured_order as number))

    // Chưa đánh dấu đủ 5 phim thì lấp bằng các phim còn lại, để banner không
    // bị hụt ô nếu ai đó bỏ đánh dấu một phim.
    if (featured.length < 5) {
      const ids = new Set(featured.map((m) => m.id))
      return [...featured, ...movies.filter((m) => !ids.has(m.id)).slice(0, 5 - featured.length)]
    }

    return featured.slice(0, 5)
  }, [movies])

  return (
    <section className="relative overflow-hidden">
      {featuredMovies.length === 0 ? (
        // Placeholder when no movies
        <div className="h-[70vh] bg-gradient-to-br from-gray-900 via-black to-gray-900" />
      ) : (
        <>
          {/* Carousel Container */}
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {featuredMovies.map((movie) => (
                <div key={movie.id} className="flex-[0_0_100%] min-w-0">
              <div className="relative h-[85vh] md:h-[90vh] overflow-hidden">
                {/* Cinematic gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-black to-gray-900" />
                
                {/* Full screen background with optimized layout */}
                <div className="absolute inset-0 flex flex-col md:flex-row items-center justify-center md:justify-between gap-8 md:gap-16 px-6 md:px-12 lg:px-20 py-12">
                  {/* Left: Content - Compact and centered */}
                  <div className="relative flex items-center justify-center z-10 w-full md:w-auto md:flex-1 max-w-2xl">
                    <div className="w-full space-y-4 md:space-y-6">
                      <Badge variant="secondary" className="mb-2 text-xs md:text-sm animate-in fade-in slide-in-from-bottom-3 duration-500 inline-block">
                        🎬 Phim nổi bật
                      </Badge>

                      {/* Cỡ chữ theo ĐỘ DÀI tiêu đề, không ghim cứng theo id như trước
                          (chỉ id 76/74 được thu nhỏ) — "Spider-Man: Brand New Day" ở cỡ
                          lớn nhất tràn 3 dòng, đẩy cả khối nội dung lệch khỏi các slide khác.
                          Tiêu đề dài dùng đúng NỬA cỡ chữ của tiêu đề ngắn (48px so với
                          96px trên desktop): 2 dòng nhỏ cao bằng 1 dòng lớn, nên nút
                          "Đặt vé ngay" nằm cùng một vị trí ở mọi slide. */}
                      <h1 className={`${
                        movie.title.length > 14
                          ? 'text-3xl md:text-4xl lg:text-5xl'
                          : 'text-5xl md:text-7xl lg:text-8xl'
                      } font-black text-white leading-tight animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 drop-shadow-2xl`}>
                        {movie.title}
                      </h1>

                      <div className="flex items-center gap-3 md:gap-4 text-white/90 flex-wrap animate-in fade-in slide-in-from-bottom-5 duration-700 delay-200">
                        <span className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
                          <Clock className="h-4 w-4" />
                          {formatDuration(movie.duration)}
                        </span>
                        <span className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
                          <Calendar className="h-4 w-4" />
                          {/* Năm phát hành GỐC — release_date là ngày khởi chiếu tại rạp
                              (phim tái chiếu 2026 như John Wick sẽ hiện sai thành 2026). */}
                          {movie.original_year ?? new Date(movie.release_date).getFullYear()}
                        </span>
                        <Badge variant="outline" className="border-white/40 text-white bg-white/5 backdrop-blur-sm">
                          {movie.rating}
                        </Badge>
                        <span className="bg-gradient-to-r from-primary to-purple-600 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-bold shadow-lg">
                          {movie.genre}
                        </span>
                      </div>

                      <p className="text-base md:text-lg text-white/85 leading-relaxed line-clamp-3 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 drop-shadow-lg">
                        {movie.description}
                      </p>

                      <div className="flex flex-col sm:flex-row gap-4 pt-2 animate-in fade-in slide-in-from-bottom-7 duration-700 delay-400">
                        <Button size="lg" asChild className="text-base md:text-lg px-8 md:px-12 py-6 shadow-2xl shadow-primary/50 hover:shadow-primary/70 hover:scale-105 transition-all duration-300 bg-gradient-to-r from-primary to-purple-600 border-0">
                          <Link href={`/movie/${movie.id}`}>
                            <Ticket className="h-5 w-5 mr-2" />
                            Đặt vé ngay
                          </Link>
                        </Button>
                        {movie.trailer_url && (
                          <TrailerButton
                            trailerUrl={movie.trailer_url}
                            movieTitle={movie.title}
                            variant="hero"
                            className="text-base md:text-lg px-8 md:px-12 hover:scale-105 transition-all duration-300"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Poster with cinematic effects */}
                  <div className="relative flex items-center justify-center md:justify-start z-10">
                    <div className="relative w-[280px] h-[420px] md:w-[340px] md:h-[510px] lg:w-[400px] lg:h-[600px] group">
                      {/* Multi-layered glow effects */}
                      <div className="absolute -inset-6 bg-gradient-to-br from-primary/50 via-purple-600/40 to-blue-600/50 rounded-3xl blur-3xl opacity-70 group-hover:opacity-90 transition-opacity duration-700 animate-pulse" />
                      <div className="absolute -inset-3 bg-gradient-to-tr from-yellow-500/20 via-pink-500/20 to-cyan-500/20 rounded-3xl blur-2xl opacity-50 group-hover:opacity-70 transition-opacity duration-700" />
                      
                      {/* Main poster container with enhanced 3D */}
                      <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] transform group-hover:scale-[1.08] group-hover:rotate-1 transition-all duration-700 ease-out">
                        <Image
                          src={movie.poster_url || '/placeholder.svg'}
                          alt={movie.title}
                          fill
                          className="object-cover object-center"
                          priority
                          quality={95}
                          sizes="(max-width: 768px) 280px, 400px"
                        />
                        
                        {/* Animated shimmer overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-tl from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-150" />
                        
                        {/* Border with gradient glow */}
                        <div className="absolute inset-0 rounded-3xl ring-[3px] ring-white/30 group-hover:ring-primary/70 group-hover:ring-[4px] transition-all duration-700" />
                      </div>

                      {/* Enhanced floating particles */}
                      <div className="absolute -top-6 -right-6 w-24 h-24 bg-gradient-to-br from-primary/40 to-purple-600/40 rounded-full blur-3xl animate-pulse" />
                      <div className="absolute -bottom-6 -left-6 w-28 h-28 bg-gradient-to-tr from-purple-600/40 to-blue-600/40 rounded-full blur-3xl animate-pulse delay-300" />
                      <div className="absolute top-1/2 -right-4 w-16 h-16 bg-pink-500/30 rounded-full blur-2xl animate-pulse delay-500" />
                    </div>
                  </div>
                </div>

                {/* Enhanced gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/60 md:from-black/85 md:via-black/20 md:to-black/50 pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/70 pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows - Enhanced design */}
      <button
        onClick={scrollPrev}
        className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-primary/80 text-white p-3 md:p-4 rounded-full transition-all duration-300 backdrop-blur-md hover:scale-110 shadow-xl hover:shadow-primary/50 border border-white/10 hover:border-primary/50"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
      </button>
      <button
        onClick={scrollNext}
        className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-primary/80 text-white p-3 md:p-4 rounded-full transition-all duration-300 backdrop-blur-md hover:scale-110 shadow-xl hover:shadow-primary/50 border border-white/10 hover:border-primary/50"
        aria-label="Next slide"
      >
        <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
      </button>

      {/* Dots Navigation - Modern design */}
      <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2 bg-black/30 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
        {scrollSnaps.map((_, index) => (
          <button
            key={index}
            onClick={() => scrollTo(index)}
            className={cn(
              'transition-all duration-300 rounded-full',
              index === selectedIndex
                ? 'w-8 h-2.5 bg-gradient-to-r from-primary to-purple-500 shadow-lg shadow-primary/50'
                : 'w-2.5 h-2.5 bg-white/40 hover:bg-white/60 hover:scale-125'
            )}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Slide Counter - Enhanced */}
      <div className="absolute top-4 md:top-6 right-4 md:right-8 z-20 bg-black/40 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-semibold border border-white/10 shadow-lg">
        <span className="text-primary">{selectedIndex + 1}</span>
        <span className="text-white/60 mx-1">/</span>
        <span className="text-white/80">{featuredMovies.length}</span>
      </div>
        </>
      )}
    </section>
  )
}
