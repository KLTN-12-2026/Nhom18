"use client"

import { useState, useEffect } from "react"
import { Monitor } from "lucide-react"
import type { Seat } from "@/lib/api/types"

export type SeatStatus = "available" | "occupied" | "selected" | "selecting"

/** Màu ghế trống theo hạng — càng đắt càng nổi bật. */
const TIER_SEAT_CLASS: Record<string, string> = {
  standard: "border-border bg-secondary hover:border-primary hover:bg-primary/10 text-secondary-foreground",
  vip: "border-sky-500/60 bg-sky-500/15 hover:border-sky-400 hover:bg-sky-500/25 text-sky-700 dark:text-sky-300",
  // Premium đổi từ hổ phách sang HỒNG: vàng-gold là màu thương hiệu, đang dùng
  // cho nút hành động chính và cho ghế BẠN đã chọn. Để hạng Premium cũng vàng
  // thì ba thứ khác hẳn nhau lại cùng một sắc — nhìn trên máy chiếu không phân
  // biệt nổi. Nay gold chỉ còn dành riêng cho thương hiệu + ghế của mình.
  premium: "border-rose-500/70 bg-rose-500/15 hover:border-rose-400 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300",
}

/** Ô màu dùng trong phần chú thích bảng giá. */
const TIER_SWATCH_CLASS: Record<string, string> = {
  standard: "border-border bg-secondary",
  vip: "border-sky-500/60 bg-sky-500/25",
  premium: "border-rose-500/70 bg-rose-500/25",
}

interface SeatMapProps {
  seats: Seat[]
  onSeatSelect: (seatId: string) => void
  selectedSeats: string[]
  maxSeats?: number
  showtimeId?: number
  selectingSeats?: string[]  // Seats being selected by other users in real-time
  /** Bảng giá từng hạng do server trả về — dùng cho phần chú thích. */
  tierPricing?: Record<string, { label: string; description: string; price: number }>
  /** standard | vip | imax | 4dx — quyết định hình dạng màn chiếu. */
  roomType?: string
}

export function SeatMap({ seats, onSeatSelect, selectedSeats, maxSeats = 8, showtimeId, selectingSeats = [], tierPricing, roomType }: SeatMapProps) {
  const [hoveredSeat, setHoveredSeat] = useState<string | null>(null)

  // Group seats by row
  const seatsByRow = seats.reduce(
    (acc, seat) => {
      if (!acc[seat.row]) {
        acc[seat.row] = []
      }
      // Create a copy of seat with updated status if locked
      const seatCode = `${seat.row}${seat.number}`
      const isSelectedBySelf = selectedSeats.includes(seat.id)
      const isSelectingByOthers = selectingSeats.includes(seat.id) && !isSelectedBySelf
      
      // Only override status if someone else is selecting this seat in real-time
      const finalStatus: SeatStatus = isSelectingByOthers ? "selecting" : seat.status
      
      const updatedSeat = {
        ...seat,
        status: finalStatus
      }
      
      acc[seat.row].push(updatedSeat)
      return acc
    },
    {} as Record<string, Seat[]>,
  )

  // Sort rows alphabetically
  const sortedRows = Object.keys(seatsByRow).sort()

  /**
   * Vị trí hai lối đi, tính theo SỐ GHẾ MỖI HÀNG.
   *
   * Trước đây cố định `index === 3 || index === 6`, nên phòng 16 ghế/hàng bị
   * chia 4-3-9: lối đi lệch hẳn về một bên và khối giữa to gấp ba khối bên.
   * Rạp thật luôn chia đối xứng, khối giữa lớn nhất (ghế đẹp nhất, ít phải
   * đứng dậy nhường đường).
   *
   * Quy tắc: mỗi khối bên = 1/4 số ghế (tối thiểu 2), phần còn lại là khối
   * giữa — luôn lớn hơn hoặc bằng hai khối bên cộng lại chia đôi.
   *    10 ghế -> 2-6-2    12 ghế -> 3-6-3
   *    14 ghế -> 3-8-3    16 ghế -> 4-8-4
   */
  const soGheMoiHang = sortedRows.length ? seatsByRow[sortedRows[0]].length : 0
  const khoiBen = Math.max(2, Math.floor(soGheMoiHang / 4))
  const viTriLoiDi = new Set(
    soGheMoiHang >= 6 ? [khoiBen - 1, soGheMoiHang - khoiBen - 1] : [],
  )

  /** Điều hướng sơ đồ ghế bằng phím mũi tên — bàn phím phải đi được như chuột. */
  const dieuHuongBanPhim = (e: React.KeyboardEvent<HTMLButtonElement>, hang: string, cot: number) => {
    const phim: Record<string, [number, number]> = {
      ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
    }
    const buoc = phim[e.key]
    if (!buoc) return
    e.preventDefault()

    const chiSoHang = sortedRows.indexOf(hang)
    const hangMoi = sortedRows[chiSoHang + buoc[0]]
    if (!hangMoi) return
    const cotMoi = Math.max(0, Math.min(seatsByRow[hangMoi].length - 1, cot + buoc[1]))
    const ghe = seatsByRow[hangMoi][cotMoi]
    if (!ghe) return

    const nut = document.querySelector<HTMLButtonElement>(`[data-ghe="${ghe.id}"]`)
    nut?.focus()
  }

  /**
   * GHẾ ĐÔI — hai ghế Premium cạnh nhau vẽ liền thành MỘT khối ghế ngả, giống
   * ghế đôi (Sweetbox / Couple) ở hàng cuối rạp thật.
   *
   * Vì sao chỉ đổi cách VẼ chứ không gộp thành một ghế trong CSDL: gộp thật sẽ
   * làm hàng cuối chỉ còn một nửa số ghế, đổi mã ghế, đổi sức chứa phòng và
   * đổi cách tính tiền — mọi vé ĐÃ BÁN ở hàng đó sẽ trỏ tới ghế không còn tồn
   * tại. Vẽ liền giữ nguyên toàn bộ dữ liệu: mỗi nửa vẫn là một ghế bấm chọn
   * và tính tiền độc lập, chỉ khác là nhìn ra ngay "đây là ghế to, ghế đôi".
   *
   * Cặp được ghép TRONG TỪNG KHỐI giữa hai lối đi — không bao giờ ghép hai
   * ghế nằm hai bên lối đi. Khối lẻ ghế thì ghế cuối khối đứng một mình.
   */
  const viTriTrongCap = (index: number): "trai" | "phai" | "don" => {
    const moc = [...viTriLoiDi].sort((a, b) => a - b)
    let dauKhoi = 0
    let cuoiKhoi = soGheMoiHang - 1
    for (const m of moc) {
      if (index <= m) { cuoiKhoi = m; break }
      dauKhoi = m + 1
    }
    const lech = index - dauKhoi
    if (lech % 2 === 0) return index + 1 <= cuoiKhoi ? "trai" : "don"
    return "phai"
  }

  /** Lớp bo góc + viền để hai nửa dính liền thành một khối ghế đôi. */
  const lopGhepCap = (seat: Seat, index: number) => {
    if ((seat.tier ?? "standard") !== "premium") return { lop: "rounded-t-lg", kheHo: true }
    const vt = viTriTrongCap(index)
    if (vt === "trai") return { lop: "rounded-tl-xl rounded-bl-md border-r-0", kheHo: false }
    if (vt === "phai") return { lop: "rounded-tr-xl rounded-br-md border-l-0", kheHo: true }
    return { lop: "rounded-t-xl", kheHo: true }
  }

  const laImax = String(roomType ?? "").toLowerCase() === "imax"

  /** Nhãn đọc cho trình đọc màn hình — nói đủ vị trí, hạng, tình trạng, giá. */
  const nhanDocManHinh = (seat: Seat) => {
    const tinhTrang =
      seat.status === "occupied" ? "đã bán"
      : seat.status === "selecting" ? "người khác đang chọn"
      : seat.status === "selected" ? "bạn đã chọn"
      : "còn trống"
    const hang = tierPricing?.[seat.tier ?? "standard"]?.label ?? "Ghế thường"
    const gia = Number(seat.price).toLocaleString("vi-VN")
    return `Hàng ${seat.row} ghế ${seat.number}, ${hang}, ${tinhTrang}, ${gia} đồng`
  }

  const handleSeatClick = (seat: Seat) => {
    if (seat.status === "occupied" || seat.status === "selecting") return

    if (seat.status === "selected") {
      onSeatSelect(seat.id)
    } else if (selectedSeats.length < maxSeats) {
      onSeatSelect(seat.id)
    }
  }

  const getSeatClassName = (seat: Seat, index = 0) => {
    // Ghế Premium cao hơn 1 nấc — ghế ngả có tựa lưng cao, nhìn là thấy khác.
    const cao = (seat.tier ?? "standard") === "premium" ? "h-10" : "h-8"
    const { lop } = lopGhepCap(seat, index)
    const baseClasses =
      `w-8 ${cao} ${lop} border-2 transition-all duration-200 cursor-pointer text-xs font-medium flex items-center justify-center`

    switch (seat.status) {
      case "available":
        // Ghế trống được tô theo HẠNG để khách nhìn ra ngay vùng nào giá nào.
        // Hạng do server gửi xuống (seat.tier) — client không tự suy đoán.
        return `${baseClasses} ${TIER_SEAT_CLASS[seat.tier ?? "standard"]}`
      case "occupied":
        // BỎ opacity-75: làm mờ nền đỏ khiến chữ trắng trên nền đỏ nhạt không
        // đạt tỉ lệ tương phản 4.5:1 của WCAG AA — người nhìn kém đọc không ra
        // số ghế. Nền đặc + viền đậm vẫn đủ nói lên "không bấm được".
        return `${baseClasses} border-destructive/80 bg-destructive text-destructive-foreground cursor-not-allowed`
      case "selecting":
        return `${baseClasses} border-violet-500 bg-violet-500/25 text-violet-700 dark:text-violet-300 cursor-not-allowed animate-pulse`
      case "selected":
        return `${baseClasses} border-primary bg-primary text-primary-foreground shadow-lg scale-105`
      default:
        return baseClasses
    }
  }

  return (
    <div className="space-y-8">
      {/* Màn chiếu — IMAX vẽ CONG và DÀY, đúng đặc trưng của phòng IMAX (màn
          ôm vòng cung, cao gần kín tường). Phòng thường giữ thanh thẳng mảnh. */}
      <div className="flex flex-col items-center space-y-3">
        {laImax ? (
          <svg
            viewBox="0 0 400 46"
            className="w-full max-w-2xl h-12 text-primary"
            aria-hidden="true"
            preserveAspectRatio="none"
          >
            {/* Quầng sáng hắt xuống khán phòng */}
            <path d="M 6 40 Q 200 -4 394 40" fill="none" stroke="currentColor"
                  strokeWidth="18" strokeLinecap="round" opacity="0.12" />
            {/* Thân màn chiếu — dày gấp 5 lần thanh thẳng của phòng thường */}
            <path d="M 6 38 Q 200 -6 394 38" fill="none" stroke="currentColor"
                  strokeWidth="10" strokeLinecap="round" opacity="0.85" />
          </svg>
        ) : (
          <div className="w-full max-w-md h-2 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full opacity-60" />
        )}
        <div className="flex items-center gap-2 text-muted-foreground">
          <Monitor className="h-5 w-5" />
          <span className="text-sm font-medium">
            {laImax ? "Màn chiếu IMAX — cong, khổ lớn" : "Màn chiếu"}
          </span>
        </div>
      </div>

      {/* Seat Map */}
      <div className="w-full overflow-x-auto pb-2">
      <div role="grid" aria-label="Sơ đồ ghế phòng chiếu — dùng phím mũi tên để di chuyển giữa các ghế" className="flex flex-col items-center space-y-3 py-8 min-w-max mx-auto">
        {sortedRows.map((row) => {
          const rowSeats = seatsByRow[row].sort((a, b) => a.number - b.number)

          return (
            <div key={row} role="row" aria-label={`Hàng ${row}`} className="flex items-center gap-2">
              {/* Row Label */}
              <div className="w-8 h-8 flex items-center justify-center text-sm font-bold text-muted-foreground">
                {row}
              </div>

              {/* Seats — không dùng gap chung nữa: hai nửa ghế đôi phải DÍNH
                  nhau (khe hở 0) trong khi các ghế khác vẫn cách 4px. */}
              <div className="flex items-end">
                {rowSeats.map((seat, index) => {
                  const showAisle = viTriLoiDi.has(index)
                  const { kheHo } = lopGhepCap(seat, index)

                  return (
                    <div key={seat.id} className={`flex items-end ${kheHo ? "mr-1" : ""}`}>
                      <button
                        data-ghe={seat.id}
                        role="gridcell"
                        aria-label={nhanDocManHinh(seat)}
                        aria-disabled={seat.status === "occupied" || seat.status === "selecting"}
                        aria-pressed={seat.status === "selected"}
                        className={getSeatClassName(seat, index)}
                        onClick={() => handleSeatClick(seat)}
                        onKeyDown={(e) => dieuHuongBanPhim(e, seat.row, index)}
                        onMouseEnter={() => setHoveredSeat(seat.id)}
                        onMouseLeave={() => setHoveredSeat(null)}
                        onFocus={() => setHoveredSeat(seat.id)}
                        onBlur={() => setHoveredSeat(null)}
                        disabled={seat.status === "occupied" || seat.status === "selecting"}
                        title={nhanDocManHinh(seat)}
                      >
                        {seat.status === "selected" ? "✓" : seat.number}
                      </button>
                      {showAisle && <div className="w-4" />}
                    </div>
                  )
                })}
              </div>

              {/* Row Label (Right) */}
              <div className="w-8 h-8 flex items-center justify-center text-sm font-bold text-muted-foreground">
                {row}
              </div>
            </div>
          )
        })}
      </div>
      </div>

      {/* Bảng giá theo hạng ghế — giá lấy TRỰC TIẾP từ server nên luôn khớp
          với số tiền tính lúc thanh toán. */}
      {tierPricing && (
        <div className="pt-8 border-t border-border">
          <p className="text-sm font-medium text-center mb-3">Giá vé theo vị trí ghế</p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
            {(["standard", "vip", "premium"] as const).map((tier) => {
              const info = tierPricing[tier]
              if (!info) return null
              return (
                <div key={tier} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-t-lg border-2 ${TIER_SWATCH_CLASS[tier]}`} />
                  <div className="leading-tight">
                    <div className="text-sm font-medium">
                      {info.label} · {Number(info.price).toLocaleString("vi-VN")}đ
                    </div>
                    <div className="text-xs text-muted-foreground">{info.description}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-6 pt-8 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-t-lg border-2 border-border bg-secondary" />
          <span className="text-sm text-muted-foreground">Có thể chọn</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-t-lg border-2 border-primary bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">✓</div>
          <span className="text-sm text-muted-foreground">Đã chọn</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-t-lg border-2 border-violet-500 bg-violet-500/25 animate-pulse" />
          <span className="text-sm text-muted-foreground">Đang chọn (real-time)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-t-lg border-2 border-destructive bg-destructive opacity-75" />
          <span className="text-sm text-muted-foreground">Đã bị chiếm</span>
        </div>
      </div>

      {/* Seat Selection Info */}
      {hoveredSeat && (
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Ghế {seats.find((s) => s.id === hoveredSeat)?.row}
            {seats.find((s) => s.id === hoveredSeat)?.number} - {seats
              .find((s) => s.id === hoveredSeat)
              ?.price.toLocaleString("vi-VN", { style: "currency", currency: "VND" })}
          </p>
        </div>
      )}
    </div>
  )
}
