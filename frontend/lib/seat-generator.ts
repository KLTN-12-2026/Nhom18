import type { Seat, SeatLayout } from "@/lib/api/types"

export function generateSeats(
  showtimeId: number,
  availableSeats: number,
  totalSeats: number,
  basePrice: number,
  roomCapacity?: number, // Optional: use room capacity if provided
  bookedSeats?: string[], // Optional: array of actually booked seat codes like ["A1", "B5"]
  // Sơ đồ + hạng ghế + giá từng hạng do SERVER gửi xuống (/api/showtimes/:id).
  // Khi có, đây là NGUỒN SỰ THẬT DUY NHẤT: client không tự suy ra giá nữa.
  // Các tham số layout phía trên chỉ còn dùng làm phương án dự phòng cho luồng
  // cũ chưa nhận được seat_layout, để không vỡ màn hình chọn ghế.
  serverLayout?: SeatLayout,
): Seat[] {
  const seats: Seat[] = []

  if (serverLayout?.rows?.length) {
    const bookedSet = new Set(bookedSeats || [])
    for (const row of serverLayout.rows) {
      const tier = serverLayout.rowTiers?.[row] ?? "standard"
      const tierPrice = Number(serverLayout.tierPricing?.[tier]?.price) || Number(basePrice) || 0
      for (let n = 1; n <= serverLayout.seatsPerRow; n++) {
        const id = `${row}${n}`
        seats.push({
          id,
          row,
          number: n,
          status: bookedSet.has(id) ? "occupied" : "available",
          price: tierPrice,
          tier,
        })
      }
    }
    return seats
  }

  // QUAN TRỌNG: `basePrice` đến từ showtime.price — cột DECIMAL trong MySQL,
  // được mysql2 trả về dưới dạng CHUỖI (vd "156000.00"), không phải number,
  // dù kiểu TypeScript khai báo là `number`. Nếu không ép kiểu ngay từ đầu,
  // `price += 3`/`price += 2` bên dưới sẽ là PHÉP NỐI CHUỖI ("156000.00" +
  // 3 = "156000.003", không phải 156003) thay vì cộng số — khiến toàn bộ
  // tiền phụ thu ghế đẹp (hàng đầu/ghế giữa) bị NỐI THÀNH CHUỖI RÁC rồi biến
  // mất khi Math.round(price*100)/100 ép kiểu số ở cuối, làm tính năng "ghế
  // premium" hoàn toàn không có tác dụng (mọi ghế cùng giá bằng giá gốc).
  const numericBasePrice = Number(basePrice) || 0

  // Use room capacity if provided, otherwise fall back to totalSeats
  const actualCapacity = roomCapacity || totalSeats || 100
  
  // Dynamic layout based on capacity
  let rows: string[]
  let seatsPerRow: number
  
  if (actualCapacity <= 60) {
    // Phòng ghế ngả (Gold Class / Premium): 6 hàng x 10 ghế = 60
    rows = ["A", "B", "C", "D", "E", "F"]
    seatsPerRow = 10
  } else if (actualCapacity <= 80) {
    // Small room: 8 rows x 10 seats = 80
    rows = ["A", "B", "C", "D", "E", "F", "G", "H"]
    seatsPerRow = 10
  } else if (actualCapacity <= 100) {
    // Medium room: 10 rows x 10 seats = 100
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
    seatsPerRow = 10
  } else if (actualCapacity <= 120) {
    // Medium-large room: 10 rows x 12 seats = 120
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
    seatsPerRow = 12
  } else if (actualCapacity <= 140) {
    // Large room: 10 rows x 14 seats = 140
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
    seatsPerRow = 14
  } else if (actualCapacity <= 156) {
    // Extra large room: 12 rows x 13 seats = 156
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]
    seatsPerRow = 13
  } else {
    // Phòng IMAX: 14 hàng x 16 ghế = 224 — bậc lớn nhất.
    // Phải khớp với backend/config/seatTiers.config.js (ROOM_LAYOUTS).
    rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"]
    seatsPerRow = 16
  }

  // Create a Set for fast lookup of booked seats
  const bookedSeatsSet = new Set(bookedSeats || [])

  // Generate seats
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]

    for (let seatNumber = 1; seatNumber <= seatsPerRow; seatNumber++) {
      const seatId = `${row}${seatNumber}`

      // KHÔNG cộng thêm phụ thu "ghế đẹp" (hàng đầu/ghế giữa) ở đây — backend
      // (paymentController.js) tính tiền vé bằng showtime.price × số ghế, MỌI
      // ghế cùng 1 mức giá, không hề biết tới khái niệm phụ thu theo vị trí.
      // Trước đây UI cộng thêm +3/+2 (đơn vị tàn dư từ lúc giá còn tính bằng
      // USD) khiến số tiền hiển thị trước khi thanh toán lệch với số tiền
      // thật bị trừ — hiển thị đúng giá thật để không đánh lừa người dùng.
      const price = numericBasePrice

      // Check if this seat is actually booked
      const status = bookedSeatsSet.has(seatId) ? "occupied" : "available"

      seats.push({
        id: seatId,
        row,
        number: seatNumber,
        status,
        price: Math.round(price * 100) / 100, // Round to 2 decimal places
      })
    }
  }

  return seats.sort((a, b) => {
    if (a.row !== b.row) {
      return a.row.localeCompare(b.row)
    }
    return a.number - b.number
  })
}
