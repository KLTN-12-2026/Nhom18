"use client"

/**
 * SƠ ĐỒ GHẾ XEM TRƯỚC CỦA MỘT PHÒNG CHIẾU.
 *
 * Dùng ĐÚNG quy tắc bố trí của máy chủ (`backend/utils/seatLayout.js` +
 * `config/seatTiers.config.js`). Nếu hai nơi lệch nhau thì quản trị viên thấy
 * một sơ đồ, khách đặt vé thấy sơ đồ khác — tệ hơn là không vẽ gì cả.
 *
 * Giữ hai bảng dưới đây khớp với cấu hình máy chủ khi nó thay đổi.
 */

/** Khớp ROOM_LAYOUTS ở backend/config/seatTiers.config.js */
const ROOM_LAYOUTS: { maxCapacity: number; rows: string[]; seatsPerRow: number }[] = [
  { maxCapacity: 60, rows: ["A", "B", "C", "D", "E", "F"], seatsPerRow: 10 },
  { maxCapacity: 80, rows: ["A", "B", "C", "D", "E", "F", "G", "H"], seatsPerRow: 10 },
  { maxCapacity: 100, rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], seatsPerRow: 10 },
  { maxCapacity: 120, rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], seatsPerRow: 12 },
  { maxCapacity: 140, rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], seatsPerRow: 14 },
  { maxCapacity: 156, rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], seatsPerRow: 13 },
  {
    maxCapacity: Number.POSITIVE_INFINITY,
    rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"],
    seatsPerRow: 16,
  },
]

/** Khớp TIER_ROW_RATIOS — 30% hàng đầu là thường, 50% tiếp theo là VIP */
const TIER_ROW_RATIOS = { standard: 0.3, vip: 0.5 }

export type SeatTier = "standard" | "vip" | "premium"

export const NHAN_HANG: Record<SeatTier, { ten: string; mau: string; moTa: string }> = {
  standard: { ten: "Ghế thường", mau: "bg-slate-400 dark:bg-slate-500", moTa: "Các hàng gần màn hình · ×1,0" },
  vip: { ten: "Ghế VIP", mau: "bg-amber-500", moTa: "Hàng giữa, góc nhìn đẹp nhất · ×1,2" },
  premium: { ten: "Ghế Premium", mau: "bg-orange-600", moTa: "Hàng cuối, rộng rãi nhất · ×1,35" },
}

export function layBoCuc(capacity: number) {
  const cap = Number(capacity) || 100
  const layout = ROOM_LAYOUTS.find((l) => cap <= l.maxCapacity) || ROOM_LAYOUTS[ROOM_LAYOUTS.length - 1]
  return { rows: layout.rows, seatsPerRow: layout.seatsPerRow }
}

export function hangCuaDongGhe(rowIndex: number, totalRows: number): SeatTier {
  const standardEnd = Math.ceil(totalRows * TIER_ROW_RATIOS.standard)
  const vipEnd = standardEnd + Math.ceil(totalRows * TIER_ROW_RATIOS.vip)
  if (rowIndex < standardEnd) return "standard"
  if (rowIndex < vipEnd) return "vip"
  return "premium"
}

interface Props {
  totalSeats: number
  /** "mini" cho thẻ danh sách, "full" cho khung chi tiết */
  size?: "mini" | "full"
  /** Mã ghế đang được đánh dấu (vd ghế đã bán của một suất) */
  highlight?: string[]
}

export function RoomSeatPreview({ totalSeats, size = "mini", highlight = [] }: Props) {
  const { rows, seatsPerRow } = layBoCuc(totalSeats)
  const soGheVe = rows.length * seatsPerRow
  const danhDau = new Set(highlight)

  const o = size === "full" ? "h-4 w-4 rounded-[3px]" : "h-[7px] w-[7px] rounded-[1.5px]"
  const khoangCach = size === "full" ? "gap-1.5" : "gap-[2px]"

  return (
    <div className="w-full">
      {/* Màn hình — cong về phía khán giả, để biết hàng A là hàng gần nhất */}
      <div className="mx-auto mb-2 w-[78%]">
        <div
          className={`${size === "full" ? "h-2.5" : "h-1.5"} rounded-t-full bg-gradient-to-b from-primary/70 to-primary/10`}
        />
        {size === "full" && (
          <div className="mt-1 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Màn hình
          </div>
        )}
      </div>

      <div className={`flex flex-col items-center ${khoangCach}`}>
        {rows.map((row, i) => {
          const tier = hangCuaDongGhe(i, rows.length)
          return (
            <div key={row} className={`flex items-center ${khoangCach}`}>
              {size === "full" && (
                <span className="w-4 text-right text-[10px] text-muted-foreground">{row}</span>
              )}
              {Array.from({ length: seatsPerRow }, (_, j) => {
                const ma = `${row}${j + 1}`
                const duocDanhDau = danhDau.has(ma)
                return (
                  <span
                    key={ma}
                    title={size === "full" ? `${ma} · ${NHAN_HANG[tier].ten}` : undefined}
                    className={`${o} ${duocDanhDau ? "bg-red-500" : NHAN_HANG[tier].mau} ${
                      duocDanhDau ? "" : "opacity-85"
                    }`}
                  />
                )
              })}
              {size === "full" && (
                <span className="w-4 text-[10px] text-muted-foreground">{row}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Sức chứa khai báo lệch với số ghế vẽ được là lỗi dữ liệu thật — từng
          có phòng khai 200 ghế nhưng sơ đồ chỉ ra 156, dư 44 ghế "ma" mà khách
          không bao giờ chọn được. Phải nói ra, đừng giấu. */}
      {soGheVe !== Number(totalSeats) && (
        <p className="mt-2 text-center text-[11px] text-amber-600">
          Khai báo {totalSeats} ghế nhưng sơ đồ chỉ xếp được {soGheVe} ghế
          ({rows.length} hàng × {seatsPerRow})
        </p>
      )}
    </div>
  )
}

export function ChuThichHangGhe() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      {(Object.keys(NHAN_HANG) as SeatTier[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${NHAN_HANG[k].mau}`} />
          {NHAN_HANG[k].ten}
        </span>
      ))}
    </div>
  )
}
