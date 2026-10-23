const {
  TICKET_TYPE_PRICE_MODIFIERS,
  TICKET_TYPE_LABELS,
  TICKET_TYPE_AGE,
  RATING_MIN_AGE,
} = require("../config/ticketPricing.config");
const { SEAT_TIERS } = require("../config/seatTiers.config");
const { getSeatTier } = require("./seatLayout");

/** Tuổi tối thiểu để xem 1 phim theo nhãn phân loại. Nhãn lạ -> 0 (không chặn). */
function getMovieMinAge(rating) {
  if (!rating) return 0;
  return RATING_MIN_AGE[String(rating).trim().toUpperCase()] ?? 0;
}

/**
 * Các loại vé được phép mua cho 1 phim.
 *
 * QUY TẮC: chỉ chặn một loại vé khi NGƯỜI LỚN TUỔI NHẤT của nhóm đó vẫn chưa
 * đủ tuổi xem phim — tức là khi KHÔNG THỂ có người hợp lệ nào trong nhóm.
 *
 * Trước đây quy tắc là "minAge của nhóm >= giới hạn phim", nghĩa là chặn cả
 * nhóm khi nhóm CÓ THỂ chứa người chưa đủ tuổi. Điều đó đúng với vé "Trẻ em"
 * (0-12 tuổi, không ai đủ tuổi xem phim T13) nhưng SAI với vé "Học sinh -
 * Sinh viên": nhóm này trải từ 13 tới ngoài 20 tuổi, nên một sinh viên đại
 * học 20 tuổi bị từ chối mua vé sinh viên cho phim T16 dù họ hoàn toàn đủ
 * tuổi vào rạp. Thực tế, nhãn phân loại phim quyết định AI ĐƯỢC VÀO XEM, còn
 * loại vé chỉ là MỨC GIÁ ƯU ĐÃI — hai việc khác nhau. Rạp kiểm tra tuổi và
 * thẻ học sinh/sinh viên ngay tại cửa, đúng như câu chú thích trách nhiệm mà
 * hệ thống đã hiển thị sẵn (TICKET_TYPE_DISCLAIMER).
 *
 * @returns {{ minAge: number, types: Array<{ key, label, allowed, reason?, priceModifier }> }}
 */
function getAllowedTicketTypes(rating) {
  const minAge = getMovieMinAge(rating);
  const types = Object.keys(TICKET_TYPE_PRICE_MODIFIERS).map((key) => {
    const cfg = TICKET_TYPE_AGE[key] || {};
    // maxAge chỉ được khai báo cho nhóm có TRẦN tuổi rõ ràng (hiện chỉ "Trẻ em").
    // Nhóm không có trần (student/adult/senior) luôn có thể chứa người đủ tuổi.
    const allowed = cfg.maxAge === undefined ? true : cfg.maxAge >= minAge;
    return {
      key,
      label: TICKET_TYPE_LABELS[key],
      priceModifier: TICKET_TYPE_PRICE_MODIFIERS[key],
      allowed,
      reason: allowed ? undefined : `Phim này yêu cầu người xem từ ${minAge} tuổi trở lên`,
    };
  });
  return { minAge, types };
}

/**
 * Tính giá từng ghế = giá suất chiếu × hệ số HẠNG GHẾ × hệ số LOẠI VÉ.
 *
 * `seatTypesInput` ({ [seatCode]: type }) do client gửi, ghế thiếu thì mặc
 * định 'adult' để các luồng cũ (đặt vé từ admin, script) không vỡ.
 *
 * Server LUÔN tự tính lại giá và tự kiểm tra độ tuổi — không tin số tiền hay
 * loại vé client gửi lên. Truyền `movieRating` để bật kiểm tra độ tuổi; không
 * truyền thì bỏ qua (giữ tương thích cho nơi gọi chưa cập nhật).
 *
 * @returns {{ seatPrices, seatsTotal, seatTiers } | { invalidSeat } | { forbiddenType, forbiddenSeat, minAge }}
 */
function calculateSeatPricing(seats, basePrice, seatTypesInput, { roomCapacity, movieRating } = {}) {
  const seatPrices = {};
  const seatTiers = {};
  let seatsTotal = 0;

  const minAge = movieRating !== undefined ? getMovieMinAge(movieRating) : 0;

  for (const seatCode of seats) {
    const type = seatTypesInput?.[seatCode] || "adult";
    const typeModifier = TICKET_TYPE_PRICE_MODIFIERS[type];
    if (typeModifier === undefined) {
      return { invalidSeat: seatCode };
    }

    // Chặn ngay ở server: giao diện có thể bị sửa để gửi lên loại vé bị cấm.
    // Dùng CÙNG quy tắc với getAllowedTicketTypes() ở trên — chỉ chặn nhóm mà
    // người lớn tuổi nhất vẫn chưa đủ tuổi (thực tế chỉ có vé "Trẻ em").
    // Hai chỗ này BẮT BUỘC phải khớp nhau: nếu lệch, giao diện cho chọn một
    // loại vé rồi server lại từ chối đúng loại đó — hoặc tệ hơn, giao diện ẩn
    // đi nhưng server vẫn nhận.
    const typeCfg = TICKET_TYPE_AGE[type] || {};
    if (minAge > 0 && typeCfg.maxAge !== undefined && typeCfg.maxAge < minAge) {
      return { forbiddenType: type, forbiddenSeat: seatCode, minAge };
    }

    const tier = getSeatTier(seatCode, roomCapacity);
    const tierModifier = SEAT_TIERS[tier]?.priceModifier ?? 1.0;

    const price = Math.round((basePrice * tierModifier * typeModifier) / 1000) * 1000;
    seatPrices[seatCode] = price;
    seatTiers[seatCode] = tier;
    seatsTotal += price;
  }

  return { seatPrices, seatsTotal, seatTiers };
}

module.exports = { calculateSeatPricing, getAllowedTicketTypes, getMovieMinAge };
