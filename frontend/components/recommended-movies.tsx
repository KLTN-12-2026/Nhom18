"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MovieCard } from "@/components/movie-card";
import { StaggerChildren, StaggerItem } from "@/components/animations";
import { getRecommendedMovies } from "@/lib/api/movies";
import type { Movie } from "@/lib/api/types";

export function RecommendedMovies() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecommended();
  }, []);

  const fetchRecommended = useCallback(async () => {
    try {
      const movies = await getRecommendedMovies();
      setMovies(movies);
    } catch (error) {
      console.error("Fetch recommended error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Đề xuất cho bạn</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-[3/4] bg-muted" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (movies.length === 0) return null;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Đề xuất cho bạn</h2>
        <p className="text-muted-foreground">Dựa trên sở thích và lịch sử xem phim của bạn</p>
      </div>

      <StaggerChildren>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {movies.map((movie) => (
            <StaggerItem key={movie.id}>
              <MovieCard movie={movie} />
            </StaggerItem>
          ))}
        </div>
      </StaggerChildren>
    </section>
  );
}
