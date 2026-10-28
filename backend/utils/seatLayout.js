const { SEAT_TIERS, ROOM_LAYOUTS, TIER_ROW_RATIOS } = require("../config/seatTiers.config");

/**
 * Sơ đồ hàng/cột của phòng theo sức chứa.
 * @param {number} capacity
 * @returns {{ rows: string[], seatsPerRow: number }}
 */
function getRoomLayout(capacity) {
  const cap = Number(capacity) || 100;
  const layout = ROOM_LAYOUTS.find((l) => cap <= l.maxCapacity) || ROOM_LAYOUTS[ROOM_LAYOUTS.length - 1];
  return { rows: layout.rows, seatsPerRow: layout.seatsPerRow };
}

/**
 * Hạng của 1 hàng ghế. Nhận CHỈ SỐ hàng (0 = hàng sát màn hình).
 * @returns {'standard'|'vip'|'premium'}
 */
function getTierForRowIndex(rowIndex, totalRows) {
  const standardEnd = Math.ceil(totalRows * TIER_ROW_RATIOS.standard);
  const vipEnd = standardEnd + Math.ceil(totalRows * TIER_ROW_RATIOS.vip);
  if (rowIndex < standardEnd) return "standard";
  if (rowIndex < vipEnd) return "vip";
  return "premium";
}

/**
 * Hạng của 1 ghế theo MÃ GHẾ ("A1", "J14"...). Trả 'standard' cho mã không
 * hợp lệ hoặc hàng không nằm trong sơ đồ — an toàn hơn là ném lỗi giữa luồng
 * đặt vé, và 'standard' là hệ số 1.0 nên không bao giờ tính vượt giá gốc.
 */
function getSeatTier(seatCode, capacity) {
  const { rows } = getRoomLayout(capacity);
  const rowLetter = String(seatCode || "").match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
  const idx = rows.indexOf(rowLetter);
  if (idx === -1) return "standard";
  return getTierForRowIndex(idx, rows.length);
}

/**
 * Bảng giá từng hạng cho 1 suất chiếu — dùng để hiển thị chú thích sơ đồ ghế.
 * Làm tròn tới 1.000đ giống calculateSeatPricing để con số hiện trên chú thích
 * khớp chính xác với giá từng ghế, không lệch vài trăm đồng.
 */
function getTierPricing(basePrice) {
  const out = {};
  for (const tier of Object.values(SEAT_TIERS)) {
    out[tier.key] = {
      label: tier.label,
      description: tier.description,
      price: Math.round((Number(basePrice) || 0) * tier.priceModifier / 1000) * 1000,
    };
  }
  return out;
}

/**
 * Sơ đồ ghế đầy đủ để frontend render — server là nơi DUY NHẤT quyết định
 * ghế nào hạng gì và giá bao nhiêu.
 */
function buildSeatLayout(capacity, basePrice) {
  const { rows, seatsPerRow } = getRoomLayout(capacity);
  const rowTiers = {};
  rows.forEach((row, i) => { rowTiers[row] = getTierForRowIndex(i, rows.length); });
  return { rows, seatsPerRow, rowTiers, tierPricing: getTierPricing(basePrice) };
}

module.exports = { getRoomLayout, getSeatTier, getTierForRowIndex, getTierPricing, buildSeatLayout };
