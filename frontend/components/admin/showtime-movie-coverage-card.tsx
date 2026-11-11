"use client"

import { Badge } from "@/components/ui/badge"
import type { GenerationPreviewMovie } from "@/lib/api/admin/auto-generate"

const TIER_STYLE: Record<string, { label: string; className: string }> = {
  HIGH: { label: "🔥 Cao", className: "bg-red-500 text-white" },
  MEDIUM: { label: "⭐ Vừa", className: "bg-orange-500 text-white" },
  LOW: { label: "📊 Thấp", className: "bg-gray-500 text-white" },
}

const SCORE_SOURCE_STYLE: Record<string, { label: string; title: string; className: string }> = {
  genre: { label: "🎬 Mới", title: "Chưa có vé/rating/yêu thích — điểm tạm theo thể loại", className: "text-orange-600" },
  tmdb: { label: "🌐 Mới", title: "Chưa có vé/rating/yêu thích — điểm tạm theo TMDb", className: "text-orange-600" },
  "genre+internal": { label: "🎬 Đang tích luỹ", title: "Đã có ít dữ liệu thật, vẫn còn pha trộn điểm thể loại", className: "text-muted-foreground" },
  "tmdb+internal": { label: "🌐 Đang tích luỹ", title: "Đã có ít dữ liệu thật, vẫn còn pha trộn điểm TMDb", className: "text-muted-foreground" },
  internal: { label: "📊 Dữ liệu thật", title: "Điểm hoàn toàn từ vé/rating/yêu thích thật", className: "text-green-600" },
}

/** Thẻ tóm tắt 1 phim — thay cho hàng bảng 12 cột dày đặc số liệu trước đây,
 * khó nhìn ra ngay phim nào ổn/phim nào thiếu suất. Thanh tiến trình "ngày có
 * suất/7" là tín hiệu trực quan quan trọng nhất: xanh = đủ cả tuần, cam/đỏ =
 * đang thiếu — admin nhìn lướt qua là biết ngay không cần đọc từng số. */
export function ShowtimeMovieCoverageCard({ movie }: { movie: GenerationPreviewMovie }) {
  const tier = TIER_STYLE[movie.popularity_tier] || TIER_STYLE.LOW
  const source = SCORE_SOURCE_STYLE[movie.scoring_source]
  const coverageRatio = movie.days_covered / 7
  const coverageColor =
    coverageRatio >= 1 ? "bg-green-500" : coverageRatio >= 0.5 ? "bg-amber-500" : coverageRatio > 0 ? "bg-orange-500" : "bg-red-500"

  return (
    <div className="rounded-lg border bg-card p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm leading-tight line-clamp-2">{movie.title}</p>
        <Badge className={`shrink-0 text-[10px] ${tier.className}`}>{tier.label}</Badge>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span title={source?.title} className={source?.className}>
          {source?.label ?? movie.scoring_source} · {Number(movie.popularity_score).toFixed(0)} điểm
        </span>
        <Badge variant="outline" className="text-[10px]">{movie.status}</Badge>
      </div>

      {/* Thanh tiến trình phủ sóng — tín hiệu trực quan chính */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>Ngày có suất</span>
          <span className={movie.days_covered < 7 ? "text-orange-600 font-medium" : "text-green-600 font-medium"}>
            {movie.days_covered}/7 ngày
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${coverageColor}`} style={{ width: `${coverageRatio * 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] pt-1 border-t">
        <div>
          <p className="font-bold text-sm">{movie.estimated_total_showtimes}</p>
          <p className="text-muted-foreground">suất/tuần</p>
        </div>
        <div title={movie.rooms_used.join("\n")}>
          <p className="font-bold text-sm">{movie.rooms_used_count}</p>
          <p className="text-muted-foreground">phòng</p>
        </div>
        <div>
          <p className="font-bold text-sm">{(movie.revenue_potential / 1000000).toFixed(1)}M</p>
          <p className="text-muted-foreground">DT tối đa</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
        <span>🎫 {movie.ticket_count} vé</span>
        <span>{movie.average_rating > 0 ? `⭐ ${Number(movie.average_rating).toFixed(1)}` : "⭐ —"}</span>
        <span>❤️ {movie.favorite_count}</span>
      </div>
    </div>
  )
}
