"use client"

/**
 * Ô TỔNG HỢP ĐIỂM ĐÁNH GIÁ — điểm trung bình, tổng lượt chấm và phân bố theo sao.
 *
 * Vì sao cần biểu đồ phân bố chứ không chỉ một con số: điểm 4.0 có thể là "ai
 * cũng thấy khá" hoặc "nửa khen hết lời, nửa chê thẳng" — hai thứ hoàn toàn
 * khác nhau khi khách quyết định có đi xem hay không. Một con số trung bình
 * giấu mất sự khác biệt đó.
 */
import { useEffect, useState } from "react"
import { Star } from "lucide-react"
import { apiFetch } from "@/lib/api/client"

interface RatingSummaryProps {
  movieId: number
  /** Dùng ngay khi chưa tải xong, tránh nhảy layout */
  initialAverage?: number
  initialCount?: number
}

interface RatingData {
  averageRating: number
  ratingCount: number
  distribution: Record<string, number>
}

export function RatingSummary({ movieId, initialAverage = 0, initialCount = 0 }: RatingSummaryProps) {
  const [data, setData] = useState<RatingData>({
    averageRating: initialAverage,
    ratingCount: initialCount,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  })

  useEffect(() => {
    let huy = false
    apiFetch<RatingData>(`/api/ratings/${movieId}`, { auth: false })
      .then((d) => {
        if (huy) return
        setData({
          averageRating: Number(d.averageRating) || 0,
          ratingCount: Number(d.ratingCount) || 0,
          distribution: d.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        })
      })
      .catch(() => {})
    return () => { huy = true }
  }, [movieId])

  const tong = data.ratingCount
  const diem = data.averageRating

  // Chưa ai chấm thì nói thẳng, đừng vẽ biểu đồ rỗng 5 vạch 0% trông như lỗi.
  if (tong === 0) {
    return (
      <div className="rounded-xl border bg-card/60 p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Star className="h-5 w-5" />
          <span className="text-sm">Phim chưa có lượt đánh giá nào — hãy là người đầu tiên.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card/60 p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* Điểm trung bình */}
        <div className="flex-none text-center sm:w-32 sm:border-r sm:pr-5">
          <div className="flex items-end justify-center gap-1">
            <span className="text-4xl font-bold leading-none text-amber-500">{diem.toFixed(1)}</span>
            <span className="pb-1 text-sm text-muted-foreground">/5</span>
          </div>
          <div className="mt-2 flex justify-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${
                  i <= Math.round(diem) ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40"
                }`}
              />
            ))}
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            {tong.toLocaleString("vi-VN")} lượt chấm
          </div>
        </div>

        {/* Phân bố theo sao */}
        <div className="flex-1 space-y-1.5">
          {[5, 4, 3, 2, 1].map((sao) => {
            const soLuot = Number(data.distribution[sao] ?? 0)
            const phanTram = tong > 0 ? (soLuot / tong) * 100 : 0
            return (
              <div key={sao} className="flex items-center gap-2.5 text-xs">
                <span className="w-7 flex-none text-muted-foreground">{sao}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${phanTram}%` }}
                  />
                </div>
                <span className="w-9 flex-none text-right text-muted-foreground tabular-nums">
                  {soLuot}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
