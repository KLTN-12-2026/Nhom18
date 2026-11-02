const { calculateSeatPricing, getAllowedTicketTypes, getMovieMinAge } = require('../utils/ticketPricing')
const { getSeatTier, buildSeatLayout } = require('../utils/seatLayout')

describe('Phân hạng ghế theo vị trí', () => {
  // Phòng 140 ghế = 10 hàng A-J (khớp sơ đồ frontend đang dùng, xem ROOM_LAYOUTS)
  test('hàng đầu = thường, hàng giữa = VIP, hàng cuối = premium', () => {
    expect(getSeatTier('A1', 140)).toBe('standard')
    expect(getSeatTier('C14', 140)).toBe('standard')
    expect(getSeatTier('D8', 140)).toBe('vip')
    expect(getSeatTier('H1', 140)).toBe('vip')
    expect(getSeatTier('I5', 140)).toBe('premium')
    expect(getSeatTier('J14', 140)).toBe('premium')
  })

  test('mã ghế lạ -> hạng thường (hệ số 1.0), không ném lỗi giữa luồng đặt vé', () => {
    expect(getSeatTier('ZZ99', 140)).toBe('standard')
    expect(getSeatTier('', 140)).toBe('standard')
    expect(getSeatTier(undefined, 140)).toBe('standard')
  })

  test('bảng giá từng hạng làm tròn tới 1.000đ để khớp giá tính cho từng ghế', () => {
    const layout = buildSeatLayout(140, 138000)
    expect(layout.tierPricing.standard.price).toBe(138000)
    expect(layout.tierPricing.vip.price).toBe(166000) // 138000 × 1.2 = 165600 -> 166000
    expect(layout.tierPricing.premium.price).toBe(186000) // × 1.35 = 186300 -> 186000

    // Giá trên chú thích PHẢI bằng giá thật tính cho 1 ghế cùng hạng, nếu
    // không khách sẽ thấy bảng giá một đằng, tiền trừ một nẻo.
    const p = calculateSeatPricing(['A1', 'D1', 'J1'], 138000, {}, { roomCapacity: 140 })
    expect(p.seatPrices.A1).toBe(layout.tierPricing.standard.price)
    expect(p.seatPrices.D1).toBe(layout.tierPricing.vip.price)
    expect(p.seatPrices.J1).toBe(layout.tierPricing.premium.price)
  })
})

describe('Ràng buộc độ tuổi theo phân loại phim', () => {
  test('ánh xạ nhãn phim sang tuổi tối thiểu', () => {
    expect(getMovieMinAge('R')).toBe(18)
    expect(getMovieMinAge('PG-13')).toBe(13)
    expect(getMovieMinAge('PG')).toBe(0)
    expect(getMovieMinAge('G')).toBe(0)
    // Nhãn lạ / để trống -> 0, không chặn oan phim cũ chưa gắn nhãn
    expect(getMovieMinAge('KHONG-BIET')).toBe(0)
    expect(getMovieMinAge(null)).toBe(0)
  })

  // Nhãn phân loại phim quyết định AI ĐƯỢC VÀO XEM; loại vé chỉ là MỨC GIÁ ưu
  // đãi — hai việc khác nhau. Vé "Học sinh - Sinh viên" trải từ 13 tới ngoài 20
  // tuổi nên LUÔN có thể có người đủ tuổi; khoá cả nhóm sẽ từ chối oan sinh
  // viên 20 tuổi. Chỉ vé "Trẻ em" (trần 12 tuổi) là không thể có ai đủ tuổi.
  test('phim 18+ chỉ khoá vé trẻ em; học sinh-sinh viên vẫn mua được (kiểm tra tuổi tại rạp)', () => {
    const allowed = Object.fromEntries(
      getAllowedTicketTypes('R').types.map((t) => [t.key, t.allowed]),
    )
    expect(allowed).toEqual({ adult: true, senior: true, student: true, child: false })
  })

  test('phim 16+ cũng chỉ khoá vé trẻ em', () => {
    const allowed = Object.fromEntries(
      getAllowedTicketTypes('T16').types.map((t) => [t.key, t.allowed]),
    )
    expect(allowed).toEqual({ adult: true, senior: true, student: true, child: false })
  })

  test('phim 13+ chỉ khoá vé trẻ em; học sinh-sinh viên vẫn mua được', () => {
    const allowed = Object.fromEntries(
      getAllowedTicketTypes('PG-13').types.map((t) => [t.key, t.allowed]),
    )
    expect(allowed).toEqual({ adult: true, senior: true, student: true, child: false })
  })

  test('phim mọi lứa tuổi cho phép tất cả loại vé', () => {
    expect(getAllowedTicketTypes('PG').types.every((t) => t.allowed)).toBe(true)
  })

  test('SERVER chặn loại vé sai độ tuổi kể cả khi client gửi thẳng lên', () => {
    // Giao diện đã ẩn lựa chọn này, nhưng request có thể bị sửa tay.
    const r = calculateSeatPricing(['A1'], 138000, { A1: 'child' }, { roomCapacity: 140, movieRating: 'R' })
    expect(r.forbiddenType).toBe('child')
    expect(r.minAge).toBe(18)
    expect(r.seatPrices).toBeUndefined() // không được trả về giá khi đã bị chặn
  })

  test('không truyền movieRating -> bỏ qua kiểm tra tuổi (giữ tương thích luồng cũ)', () => {
    const r = calculateSeatPricing(['A1'], 138000, { A1: 'child' }, { roomCapacity: 140 })
    expect(r.forbiddenType).toBeUndefined()
    expect(r.seatPrices.A1).toBe(83000) // 138000 × 1.0 × 0.6 = 82800 -> 83000
  })

  test('giá kết hợp cả hạng ghế lẫn loại vé', () => {
    // Ghế VIP (×1.2) + vé cao tuổi (×0.7) trên phim 18+ (cao tuổi hợp lệ)
    const r = calculateSeatPricing(['D1'], 138000, { D1: 'senior' }, { roomCapacity: 140, movieRating: 'R' })
    expect(r.seatPrices.D1).toBe(116000) // 138000 × 1.2 × 0.7 = 115920 -> 116000
    expect(r.seatTiers.D1).toBe('vip')
  })
})
