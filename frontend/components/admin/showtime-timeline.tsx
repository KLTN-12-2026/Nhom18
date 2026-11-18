"use client"

/**
 * LỊCH CHIẾU DẠNG DÒNG THỜI GIAN — mỗi phòng một hàng, trục ngang là giờ trong ngày.
 *
 * Vì sao thay cho bảng chữ: người xếp lịch cần trả lời đúng một câu hỏi —
 * *"phòng nào còn trống khung giờ nào"*. Bảng liệt kê theo dòng buộc họ phải
 * tự dựng lại bức tranh đó trong đầu, lần lượt từng suất. Dòng thời gian cho
 * thấy khoảng trống bằng mắt.
 *
 * Hai thứ vẽ theo dữ liệu THẬT, không ước lượng:
 *   - Độ rộng khối = thời lượng phim (`movies.duration`)
 *   - Vạch sọc sau mỗi khối = 20 phút dọn phòng (ràng buộc RB-C1 của bộ xếp lịch)
 */
import { useMemo } from "react"

export interface TimelineShowtime {
  id: number
  movie_id: number
  movie_title: string
  room_id?: number | null
  room_name?: string | null
  room_type?: string | null
  show_time: string
  duration?: number | null
  tickets_sold: number
  total_seats: number
  status?: "ACTIVE" | "CANCELLED"
}

interface Props {
  showtimes: TimelineShowtime[]
  /** Giờ mở cửa / giờ kết thúc trục, khớp OPERATING_HOURS của bộ xếp lịch */
  gioMo?: number
  gioDong?: number
  phutDonPhong?: number
  onChonSuat?: (s: TimelineShowtime) => void
}

/** Màu khối theo phim — cùng phim thì cùng màu trên mọi phòng, để nhận ra ngay. */
const BANG_MAU = [
  "#3f6ad8", "#2f9e6e", "#8e5bd1", "#e2a106", "#d1472f",
  "#1f8a63", "#8c2f39", "#c0651e", "#4a6fa5", "#6b7f3a",
]
const mauTheoPhim = (movieId: number) => BANG_MAU[movieId % BANG_MAU.length]

const phutTuChuoi = (hhmm: string) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

const hienGio = (hhmm: string) => String(hhmm || "").slice(0, 5)

export function ShowtimeTimeline({
  showtimes,
  gioMo = 9,
  gioDong = 24,
  phutDonPhong = 20,
  onChonSuat,
}: Props) {
  const tongPhut = (gioDong - gioMo) * 60
  const cacGio = useMemo(
    () => Array.from({ length: gioDong - gioMo }, (_, i) => gioMo + i),
    [gioMo, gioDong],
  )

  // Gom theo phòng. Suất chưa gán phòng vẫn phải hiện — bỏ đi thì người dùng
  // tưởng mất suất; gom chúng vào một hàng riêng có nhãn rõ ràng.
  const cacHang = useMemo(() => {
    const map = new Map<string, { ten: string; loai: string | null; ds: TimelineShowtime[] }>()
    for (const s of showtimes) {
      const khoa = s.room_name || "__chua_gan__"
      if (!map.has(khoa)) {
        map.set(khoa, {
          ten: s.room_name || "Chưa gán phòng",
          loai: s.room_name ? s.room_type || null : null,
          ds: [],
        })
      }
      map.get(khoa)!.ds.push(s)
    }
    return Array.from(map.values()).sort((a, b) => a.ten.localeCompare(b.ten, "vi"))
  }, [showtimes])

  if (!showtimes.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Không có suất chiếu nào trong ngày đã chọn.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Thước giờ */}
      <div
        className="grid border-b bg-muted/40 text-[11px] text-muted-foreground"
        style={{ gridTemplateColumns: `130px repeat(${cacGio.length}, 1fr)` }}
      >
        <div className="px-3 py-2 font-medium">Phòng chiếu</div>
        {cacGio.map((h) => (
          <div key={h} className="border-l py-2 pl-1.5 tabular-nums">
            {String(h % 24).padStart(2, "0")}:00
          </div>
        ))}
      </div>

      {/* Mỗi phòng một hàng */}
      {cacHang.map((hang) => (
        <div key={hang.ten} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: "130px 1fr" }}>
          <div className="border-r bg-muted/30 px-3 py-3">
            <div className="text-sm font-semibold leading-tight">{hang.ten}</div>
            {hang.loai && (
              <div className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {hang.loai}
              </div>
            )}
            {/* Tỉ lệ lấp đầy của cả phòng trong ngày — con số người xếp lịch
                cần nhất để biết phòng nào đang phí chỗ. */}
            {(() => {
              const ghe = hang.ds.reduce((t, x) => t + Number(x.total_seats || 0), 0)
              const ban = hang.ds.reduce((t, x) => t + Number(x.tickets_sold || 0), 0)
              const pct = ghe > 0 ? Math.round((ban / ghe) * 100) : 0
              return (
                <div className="mt-1.5 space-y-1">
                  <div className="text-[11px] text-muted-foreground">
                    {hang.ds.length} suất · {ban}/{ghe} ghế
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${pct >= 80 ? "bg-red-500" : pct >= 40 ? "bg-amber-500" : "bg-green-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">Lấp đầy {pct}%</div>
                </div>
              )
            })()}
          </div>

          <div
            className="relative h-[86px] odd:bg-muted/10"
            style={{
              backgroundImage: `repeating-linear-gradient(to right, hsl(var(--border)) 0 1px, transparent 1px calc(100%/${cacGio.length}))`,
            }}
          >
            {hang.ds.map((s) => {
              const batDau = phutTuChuoi(s.show_time)
              const thoiLuong = Number(s.duration) || 120
              // Suất nằm ngoài khung giờ vẽ (vd suất 01:00 sáng hôm sau) thì bỏ qua
              const left = ((batDau - gioMo * 60) / tongPhut) * 100
              if (left < -5 || left > 100) return null

              const width = (thoiLuong / tongPhut) * 100
              const widthDon = (phutDonPhong / tongPhut) * 100
              const daHuy = s.status === "CANCELLED"
              const tiLe = s.total_seats > 0 ? Math.round((s.tickets_sold / s.total_seats) * 100) : 0

              return (
                <div key={s.id}>
                  {/* Khoảng dọn phòng — vẽ trước để khối phim nằm đè lên viền */}
                  {!daHuy && (
                    <div
                      className="absolute top-3 h-[62px] rounded-r"
                      style={{
                        left: `${left + width}%`,
                        width: `${widthDon}%`,
                        backgroundImage:
                          "repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.25) 0 4px, transparent 4px 8px)",
                      }}
                      title={`${phutDonPhong} phút dọn phòng`}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => onChonSuat?.(s)}
                    className="absolute top-3 h-[62px] overflow-hidden rounded-md px-2 py-1.5 text-left text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring"
                    style={{
                      left: `${Math.max(left, 0)}%`,
                      width: `${Math.max(width, 3)}%`,
                      background: daHuy ? "hsl(var(--muted))" : mauTheoPhim(s.movie_id),
                      opacity: daHuy ? 0.55 : 1,
                      textDecoration: daHuy ? "line-through" : "none",
                    }}
                    title={`${s.movie_title} · ${hienGio(s.show_time)} · ${s.tickets_sold}/${s.total_seats} ghế (${tiLe}%)${daHuy ? " · ĐÃ HUỶ" : ""}`}
                  >
                    <span className="block truncate text-[12px] font-semibold leading-tight">
                      {s.movie_title}
                    </span>
                    <span className="block truncate text-[11px] opacity-90">
                      {hienGio(s.show_time)} · {thoiLuong}′
                    </span>
                    <span className="block truncate text-[11px] opacity-80">
                      {s.tickets_sold}/{s.total_seats} ghế · {tiLe}%
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Chú giải — để người dùng không phải đoán ý nghĩa màu và vạch sọc */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground [&>span:not(:last-child)]:after:ml-4 [&>span:not(:last-child)]:after:content-['·']">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-5 rounded-sm"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.25) 0 4px, transparent 4px 8px)",
            }}
          />
          {phutDonPhong} phút dọn phòng
        </span>
        <span>Độ rộng khối = thời lượng phim thật</span>
        <span>Màu = phim (cùng phim, cùng màu)</span>
        <span>Khối mờ gạch ngang = suất đã huỷ vì sự cố</span>
        <span>Bấm vào khối để sửa suất</span>
      </div>
    </div>
  )
}
