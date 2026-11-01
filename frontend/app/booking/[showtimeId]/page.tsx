"use client"

export const dynamic = "force-dynamic"

import { useState, useMemo, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Header } from "@/components/header"
import { Breadcrumb } from "@/components/breadcrumb"
import { SeatMap } from "@/components/seat-map"
import type { SeatLayout } from "@/lib/api/types"
import { BookingSummary } from "@/components/booking-summary"
import { BookingProgress } from "@/components/booking-progress"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Clock, Calendar, MapPin, Ticket } from "lucide-react"
import { generateSeats } from "@/lib/seat-generator"
import { getPublicContact } from "@/lib/api/settings"
import { releaseSeats } from "@/lib/api/seat-locks"
import { useAuth } from "@/lib/auth"
import { useSeatSocket } from "@/hooks/use-socket"
import { getShowtimeById } from "@/lib/api/showtimes"

interface BookingPageProps {
  params: {
    showtimeId: string
  }
}

export default function BookingPage({ params }: BookingPageProps) {
  const router = useRouter()
  const showtimeId = Number.parseInt(params.showtimeId)
  const { user } = useAuth()

  const [showtime, setShowtime] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([])
  const [selectingSeats, setSelectingSeats] = useState<string[]>([]) // Seats being selected by other users
  // Giới hạn ghế mỗi lượt lấy từ Cài đặt của admin — chính con số mà máy chủ
  // dùng để cưỡng chế. Ghi cứng ở đây thì giao diện hứa một đằng, máy chủ
  // chặn một nẻo (trang chọn ghế từng ghi 8 trong khi cài đặt là 10).
  const [gioiHanGhe, setGioiHanGhe] = useState(10)
  // Ghế khách VỪA chủ động bỏ chọn. Cần sổ riêng này vì lệnh nhả khoá gửi lên
  // máy chủ mất một nhịp mới xong, mà trong lúc đó đợt làm mới định kỳ (20
  // giây) có thể trả về my_locked_seats CŨ — vẫn còn ghế đó — và hiệu ứng bên
  // dưới sẽ nhét nó trở lại danh sách đã chọn. Với khách thì trông như "bấm bỏ
  // chọn mà không bỏ được".
  const vuaNhaRef = useRef<Set<string>>(new Set())
  // Mốc hết hạn GIỮ CHỖ TẠM khi đang chọn ghế (khác với khoá 15 phút ở bước
  // thanh toán). Máy chủ đã có sẵn cơ chế 5 phút và tự nhả ghế, nhưng trước
  // đây KHÔNG hiện ra cho khách thấy — ghế biến mất mà không hiểu vì sao.
  // Mốc này do MÁY CHỦ gửi xuống, không phải client tự đếm.
  const [hanChonGhe, setHanChonGhe] = useState<number | null>(null)
  const [giayConLai, setGiayConLai] = useState(0)
  const [vuaHetGioChon, setVuaHetGioChon] = useState(false)
  // Bản sao luôn-mới-nhất của danh sách ghế đang chọn, để các hàm xử lý sự kiện
  // socket đọc được giá trị hiện tại mà không cần đưa vào danh sách phụ thuộc
  // (đưa vào sẽ phải đăng ký lại socket mỗi lần chọn một ghế).
  const gheDangChonRef = useRef<string[]>([])
  useEffect(() => {
    getPublicContact()
      .then((c) => { if (c?.max_seats_per_booking) setGioiHanGhe(c.max_seats_per_booking) })
      .catch(() => {})
  }, [])

  // Có 2 nguồn ĐỘC LẬP cùng gọi getShowtimeById và ghi vào cùng state
  // `showtime`: lần tải đầu (mount) và reloadShowtime() (khi socket báo
  // 'seats-purchased'). Nếu không sắp thứ tự, 1 request tải đầu chạy chậm
  // (mạng yếu) có thể resolve SAU 1 lần reload nhanh hơn do có người vừa mua
  // vé — kết quả CŨ (trước khi mua) ghi đè lên kết quả MỚI, khiến ghế vừa
  // được mua hiện lại "còn trống" sai trên UI. Dùng số thứ tự request: chỉ
  // request mới nhất được phép ghi vào state, response nào đến sau nhưng
  // thuộc 1 request đã bị request khác "vượt mặt" thì bị bỏ qua.
  const requestSeqRef = useRef(0)

  const fetchShowtime = async () => {
    const seq = ++requestSeqRef.current
    try {
      const data = await getShowtimeById(showtimeId)
      if (seq !== requestSeqRef.current) return
      setShowtime(data)
      setErrorMessage(null)
    } catch (err) {
      if (seq !== requestSeqRef.current) return
      console.error('Failed to load showtime:', err)
      setErrorMessage((err as Error)?.message || String(err))
      setShowtime(null)
    } finally {
      if (seq === requestSeqRef.current) setLoading(false)
    }
  }

  // Function to reload showtime data
  const reloadShowtime = fetchShowtime

  // Real-time seat selection with Socket.io
  const { isConnected, connectionFailed, selectSeats, deselectSeats } = useSeatSocket({
    showtimeId,
    userId: user?.id || null,
    onSeatsSelected: (data) => {
      // Another user selected seats
      if (data.userId !== user?.id) {
        setSelectingSeats(prev => [...new Set([...prev, ...data.seats])])
      }
    },
    onSeatsDeselected: (data) => {
      if (data.userId !== user?.id) {
        // Người khác bỏ chọn — ghế hết nhấp nháy tím.
        setSelectingSeats(prev => prev.filter(seat => !data.seats.includes(seat)))
        return
      }
      // Ghế của CHÍNH MÌNH bị máy chủ nhả.
      //
      // CHỈ xử lý khi lý do là HẾT GIỜ. Cùng tên sự kiện này còn được phát khi
      // socket rớt (tải lại trang, chuyển tab) — và vì thông báo gửi cho CẢ
      // PHÒNG nên chính tab mới của khách cũng nhận được. Không lọc theo lý do
      // thì mỗi lần bấm F5 là ghế đang chọn biến sạch kèm dòng chữ "đã hết
      // thời gian giữ chỗ" trong khi đồng hồ còn hơn 4 phút.
      if (data.lyDo !== "het-han") return

      // Trước đây nhánh này bị bỏ qua hoàn toàn (chỉ xử lý khi userId KHÁC
      // mình), nên máy chủ đã nhả ghế cho người khác giành mà giao diện vẫn
      // hiện "đã chọn" — khách bấm thanh toán mới biết ghế không còn.
      //
      // Đọc state hiện tại qua ref rồi mới quyết định, KHÔNG gọi setState lồng
      // trong hàm cập nhật của setState khác: reactStrictMode đang bật nên hàm
      // cập nhật bị gọi hai lần, side-effect bên trong sẽ chạy nhân đôi.
      const dangChon = gheDangChonRef.current
      const biNha = data.seats.filter((seat) => dangChon.includes(seat))
      if (biNha.length === 0) return

      setVuaHetGioChon(true)
      setSelectedSeatIds((prev) => prev.filter((seat) => !data.seats.includes(seat)))
      if (biNha.length === dangChon.length) setHanChonGhe(null)
    },
    onActiveSelections: (selections) => {
      // Initial load of active selections
      const otherUserSeats = selections
        .filter(s => !s.isCurrentUser)
        .map(s => s.seatId)
      setSelectingSeats(otherUserSeats)
    },
    onSeatsLocked: (data) => {
      // Người khác vừa GIỮ ghế ở bước thanh toán. Sự kiện 'đang chọn ghế' không
      // bắn ở bước đó, nên nếu không tải lại thì sơ đồ vẫn hiện ghế còn trống.
      reloadShowtime()
      setSelectedSeatIds((prev) => prev.filter((seat) => !data.seats.includes(seat)))
    },
    onSeatsUnlocked: () => {
      // Người khác bỏ giữ (hoặc huỷ thanh toán) — ghế trống trở lại.
      reloadShowtime()
    },
    onMySelectionExpiry: (data) => {
      // Máy chủ báo ghế mình vừa chọn giữ tới lúc nào. Luôn lấy mốc MUỘN NHẤT
      // vì mỗi lần chọn thêm ghế là gia hạn cho ghế đó.
      setHanChonGhe((truoc) => Math.max(truoc || 0, data.expiresAt))
      setVuaHetGioChon(false)
    },
    onSeatsPurchased: (data) => {
      // Someone purchased seats - reload showtime data
      reloadShowtime()
      // Clear selecting seats for purchased seats
      setSelectingSeats(prev => prev.filter(seat => !data.seats.includes(seat)))
      // Also clear own selection if any conflicting seats
      setSelectedSeatIds(prev => prev.filter(seat => !data.seats.includes(seat)))
    }
  })

  // Khôi phục ghế đã chọn khi user back lại từ trang thanh toán
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("bookingData")
      if (stored) {
        const data = JSON.parse(stored)
        if (data.showtimeId === showtimeId && Array.isArray(data.selectedSeats) && data.selectedSeats.length > 0) {
          setSelectedSeatIds(data.selectedSeats.map((s: any) => s.id))
        }
      }
    } catch (_) {}
  }, [showtimeId])

  // Ghế CHÍNH MÌNH đang giữ (server trả ở my_locked_seats) phải hiện là "đã
  // chọn", không phải đỏ. Đây là nguồn đáng tin hơn sessionStorage ở trên:
  // khoá nằm trong CSDL nên vẫn đúng khi khách mở tab khác, tải lại trang, hay
  // quay lại bằng nút Back của trình duyệt (không bấm nút "Quay lại" trên trang).
  useEffect(() => {
    const cuaToi: string[] = showtime?.my_locked_seats || []
    // Máy chủ đã xác nhận nhả xong ghế nào thì xoá ghế đó khỏi sổ, để lần sau
    // khách chọn lại vẫn bình thường.
    for (const ghe of [...vuaNhaRef.current]) {
      if (!cuaToi.includes(ghe)) vuaNhaRef.current.delete(ghe)
    }
    const canThem = cuaToi.filter((ghe) => !vuaNhaRef.current.has(ghe))
    if (!canThem.length) return
    setSelectedSeatIds((prev) => {
      const gop = new Set([...prev, ...canThem])
      return gop.size === prev.length ? prev : [...gop]
    })
  }, [showtime?.my_locked_seats])

  useEffect(() => { gheDangChonRef.current = selectedSeatIds }, [selectedSeatIds])

  /**
   * Đồng hồ đếm lùi, bám theo MỐC của máy chủ (không phải bộ đếm tự chạy ở
   * client) — tải lại trang không làm đồng hồ nhảy về đủ 5 phút.
   *
   * Việc dọn khi hết giờ nằm NGAY TRONG nhịp đếm, so sánh với Date.now().
   *
   * TUYỆT ĐỐI KHÔNG tách thành một useEffect riêng phụ thuộc vào `giayConLai`.
   * Bản trước làm vậy và gây lỗi nặng: khi máy chủ xác nhận giữ chỗ,
   * `hanChonGhe` được đặt nhưng `giayConLai` TRONG CÙNG LẦN DỰNG LẠI ĐÓ vẫn
   * còn là 0 (giá trị mới chỉ được lên lịch, chưa áp dụng). Hiệu ứng dọn đọc
   * phải số 0 cũ, tưởng đã hết giờ, và xoá sạch ghế NGAY LÚC khách vừa chọn.
   * Triệu chứng: bấm ghế xong ghế biến mất, bấm lại vẫn mất — và nhật ký máy
   * chủ chỉ thấy 'select-seats' lặp đi lặp lại mà không hề có 'deselect-seats'
   * (vì chỗ dọn đó chỉ sửa giao diện, không báo gì cho máy chủ).
   */
  useEffect(() => {
    if (!hanChonGhe || selectedSeatIds.length === 0) { setGiayConLai(0); return }

    const nhip = () => {
      const con = Math.max(0, Math.ceil((hanChonGhe - Date.now()) / 1000))
      setGiayConLai(con)
      if (con > 0) return
      // Thật sự hết giờ — dọn ở client phòng khi máy chủ báo chậm, để khách
      // không bấm thanh toán bằng ghế đã bị nhả cho người khác.
      setVuaHetGioChon(true)
      setSelectedSeatIds([])
      setHanChonGhe(null)
      fetchShowtime()
    }

    nhip()
    const id = setInterval(nhip, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hanChonGhe, selectedSeatIds.length])

  useEffect(() => {
    fetchShowtime()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showtimeId])

  // Sơ đồ ghế phải tự làm mới: ghế bị người khác GIỮ ở bước thanh toán chỉ nằm
  // trong bảng khoá (server trả ở locked_seats), và socket có thể rớt giữa chừng.
  // 20 giây/lần đủ nhanh để không ai chọn trúng ghế người khác đang giữ, mà chỉ
  // tốn 1 request nhỏ. Tab ẩn thì không gọi.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) fetchShowtime()
    }, 20000)
    const lamMoiKhiQuayLai = () => fetchShowtime()
    window.addEventListener("focus", lamMoiKhiQuayLai)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", lamMoiKhiQuayLai)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showtimeId])

  // Generate seats for this showtime
  const seats = useMemo(() => {
    if (!showtime) return []
    const roomCapacity = showtime.room_capacity || showtime.total_seats
    // Gộp booked + locked của NGƯỜI KHÁC để hiện đỏ (occupied).
    //
    // `locked_seats` nay đã KHÔNG còn chứa khoá của chính mình (server tách ra
    // `my_locked_seats`). Trước đây gộp tất cả nên khách bấm sang bước thanh
    // toán — hệ thống giữ ghế cho họ — rồi quay lại đổi ghế thì thấy chính ghế
    // mình đang giữ bị đỏ và không bấm lại được.
    const allOccupied = [...(showtime.booked_seats || []), ...(showtime.locked_seats || [])]
    // Ưu tiên sơ đồ + giá do server gửi (showtime.seat_layout) — client không
    // tự tính giá ghế nữa, tránh lệch với số tiền thật khi thanh toán.
    return generateSeats(
      showtimeId, showtime.available_seats, showtime.total_seats, showtime.price,
      roomCapacity, allOccupied, (showtime as any).seat_layout,
    )
  }, [showtimeId, showtime])

  const seatLayout = (showtime as any)?.seat_layout as SeatLayout | undefined

  // Đọc trực tiếp từ URL thay vì useSearchParams để không phải bọc trang trong
  // <Suspense> (yêu cầu của Next.js App Router với useSearchParams).
  const [holdExpired, setHoldExpired] = useState(false)
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("expired") === "1") {
      setHoldExpired(true)
    }
  }, [])

  const handleSeatSelect = (seatId: string) => {
    setSelectedSeatIds((prev) => {
      const wasSelected = prev.includes(seatId)
      
      if (wasSelected) {
        // Deselect seat
        const newSelection = prev.filter((id) => id !== seatId)
        
        // Emit deselect event to other users
        if (user?.id) {
          deselectSeats([seatId])
        }

        // NHẢ KHOÁ THẬT nếu ghế này đang được CHÍNH MÌNH giữ trong CSDL (đã
        // bấm sang bước thanh toán rồi quay lại đổi ghế).
        //
        // Trước đây bỏ chọn chỉ đổi giao diện: khoá 15 phút trong CSDL vẫn
        // nguyên, nên (1) người khác vẫn thấy ghế đó màu đỏ suốt 15 phút dù
        // mình đã bỏ, và (2) đợt làm mới kế tiếp thấy ghế vẫn thuộc về mình
        // nên tự chọn lại — khách bấm bỏ chọn mà ghế không chịu bỏ.
        if ((showtime?.my_locked_seats || []).includes(seatId)) {
          vuaNhaRef.current.add(seatId)
          releaseSeats(showtimeId, [seatId]).finally(() => fetchShowtime())
        }

        return newSelection
      } else {
        // Chọn thêm ghế — giới hạn lấy từ Cài đặt của admin, không ghi cứng.
        // Ghi cứng số 8 ở đây là chỗ cuối cùng còn sót sau khi đã thống nhất
        // giới hạn về một nguồn duy nhất.
        if (prev.length < gioiHanGhe) {
          const newSelection = [...prev, seatId]

          // Emit select event to other users
          if (user?.id) {
            selectSeats([seatId])
          }

          return newSelection
        }
        return prev
      }
    })
  }

  // Update seat statuses based on selection
  const seatsWithSelection = seats.map((seat) => ({
    ...seat,
    status: selectedSeatIds.includes(seat.id) ? ("selected" as const) : seat.status,
  }))

  const selectedSeats = seatsWithSelection.filter((seat) => seat.status === "selected")

  const handleProceedToPayment = () => {
    if (selectedSeats.length === 0) return

    const bookingData = {
      showtimeId,
      selectedSeats: selectedSeats.map((seat) => ({
        id: seat.id,
        row: seat.row,
        number: seat.number,
        price: seat.price,
      })),
    }
    sessionStorage.setItem("bookingData", JSON.stringify(bookingData))
    router.push(`/booking/${showtimeId}/payment`)
  }

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number)
    const date = new Date(year, month - 1, day)
    // Custom formatter để tránh hydration mismatch (Node.js vs Chrome locale khác nhau)
    const VN_WEEKDAYS_LONG = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"]
    const VN_MONTHS = ["tháng 1","tháng 2","tháng 3","tháng 4","tháng 5","tháng 6",
                       "tháng 7","tháng 8","tháng 9","tháng 10","tháng 11","tháng 12"]
    return `${VN_WEEKDAYS_LONG[date.getDay()]}, ${day} ${VN_MONTHS[month - 1]} ${year}`
  }

  const formatTime = (timeString: string) => {
    // HH:MM:SS format from database
    const [hours, minutes] = timeString.split(':')
    return `${hours}:${minutes}`
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  // Guarded rendering: show loading UI while fetching, and a friendly message if showtime wasn't found
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center py-20 text-muted-foreground">Đang tải dữ liệu suất chiếu…</div>
          </div>
        </main>
      </div>
    )
  }

  if (!showtime) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6">
              <Button variant="ghost" asChild>
                <Link href="/movies">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Quay lại
                </Link>
              </Button>
            </div>
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <h2 className="text-xl font-semibold mb-2">Không tìm thấy suất chiếu</h2>
              <p className="text-sm text-muted-foreground">Suất chiếu bạn yêu cầu không tồn tại hoặc đã bị xóa.</p>
              {errorMessage ? (
                <p className="text-sm text-foreground mt-2">Lỗi: {errorMessage}</p>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb */}
          <Breadcrumb
            items={[
              { label: "Phim", href: "/movies" },
              { label: showtime.movie?.title || "Movie", href: `/movie/${showtime.movie?.id}` },
              { label: "Đặt vé", icon: <Ticket className="h-4 w-4" /> }
            ]}
            className="mb-6"
          />

          {/* Booking Progress */}
          <BookingProgress currentStep={1} className="mb-8" />

          {/* Movie Header */}
          <div className="flex flex-col lg:flex-row gap-8 mb-8">
            <div className="relative w-32 h-48 shrink-0 mx-auto lg:mx-0">
              <Image
                src={showtime.movie?.poster_url || "/placeholder.svg"}
                alt={showtime.movie?.title || "Poster"}
                fill
                className="object-cover rounded-lg"
              />
            </div>

            <div className="flex-1 text-center lg:text-left">
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">{showtime.movie?.title}</h1>

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-muted-foreground mb-4">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {formatDuration(showtime.movie?.duration || 0)}
                </span>
                <Badge variant="secondary">{showtime.movie?.rating}</Badge>
                <span>{showtime.movie?.genre}</span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-center lg:justify-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{showtime.cinema?.name}</span>
                </div>

                <div className="flex items-center justify-center lg:justify-start gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(showtime.show_date)}</span>
                </div>

                <div className="flex items-center justify-center lg:justify-start gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{formatTime(showtime.show_time)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Seat Selection */}
            <div className="xl:col-span-2">
              {/* Quay lại đây vì hết thời gian giữ ghế — nói rõ lý do thay vì
                  để khách tự hỏi sao ghế mình chọn biến mất. */}
              {holdExpired && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <b>Đã hết thời gian giữ ghế.</b> Ghế bạn chọn đã được trả lại cho khách khác.
                    Vui lòng chọn ghế và hoàn tất thanh toán trong vòng 15 phút nhé!
                  </span>
                </div>
              )}
              <div className="bg-card border border-border rounded-lg p-6">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Chọn ghế của bạn</h2>
                  <p className="text-muted-foreground">
                    Chọn tối đa {gioiHanGhe} ghế. Ghế VIP và Premium ở hàng giữa/cuối có giá cao hơn — xem bảng giá bên dưới sơ đồ.
                  </p>

                  {/* ĐỒNG HỒ GIỮ CHỖ khi đang chọn ghế.
                      Máy chủ giữ ghế tạm 5 phút kể từ lúc bấm chọn rồi tự nhả
                      cho người khác. Trước đây khách không hề thấy con số này —
                      ghế đột nhiên biến mất mà không hiểu vì sao. Mốc thời gian
                      do máy chủ gửi xuống nên tải lại trang vẫn đếm tiếp đúng. */}
                  {giayConLai > 0 && selectedSeatIds.length > 0 && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`mt-3 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
                        giayConLai <= 60
                          ? "border-destructive/50 bg-destructive/10 text-destructive animate-pulse"
                          : "border-primary/40 bg-primary/10 text-primary"
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      <span>
                        Ghế đang giữ cho bạn:{" "}
                        <b className="tabular-nums">
                          {String(Math.floor(giayConLai / 60)).padStart(2, "0")}:
                          {String(giayConLai % 60).padStart(2, "0")}
                        </b>
                      </span>
                      <span className="text-xs opacity-75">
                        {giayConLai <= 60 ? "— sắp hết giờ!" : "— hết giờ ghế sẽ trả lại cho khách khác"}
                      </span>
                    </div>
                  )}

                  {vuaHetGioChon && selectedSeatIds.length === 0 && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-700 dark:text-amber-400">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <b>Đã hết thời gian giữ chỗ.</b> Ghế bạn chọn đã được trả lại cho khách khác.
                        Vui lòng chọn lại và hoàn tất thanh toán sớm hơn nhé!
                      </span>
                    </div>
                  )}
                  {!user && (
                    <p className="text-xs text-orange-600 mt-2">⚠️ Vui lòng đăng nhập để sử dụng tính năng real-time</p>
                  )}
                  {user && isConnected && (
                    <p className="text-xs text-green-600 mt-2">🟢 Real-time: Bạn sẽ thấy ghế đang được chọn bởi người khác</p>
                  )}
                  {user && !isConnected && connectionFailed && (
                    <p className="text-xs text-red-600 mt-2">🔴 Không thể kết nối real-time — 2 người vẫn có thể chọn trùng ghế, hệ thống sẽ báo xung đột khi bạn xác nhận đặt vé. Thử tải lại trang.</p>
                  )}
                  {user && !isConnected && !connectionFailed && (
                    <p className="text-xs text-orange-600 mt-2">🔴 Đang kết nối real-time...</p>
                  )}
                </div>

                <SeatMap
                  seats={seatsWithSelection}
                  onSeatSelect={handleSeatSelect}
                  selectedSeats={selectedSeatIds}
                  maxSeats={gioiHanGhe}
                  showtimeId={showtimeId}
                  selectingSeats={selectingSeats}
                  tierPricing={seatLayout?.tierPricing}
                  roomType={showtime?.room_type}
                />
              </div>
            </div>

            {/* Booking Summary */}
            <div className="xl:col-span-1">
              <BookingSummary
                showtime={showtime}
                selectedSeats={selectedSeats}
                onProceedToPayment={handleProceedToPayment}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
