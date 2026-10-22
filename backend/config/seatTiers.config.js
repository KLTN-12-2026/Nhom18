/**
 * PHÂN HẠNG GHẾ THEO VỊ TRÍ — nguồn sự thật DUY NHẤT cho cả giá tiền lẫn sơ đồ ghế.
 *
 * Vì sao đặt ở backend chứ không để frontend tự tính: trước đây giao diện tự
 * cộng phụ thu "ghế đẹp" trong khi backend tính tiền phẳng theo showtimes.price,
 * khiến số tiền hiển thị trước khi thanh toán KHÁC số tiền thật bị trừ. Bản vá
 * lúc đó phải gỡ bỏ phụ thu ở giao diện, để lại dòng chữ "ghế premium giá cao
 * hơn" nhưng thực tế mọi ghế cùng giá. Lần này server tính giá và TRẢ LUÔN sơ
 * đồ + hạng ghế cho client hiển thị, nên hai bên không thể lệch nhau nữa.
 *
 * Hệ số nhân vào showtimes.price (vốn đã bao gồm phụ phí khung giờ + loại
 * phòng do ShowtimeGeneratorService tính). Giá ghế thường = đúng giá gốc, các
 * hạng cao hơn cộng thêm — không hạ giá dưới mức gốc để doanh thu không giảm
 * so với cách tính cũ.
 */

const SEAT_TIERS = {
  standard: {
    key: "standard",
    label: "Ghế thường",
    priceModifier: 1.0,
    description: "Các hàng gần màn hình",
  },
  vip: {
    key: "vip",
    label: "Ghế VIP",
    priceModifier: 1.2,
    description: "Hàng giữa — góc nhìn đẹp nhất",
  },
  premium: {
    key: "premium",
    label: "Ghế Premium",
    priceModifier: 1.35,
    // Mô tả phải nói ĐÚNG thứ khách mua: sơ đồ vẽ hai ghế Premium liền
    // nhau thành một khối ghế đôi cho dễ nhận ra, nhưng MỖI NỬA vẫn là một
    // ghế riêng, tính tiền riêng — không phải mua một được hai.
    description: "Hàng cuối — ghế ngả tựa lưng cao, bố trí theo cặp",
  },
};

/**
 * Sơ đồ phòng theo sức chứa. GIỮ NGUYÊN quy tắc mà frontend đang dùng
 * (lib/seat-generator.ts) để mã ghế đã bán trước đây (A1..J14) vẫn khớp — đổi
 * quy tắc sẽ làm vé cũ trỏ tới ghế không còn tồn tại.
 */
const ROOM_LAYOUTS = [
  { maxCapacity: 60,       rows: ["A","B","C","D","E","F"],                                 seatsPerRow: 10 },
  { maxCapacity: 80,       rows: ["A","B","C","D","E","F","G","H"],                         seatsPerRow: 10 },
  { maxCapacity: 100,      rows: ["A","B","C","D","E","F","G","H","I","J"],                 seatsPerRow: 10 },
  { maxCapacity: 120,      rows: ["A","B","C","D","E","F","G","H","I","J"],                 seatsPerRow: 12 },
  { maxCapacity: 140,      rows: ["A","B","C","D","E","F","G","H","I","J"],                 seatsPerRow: 14 },
  { maxCapacity: 156,      rows: ["A","B","C","D","E","F","G","H","I","J","K","L"],         seatsPerRow: 13 },
  // Phòng IMAX — bậc lớn nhất. Trước đây bậc cuối là 12x13 = 156 và nhận MỌI
  // sức chứa từ 141 trở lên, nên phòng khai báo 200 ghế chỉ vẽ ra 156 ghế: 44
  // ghế "ma" mà available_seats vẫn đếm nhưng khách không bao giờ chọn được.
  { maxCapacity: Infinity, rows: ["A","B","C","D","E","F","G","H","I","J","K","L","M","N"], seatsPerRow: 16 },
];

/**
 * Tỷ lệ phân hạng theo hàng, tính từ màn hình trở ra:
 *  - 30% hàng đầu  -> ghế thường (gần màn hình, phải ngước nhìn)
 *  - 50% hàng giữa -> VIP
 *  - 20% hàng cuối -> Premium
 * Dùng tỷ lệ thay vì cố định tên hàng để phòng 8 hàng và phòng 12 hàng đều
 * chia hợp lý, không phải viết riêng cho từng loại phòng.
 */
const TIER_ROW_RATIOS = { standard: 0.3, vip: 0.5 /* phần còn lại là premium */ };

module.exports = { SEAT_TIERS, ROOM_LAYOUTS, TIER_ROW_RATIOS };
