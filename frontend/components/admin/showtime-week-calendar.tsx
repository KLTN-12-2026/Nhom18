"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, Building2, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { deleteShowtimeAdmin } from "@/lib/api/admin/showtimes"
import type { GenerationScheduleItem } from "@/lib/api/admin/auto-generate"

interface Props {
  schedule: GenerationScheduleItem[]
  /** true = lịch mô phỏng (preview, chưa lưu DB) — không cho xoá từng suất vì chưa có id thật. */
  isPreview: boolean
  /** Gọi lại sau khi xoá 1 suất thành công để cha cập nhật state/đếm lại số liệu. */
  onDeleted?: (id: number) => void
}

const ROOM_TYPE_COLOR: Record<string, string> = {
  imax: "border-l-red-500",
  vip: "border-l-purple-500",
  "4dx": "border-l-blue-500",
  standard: "border-l-muted-foreground/30",
}

/** Lịch tuần TRỰC QUAN — thay cho dialog cũ (phải bấm mở, chọn ngày qua dropdown
 * ẩn, chỉ thấy 1 bảng phẳng). Luôn hiện sẵn trên trang, chọn ngày bằng tab bấm
 * 1 lần, chia theo TỪNG RẠP để thấy ngay rạp nào đang kín/trống, và cho xoá
 * TỪNG suất chiếu riêng lẻ ngay tại chỗ (khi là dữ liệu thật) thay vì phải xoá
 * cả tuần rồi tạo lại từ đầu chỉ để bỏ 1 suất không ưng ý. */
export function ShowtimeWeekCalendar({ schedule, isPreview, onDeleted }: Props) {
  const dates = useMemo(
    () => Array.from(new Set(schedule.map((s) => s.show_date))).sort(),
    [schedule],
  )
  const today = format(new Date(), "yyyy-MM-dd")
  const [selectedDate, setSelectedDate] = useState<string | null>(dates.includes(today) ? today : dates[0] ?? null)
  const [movieFilter, setMovieFilter] = useState<string>("all")
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set())

  const movieOptions = useMemo(
    () => Array.from(new Set(schedule.map((s) => s.movie_title))).sort(),
    [schedule],
  )

  if (dates.length === 0 || !selectedDate) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Chưa có suất chiếu nào để hiển thị.
      </div>
    )
  }
  // Nếu ngày đang chọn không còn nằm trong danh sách (vd đổi tuần), lấy ngày đầu tiên.
  const activeDate = dates.includes(selectedDate) ? selectedDate : dates[0]

  const dayItems = schedule.filter(
    (s) => s.show_date === activeDate && !(s.id != null && removedIds.has(s.id)) &&
      (movieFilter === "all" || s.movie_title === movieFilter),
  )
  const cinemas = Array.from(new Set(dayItems.map((s) => s.cinema_name))).sort()

  const handleDelete = async (item: GenerationScheduleItem) => {
    if (item.id == null) return
    const key = `${item.id}`
    if (!confirm(`Xoá suất "${item.movie_title}" lúc ${item.show_time.slice(0, 5)} tại ${item.cinema_name} (${item.room_name})?`)) return
    setDeletingKey(key)
    try {
      await deleteShowtimeAdmin(item.id)
      setRemovedIds((prev) => new Set(prev).add(item.id!))
      onDeleted?.(item.id)
    } catch (e: any) {
      alert(e?.message || "Không thể xoá suất chiếu này")
    } finally {
      setDeletingKey(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab ngày — LUÔN HIỆN SẴN, bấm 1 lần đổi ngày, không cần mở dropdown ẩn */}
      <div className="flex flex-wrap gap-1.5">
        {dates.map((d) => {
          const count = schedule.filter((s) => s.show_date === d && !(s.id != null && removedIds.has(s.id))).length
          const isToday = d === today
          const active = d === activeDate
          return (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`flex flex-col items-center rounded-lg border px-3 py-1.5 text-xs transition-colors min-w-[64px] ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted border-border"
              }`}
            >
              <span className="font-semibold capitalize">{format(new Date(d), "EEE", { locale: vi })}</span>
              <span className={active ? "" : "text-muted-foreground"}>{format(new Date(d), "dd/MM")}</span>
              <span className={`mt-0.5 rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>
                {count} suất{isToday ? " · Hôm nay" : ""}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Lọc theo phim:</span>
        <Select value={movieFilter} onValueChange={setMovieFilter}>
          <SelectTrigger className="h-8 w-[260px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả phim</SelectItem>
            {movieOptions.map((title) => (
              <SelectItem key={title} value={title}>{title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lưới theo RẠP — thấy ngay rạp nào kín, rạp nào trống trong cùng 1 ngày */}
      {cinemas.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground border rounded-lg border-dashed">
          Không có suất chiếu nào khớp bộ lọc trong ngày này.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {cinemas.map((cinemaName) => {
            const items = dayItems
              .filter((s) => s.cinema_name === cinemaName)
              .sort((a, b) => a.show_time.localeCompare(b.show_time))
            return (
              <div key={cinemaName} className="rounded-lg border bg-card">
                <div className="flex items-center gap-1.5 border-b px-3 py-2 text-sm font-semibold">
                  <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{cinemaName}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{items.length}</Badge>
                </div>
                <div className="max-h-[420px] overflow-y-auto p-2 space-y-1.5">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">Không có suất</p>
                  ) : (
                    items.map((s, i) => {
                      const roomColor = ROOM_TYPE_COLOR[s.room_type?.toLowerCase()] || ROOM_TYPE_COLOR.standard
                      const canDelete = !isPreview && s.id != null
                      const key = `${s.id ?? `${s.show_time}-${i}`}`
                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-2 rounded-md border-l-4 bg-muted/40 px-2 py-1.5 text-xs ${roomColor}`}
                        >
                          <span className="font-mono font-semibold shrink-0">{s.show_time.slice(0, 5)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{s.movie_title}</p>
                            <p className="truncate text-muted-foreground">
                              {s.room_name} · {s.room_type} · {s.price.toLocaleString("vi-VN")}đ
                            </p>
                          </div>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                              disabled={deletingKey === key}
                              onClick={() => handleDelete(s)}
                              aria-label="Xoá suất chiếu này"
                            >
                              {deletingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
